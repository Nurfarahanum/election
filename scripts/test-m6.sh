#!/usr/bin/env bash
# Integration fixture runner for a disposable Compose project only.
set -euo pipefail
: "${KOPETRO_DISPOSABLE_TEST_DB:?Set KOPETRO_DISPOSABLE_TEST_DB=1 for an ephemeral test database}"
test "$KOPETRO_DISPOSABLE_TEST_DB" = 1

db() { docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U kopetro -d kopetro -Atqc "$1"; }
e2e=7195cc5e-c8e1-4efd-a1e5-51ad71977ae1
load=7195cc5e-c8e1-4efd-a1e5-51ad71977ae2
position=7195cc5e-c8e1-4efd-a1e5-51ad71977ae3
candidate=7195cc5e-c8e1-4efd-a1e5-51ad71977ae4
test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT

db "UPDATE \"Election\" SET status='CLOSED'; TRUNCATE \"AdminLoginLimit\", \"VoterLoginLimit\";
  INSERT INTO \"Election\" (id, name, \"orgName\", \"createdAt\") VALUES ('$e2e', 'Ujian E2E', 'Koperasi Kopetro', now());" >/dev/null
npx playwright test

# The shared synthetic hash speeds up provisioning only. Every login still runs Argon2id verification.
hash=$(docker compose exec -T app node -e 'require("@node-rs/argon2").hash("BENCH234").then(console.log)')
db "TRUNCATE \"VoterLoginLimit\";
  INSERT INTO \"Election\" (id, name, \"orgName\", status, \"createdAt\") VALUES ('$load', 'Ujian Beban', 'Koperasi Kopetro', 'OPEN', now());
  INSERT INTO \"Position\" (id, \"electionId\", title, \"sortOrder\", \"maxChoices\") VALUES ('$position', '$load', 'Pengerusi Beban', 0, 1);
  INSERT INTO \"Candidate\" (id, \"positionId\", name, bio, \"sortOrder\") VALUES ('$candidate', '$position', 'Calon Beban', '', 0);
  INSERT INTO \"Voter\" (id, \"electionId\", code, name, \"keyHash\")
  SELECT gen_random_uuid(), '$load', 'LOAD-' || lpad(i::text, 3, '0'), 'Pengundi Beban ' || i, '$hash'
  FROM generate_series(1, 200) AS i;" >/dev/null

docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt "$test_dir/root.crt" >/dev/null
load_status=0
NODE_EXTRA_CA_CERTS="$test_dir/root.crt" node scripts/load-voters.mjs || load_status=$?
test "$(db "SELECT count(*) FROM \"Ballot\" WHERE \"electionId\"='$load';")" = 200
test "$(db "SELECT count(*) FROM \"Voter\" WHERE \"electionId\"='$load' AND \"hasVoted\";")" = 200
test "$(db "SELECT count(*) FROM \"BallotChoice\" WHERE \"positionId\"='$position';")" = 200
echo 'Database verified 200 ballots, voters and choices.'
exit "$load_status"
