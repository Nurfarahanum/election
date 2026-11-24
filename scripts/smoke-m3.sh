#!/usr/bin/env bash
set -euo pipefail

: "${ADMIN_EMAIL:?Set ADMIN_EMAIL}"
: "${ADMIN_PASSWORD:?Set ADMIN_PASSWORD}"
origin=${APP_ORIGIN:-https://localhost}
test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt "$test_dir/root.crt" >/dev/null
request=(curl --silent --show-error --cacert "$test_dir/root.crt")
election=feb5c62c-5df0-47a4-94a4-f317744faeab

db() {
  docker compose exec -T postgres psql -U kopetro -d kopetro -Atqc "$1"
}

"${request[@]}" --fail -c "$test_dir/admin" -H "Origin: $origin" --data-urlencode "email=$ADMIN_EMAIL" \
  --data-urlencode "password=$ADMIN_PASSWORD" -o /dev/null "$origin/admin/session"

issue() {
  "${request[@]}" --fail -b "$test_dir/admin" -H "Origin: $origin" -F "electionId=$election" \
    -F action=voter-add -F "name=$1" -F email= "$origin/admin/manage"
}

login() {
  "${request[@]}" -c "$3" -H "Origin: $origin" --data-urlencode "code=$1" \
    --data-urlencode "key=$2" -o /dev/null -w '%{redirect_url}' "$origin/vote/login"
}

submit() {
  "${request[@]}" -b "$1" -H "Origin: $origin" -H 'Content-Type: application/json' \
    --data-binary "$2" -o "$3" -w '%{http_code}' "$origin/vote/submit"
}

issue 'Pengundi Serentak' > "$test_dir/parallel.json"
issue 'Pengundi Had Percubaan' > "$test_dir/locked.json"
issue 'Pengundi Jadual' > "$test_dir/schedule.json"
read_key() { node -p 'require(process.argv[1]).keys[0][process.argv[2]]' "$1" "$2"; }
code=$(read_key "$test_dir/parallel.json" code)
key=$(read_key "$test_dir/parallel.json" key)
locked_code=$(read_key "$test_dir/locked.json" code)
locked_key=$(read_key "$test_dir/locked.json" key)
schedule_code=$(read_key "$test_dir/schedule.json" code)
schedule_key=$(read_key "$test_dir/schedule.json" key)

db "UPDATE \"Election\" SET status='DRAFT', \"startsAt\"=NULL, \"endsAt\"=NULL;" >/dev/null
test "$(login "$code" "$key" "$test_dir/unopened")" = "$origin/vote?ralat=not-open"
db "UPDATE \"Election\" SET status='SCHEDULED', \"startsAt\"=now() - interval '1 minute',
  \"endsAt\"=now() + interval '1 hour';" >/dev/null

for i in {1..5}; do
  test "$(login "$locked_code" 'wrong' "$test_dir/locked-cookie")" = "$origin/vote?ralat=invalid"
done
test "$(login "$locked_code" "$locked_key" "$test_dir/locked-cookie")" = "$origin/vote?ralat=invalid"
test "$(login 'KP-999999' 'wrong' "$test_dir/unknown")" = "$origin/vote?ralat=invalid"
test "$(db 'SELECT count(*) FROM "VoterLoginLimit" WHERE attempts=5 AND "expiresAt" > now() + interval '\''14 minutes'\'';')" = 1
db 'UPDATE "VoterLoginLimit" SET "expiresAt"=now() - interval '\''1 second'\'' WHERE attempts=5;' >/dev/null
test "$(login "$locked_code" "$locked_key" "$test_dir/unlocked")" = "$origin/vote"

test "$(login "${code,,}" "${key,,}" "$test_dir/voter")" = "$origin/vote"
test "$(login "$schedule_code" "$schedule_key" "$test_dir/scheduled")" = "$origin/vote"
"${request[@]}" --fail -b "$test_dir/voter" "$origin/vote" > "$test_dir/ballot.html"
grep -q 'Tidak mengundi untuk jawatan ini' "$test_dir/ballot.html"

pos=$(db "SELECT id FROM \"Position\" WHERE title='Pengerusi';")
pick=$(db "SELECT id FROM \"Candidate\" WHERE name='Dato Rahim Salleh';")
misplaced=$(db "SELECT id FROM \"Candidate\" WHERE name='Puan Rohana Ali';")
valid="[{\"positionId\":\"$pos\",\"candidateIds\":[\"$pick\"]}]"
invalid="[{\"positionId\":\"$pos\",\"candidateIds\":[\"$misplaced\"]}]"
test "$(submit "$test_dir/voter" "$invalid" "$test_dir/invalid.json")" = 400
test "$("${request[@]}" -b "$test_dir/voter" -d "$valid" -o /dev/null -w '%{http_code}' "$origin/vote/submit")" = 403

for i in {1..20}; do
  submit "$test_dir/voter" "$valid" "$test_dir/body-$i" > "$test_dir/status-$i" &
done
wait
test "$(cat "$test_dir"/status-* | fold -w3 | sort | uniq -c | awk '{print $1 ":" $2}' | paste -sd, -)" = '1:200,19:409'
test "$(db 'SELECT count(*) FROM "Ballot";')" = 1
test "$(db "SELECT count(*) FROM \"BallotChoice\" WHERE \"candidateId\"='$pick';")" = 1
test "$(db "SELECT count(*) FROM \"AuditLog\" WHERE actor='VOTER:$code' AND action='VOTE_SUBMITTED' AND detail='{}'::jsonb;")" = 1
test "$(db "SELECT count(*) FROM \"Voter\" WHERE code='$code' AND \"hasVoted\" AND \"votedAt\" IS NOT NULL;")" = 1
"${request[@]}" --fail -b "$test_dir/voter" "$origin/vote" > "$test_dir/done.html"
grep -q 'Undi anda telah direkodkan' "$test_dir/done.html"
"${request[@]}" -b "$test_dir/voter" -H "Origin: $origin" -d '' -o /dev/null "$origin/vote/logout"
test "$(submit "$test_dir/voter" "$valid" "$test_dir/revoked.json")" = 401

db "UPDATE \"Election\" SET \"endsAt\"=now() - interval '1 second';" >/dev/null
test "$(submit "$test_dir/scheduled" '[]' "$test_dir/closed.json")" = 409
test "$(login "$schedule_code" "$schedule_key" "$test_dir/cannot-login")" = "$origin/vote?ralat=closed"

# Exhaust the client-IP bucket and verify that a correct, otherwise eligible login fails.
db "UPDATE \"Election\" SET \"endsAt\"=now() + interval '1 hour';
  UPDATE \"VoterLoginLimit\" SET attempts=300 WHERE attempts > 5;" >/dev/null
test "$(login "$schedule_code" "$schedule_key" "$test_dir/ip-locked")" = "$origin/vote?ralat=invalid"

echo 'Voter login, lockout, scheduled close and exactly one ballot from 20 parallel submissions passed.'
