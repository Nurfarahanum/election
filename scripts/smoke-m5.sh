#!/usr/bin/env bash
set -euo pipefail

: "${ADMIN_EMAIL:?Set ADMIN_EMAIL}"
: "${ADMIN_PASSWORD:?Set ADMIN_PASSWORD}"
origin=${APP_ORIGIN:-https://localhost}
test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt "$test_dir/root.crt" >/dev/null
request=(curl --silent --show-error --cacert "$test_dir/root.crt")
election=6e345cb7-c1d9-4cb4-b67a-d1241a1dce43

db() { docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U kopetro -d kopetro -Atqc "$1"; }
"${request[@]}" --fail -c "$test_dir/admin" -H "Origin: $origin" --data-urlencode "email=$ADMIN_EMAIL" \
  --data-urlencode "password=$ADMIN_PASSWORD" -o /dev/null "$origin/admin/session"

test "$("${request[@]}" -o /dev/null -w '%{http_code}' "$origin/admin/export/pengundi.csv")" = 401
for file in keputusan.csv keputusan.pdf pengundi.csv log-audit.csv; do
  "${request[@]}" --fail -b "$test_dir/admin" -D "$test_dir/$file.headers" \
    "$origin/admin/export/$file" > "$test_dir/$file"
  grep -qi "content-disposition: attachment; filename=\"$file\"" "$test_dir/$file.headers"
done
grep -q 'Calon Jadual' "$test_dir/keputusan.csv"
grep -q 'VOTE_SUBMITTED' "$test_dir/log-audit.csv"
grep -q 'Pengundi Jadual M4' "$test_dir/pengundi.csv"
if grep -qiE 'argon2|kunci pengundi' "$test_dir/pengundi.csv"; then exit 1; fi
verify_pdf() {
  docker compose exec -T -e EXPECTED_PAGES="$1" app node -e '
    const { PDFDocument } = require("pdf-lib");
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    PDFDocument.load(fs.readFileSync(0)).then(doc => assert.equal(doc.getPageCount(), Number(process.env.EXPECTED_PAGES)))
      .catch(error => { console.error(error.message); process.exitCode = 1; });
  ' < "$2"
}
verify_pdf 1 "$test_dir/keputusan.pdf"

db "INSERT INTO \"Election\" (id, name, \"orgName\", \"createdAt\") VALUES ('$election', 'Ujian Edaran', 'Koperasi Kopetro', now());
    INSERT INTO \"Voter\" (id, \"electionId\", code, name, email, \"keyHash\", \"hasVoted\")
    SELECT gen_random_uuid(), '$election', 'T-' || g, 'Pengundi ' || g,
           CASE WHEN g = 1 THEN 'jemputan@example.com' WHEN g = 201 THEN 'sudah@example.com' END,
           (SELECT \"keyHash\" FROM \"Voter\" LIMIT 1), g = 201
    FROM generate_series(1,201) g;" >/dev/null

distribute() {
  "${request[@]}" -b "$test_dir/admin" -H "Origin: $origin" -F "electionId=$election" "$@" "$origin/admin/distribute"
}
test "$("${request[@]}" -b "$test_dir/admin" -o /dev/null -w '%{http_code}' "$origin/admin/export/keputusan.csv")" = 403
distribute --fail -F action=invitations > "$test_dir/invitation.json"
hash_after_invite=$(db "SELECT \"keyHash\" FROM \"Voter\" WHERE \"electionId\"='$election' AND code='T-1';")
distribute --fail -F action=reminders > "$test_dir/reminder.json"
test "$(db "SELECT \"keyHash\" FROM \"Voter\" WHERE \"electionId\"='$election' AND code='T-1';")" = "$hash_after_invite"

mailpit=http://127.0.0.1:8025
curl -fsS "$mailpit/api/v1/messages" > "$test_dir/mail.json"
node - "$test_dir" "$mailpit" <<'JS'
const assert = require("node:assert/strict");
const dir = process.argv[2];
const mailpit = process.argv[3];
(async () => {
  for (const name of ["invitation", "reminder"]) {
    const result = require(`${dir}/${name}.json`);
    assert.deepEqual(result, { sent: 1, failures: [], skipped: [] });
  }
  const { messages } = require(`${dir}/mail.json`);
  assert.equal(messages.length, 2);
  assert(messages.every(message => message.To.length === 1 && message.To[0].Address === "jemputan@example.com"));
  for (const message of messages) {
    const payload = await fetch(`${mailpit}/api/v1/message/${message.ID}`).then(response => response.json());
    assert.match(payload.Text, /ID Pengundi: T-1/);
    assert.match(payload.Text, /https:\/\/localhost\/vote/);
    if (message.Subject.startsWith("Jemputan")) assert.match(payload.Text, /Kunci Pengundi: [A-HJKMNP-Z2-9]{8}/);
    else assert.doesNotMatch(payload.Text, /Kunci Pengundi:/);
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
JS
test "$(db "SELECT count(*) FROM \"AuditLog\" WHERE \"electionId\"='$election' AND action IN ('VOTER_INVITATION','VOTER_REMINDER');")" = 2

started=$(date +%s)
distribute --fail --max-time 30 -D "$test_dir/slips.headers" -F action=slips > "$test_dir/slips.pdf"
elapsed=$(($(date +%s) - started))
test "$elapsed" -lt 30
grep -qi 'content-type: application/pdf' "$test_dir/slips.headers"
grep -qi 'cache-control: private, no-store' "$test_dir/slips.headers"
verify_pdf 25 "$test_dir/slips.pdf"
test "$(db "SELECT count(*) FROM \"Voter\" WHERE \"electionId\"='$election' AND NOT \"hasVoted\" AND \"keyHash\" LIKE '\$argon2id\$%';")" = 200
test "$(db "SELECT detail->>'count' FROM \"AuditLog\" WHERE \"electionId\"='$election' AND action='VOTER_SLIPS';")" = 200

echo "Mailpit received invitation and reminder. Exports passed. 200 voter slips generated in ${elapsed}s."
