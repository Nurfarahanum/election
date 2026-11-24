#!/usr/bin/env bash
set -euo pipefail

: "${ADMIN_EMAIL:?Set ADMIN_EMAIL}"
: "${ADMIN_PASSWORD:?Set ADMIN_PASSWORD}"
origin=${APP_ORIGIN:-https://localhost}
test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt "$test_dir/root.crt" >/dev/null
request=(curl --silent --show-error --cacert "$test_dir/root.crt")
election=7195cc5e-c8e1-4efd-a1e5-51ad71977ae0

db() { docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U kopetro -d kopetro -Atqc "$1"; }

# Start a fresh test election after the previous smoke suites.
db "UPDATE \"Election\" SET status='CLOSED'; TRUNCATE \"AdminLoginLimit\", \"VoterLoginLimit\";
  INSERT INTO \"Election\" (id, name, \"orgName\", \"createdAt\") VALUES ('$election', 'Ujian Jadual', 'Koperasi Kopetro', now());" >/dev/null
"${request[@]}" --fail -c "$test_dir/admin" -H "Origin: $origin" --data-urlencode "email=$ADMIN_EMAIL" \
  --data-urlencode "password=$ADMIN_PASSWORD" -o /dev/null "$origin/admin/session"
admin_page() { "${request[@]}" --fail -b "$test_dir/admin" "$origin/admin/$1" > "$test_dir/admin-page"; }
manage() {
  "${request[@]}" -b "$test_dir/admin" -H "Origin: $origin" -F "electionId=$election" "$@" "$origin/admin/manage"
}
manage --fail -F action=election-open >/dev/null
admin_page launch
grep -q 'Sedang dibuka' "$test_dir/admin-page"
manage --fail -F action=election-close >/dev/null
manage --fail -F action=election-draft >/dev/null
manage --fail -F action=position-add -F 'title=Jawatankuasa Ujian' -F maxChoices=1 >/dev/null
position=$(db "SELECT id FROM \"Position\" WHERE \"electionId\"='$election';")
manage --fail -F action=candidate-add -F "positionId=$position" -F 'name=Calon Jadual' -F bio= >/dev/null
candidate=$(db "SELECT id FROM \"Candidate\" WHERE \"positionId\"='$position';")
manage --fail -F action=voter-add -F 'name=Pengundi Jadual M4' -F email= > "$test_dir/key.json"
key=$(node -p 'require(process.argv[1]).keys[0].key' "$test_dir/key.json")
code=$(node -p 'require(process.argv[1]).keys[0].code' "$test_dir/key.json")
selection="[{\"positionId\":\"$position\",\"candidateIds\":[\"$candidate\"]}]"

login() {
  "${request[@]}" -c "$test_dir/voter" -H "Origin: $origin" --data-urlencode "code=$code" \
    --data-urlencode "key=$key" -o /dev/null -w '%{redirect_url}' "$origin/vote/login"
}
submit() {
  "${request[@]}" -b "$test_dir/voter" -H "Origin: $origin" -H 'Content-Type: application/json' \
    --data-binary "$selection" -o /dev/null -w '%{http_code}' "$origin/vote/submit"
}
voter_page() { "${request[@]}" -sS --fail -b "$test_dir/voter" "$origin/vote" > "$test_dir/vote-page"; }

now=$(date +%s)
starts=$(TZ=Asia/Kuala_Lumpur date -d "@$((now + 9))" +%Y-%m-%dT%H:%M:%S)
ends=$(TZ=Asia/Kuala_Lumpur date -d "@$((now + 24))" +%Y-%m-%dT%H:%M:%S)
test "$(manage -F action=election-schedule -F "startsAt=$ends" -F "endsAt=$starts" -o /dev/null -w '%{http_code}')" = 400
manage --fail -F action=election-schedule -F "startsAt=$starts" -F "endsAt=$ends" >/dev/null
test "$(db "SELECT extract(epoch FROM \"startsAt\")::int FROM \"Election\" WHERE id='$election';")" = "$((now + 9))"
admin_page launch
grep -q 'Dijadualkan' "$test_dir/admin-page"
test "$(login)" = "$origin/vote?ralat=not-open"
test "$(manage -F action=results-publish -F enabled=true -o /dev/null -w '%{http_code}')" = 409

for i in {1..15}; do
  admin_page launch
  if grep -q 'Buka undian sekarang' "$test_dir/admin-page"; then sleep 1; else break; fi
done
grep -q 'Tutup undian' "$test_dir/admin-page"
test "$(login)" = "$origin/vote"
test "$(submit)" = 200

admin_page results
grep -q '1 daripada 1 pengundi' "$test_dir/admin-page"
if grep -q 'Calon Jadual' "$test_dir/admin-page"; then exit 1; fi
manage --fail -F action=results-visibility -F enabled=false >/dev/null
admin_page results
grep -q 'Calon Jadual' "$test_dir/admin-page"
manage --fail -F action=results-visibility -F enabled=true >/dev/null
voter_page
if grep -q 'Calon Jadual' "$test_dir/vote-page"; then exit 1; fi

for i in {1..25}; do
  admin_page launch
  if grep -q 'Status:.*Ditutup' "$test_dir/admin-page"; then break; else sleep 1; fi
done
grep -q 'Ditutup' "$test_dir/admin-page"
test "$(db "SELECT status FROM \"Election\" WHERE id='$election';")" = SCHEDULED
test "$(manage -F action=election-draft -o /dev/null -w '%{http_code}')" = 409
test "$(login)" = "$origin/vote?ralat=closed"
manage --fail -F action=results-publish -F enabled=true >/dev/null
test "$(login)" = "$origin/vote"
voter_page
grep -q 'Undi anda telah direkodkan' "$test_dir/vote-page"
grep -q 'Calon Jadual' "$test_dir/vote-page"
test "$(submit)" = 409
manage --fail -F action=results-publish -F enabled=false >/dev/null
voter_page
if grep -q 'Calon Jadual' "$test_dir/vote-page"; then exit 1; fi

admin_page audit
grep -q 'Jadual disimpan' "$test_dir/admin-page"
grep -q 'Penerbitan keputusan diubah' "$test_dir/admin-page"
grep -q "VOTER:$code" "$test_dir/admin-page"
test "$(db "SELECT count(*) FROM \"AuditLog\" WHERE \"electionId\"='$election' AND action='RESULTS_PUBLISH';")" = 2
echo 'Launch, automatic scheduling in Malaysia time, live turnout, gated publication and audit checks passed.'
