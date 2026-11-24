#!/usr/bin/env bash
set -euo pipefail

: "${ADMIN_EMAIL:?Set ADMIN_EMAIL}"
: "${ADMIN_PASSWORD:?Set ADMIN_PASSWORD}"
origin=${APP_ORIGIN:-https://localhost}
test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt "$test_dir/root.crt" >/dev/null
request=(curl --silent --show-error --cacert "$test_dir/root.crt")
jar="$test_dir/cookies"
election=feb5c62c-5df0-47a4-94a4-f317744faeab

"${request[@]}" --fail -c "$jar" -H "Origin: $origin" --data-urlencode "email=$ADMIN_EMAIL" \
  --data-urlencode "password=$ADMIN_PASSWORD" -o /dev/null "$origin/admin/session"

manage() {
  "${request[@]}" -b "$jar" -H "Origin: $origin" -F "electionId=$election" "$@" "$origin/admin/manage"
}
db() {
  docker compose exec -T postgres psql -U kopetro -d kopetro -Atqc "$1"
}

node - "$test_dir" <<'JS'
const fs = require("node:fs");
const dir = process.argv[2];
const rows = Array.from({ length: 200 }, (_, i) => `Pengundi Ujian ${i},test${i}@example.com`);
fs.writeFileSync(`${dir}/good.csv`, ["nama,emel", ...rows].join("\n"));
rows[2] = "Nama tanpa emel sah,broken";
rows[50] = ",empty@example.com";
rows[199] = "Berulang,TEST0@example.com";
fs.writeFileSync(`${dir}/bad.csv`, ["nama,emel", ...rows].join("\n"));
fs.copyFileSync("docs/kopetro.png", `${dir}/candidate.png`);
JS

manage --fail -F action=import-preview -F "file=@$test_dir/bad.csv" > "$test_dir/preview.json"
node - "$test_dir/preview.json" <<'JS'
const assert = require("node:assert/strict");
const { rows } = require(process.argv[2]);
assert.equal(rows.length, 200);
assert.deepEqual(rows.filter(r => r.errors.length).map(r => r.row), [4, 52, 201]);
JS
test "$(manage -F action=import-commit -F "file=@$test_dir/bad.csv" -o /dev/null -w '%{http_code}')" = 422

manage --fail -D "$test_dir/import-headers" -F action=import-commit -F "file=@$test_dir/good.csv" > "$test_dir/import.json"
grep -qi 'cache-control: private, no-store' "$test_dir/import-headers"
node - "$test_dir/import.json" <<'JS'
const assert = require("node:assert/strict");
const { keys } = require(process.argv[2]);
assert.equal(keys.length, 200);
assert.equal(new Set(keys.map(k => k.code)).size, 200);
assert(keys.every(k => /^[A-HJKMNP-Z2-9]{8}$/.test(k.key)));
JS
test "$(db "SELECT count(*) FROM \"Voter\" WHERE \"keyHash\" LIKE '\$argon2id\$%';")" = 212

manage --fail -F action=voter-add -F 'name=Pengundi Tunggal' -F 'email=tunggal@example.com' > "$test_dir/added.json"
voter_id=$(db "SELECT id FROM \"Voter\" WHERE email = 'tunggal@example.com';")
manage --fail -F action=voter-regenerate -F "voterId=$voter_id" > "$test_dir/regenerated.json"
old_key=$(node -p 'require(process.argv[1]).keys[0].key' "$test_dir/added.json")
new_key=$(node -p 'require(process.argv[1]).keys[0].key' "$test_dir/regenerated.json")
test "$old_key" != "$new_key"
test "$(db "SELECT count(*) FROM \"Voter\" WHERE \"keyHash\" IN ('$old_key', '$new_key');")" = 0
test "$(db "SELECT count(*) FROM \"AuditLog\" WHERE detail::text LIKE '%$new_key%' OR detail::text LIKE '%$old_key%';")" = 0
docker compose exec -T -e M2_OLD_KEY="$old_key" -e M2_NEW_KEY="$new_key" app node - <<'JS'
const assert = require("node:assert/strict");
const { PrismaClient } = require("@prisma/client");
const { verify } = require("@node-rs/argon2");
const prisma = new PrismaClient();
(async () => {
  const voter = await prisma.voter.findFirstOrThrow({ where: { email: "tunggal@example.com" } });
  assert.equal(await verify(voter.keyHash, process.env.M2_OLD_KEY), false);
  assert.equal(await verify(voter.keyHash, process.env.M2_NEW_KEY), true);
})().catch(() => { process.exitCode = 1; }).finally(() => prisma.$disconnect());
JS
"${request[@]}" --fail -b "$jar" "$origin/admin/voters" > "$test_dir/voters.html"
grep -q 'Pengundi Tunggal' "$test_dir/voters.html"
if grep -qF "$new_key" "$test_dir/voters.html"; then exit 1; fi
manage --fail -F action=voter-remove -F "voterId=$voter_id" > /dev/null
test "$(db "SELECT count(*) FROM \"Voter\" WHERE id = '$voter_id';")" = 0

manage --fail -F action=position-add -F 'title=Jawatan Ujian' -F maxChoices=2 >/dev/null
position_id=$(db "SELECT id FROM \"Position\" WHERE title = 'Jawatan Ujian';")
manage --fail -F action=candidate-add -F "positionId=$position_id" -F 'name=Calon Ujian' -F 'bio=Biografi ringkas' \
  -F "photo=@$test_dir/candidate.png" >/dev/null
photo=$(db "SELECT \"photoPath\" FROM \"Candidate\" WHERE name = 'Calon Ujian';")
"${request[@]}" --fail -D "$test_dir/image-headers" "$origin$photo" > "$test_dir/photo.webp"
grep -qi 'content-type: image/webp' "$test_dir/image-headers"
docker compose exec -T -e M2_PHOTO="${photo##*/}" app node - <<'JS'
const assert = require("node:assert/strict");
const sharp = require("sharp");
sharp(`${process.env.CANDIDATE_PHOTO_DIR}/${process.env.M2_PHOTO}`).metadata().then(({ width, height, format }) => {
  assert.deepEqual([width, height, format], [400, 400, "webp"]);
}).catch(() => { process.exitCode = 1; });
JS

db "UPDATE \"Election\" SET status='OPEN'; UPDATE \"Voter\" SET \"hasVoted\"=true WHERE code='KP-001';" >/dev/null
voted_id=$(db "SELECT id FROM \"Voter\" WHERE code='KP-001';")
test "$(manage -F action=position-remove -F "positionId=$position_id" -o /dev/null -w '%{http_code}')" = 409
test "$(manage -F action=voter-remove -F "voterId=$voted_id" -o /dev/null -w '%{http_code}')" = 409
manage --fail -F action=voter-regenerate -F "voterId=$voted_id" >/dev/null
test "$(db "SELECT count(*) FROM \"Voter\" WHERE id = '$voted_id' AND \"hasVoted\";")" = 1
manage --fail -F action=voter-add -F name='Pengundi Semasa Undian' -F email='' >/dev/null
test "$(db "SELECT count(*) FROM \"AuditLog\" WHERE action='VOTER_ADD';")" = 2
echo 'Ballot builder, photo processing, 200-row import and voter key checks passed.'
