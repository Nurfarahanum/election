#!/usr/bin/env bash
set -euo pipefail
: "${KOPETRO_DISPOSABLE_TEST_DB:?Set KOPETRO_DISPOSABLE_TEST_DB=1 for an ephemeral test database}"
test "$KOPETRO_DISPOSABLE_TEST_DB" = 1
tmp=$(mktemp -d)
restored_database=kopetro_restore_check
cleanup() {
  docker compose exec -T postgres dropdb --if-exists -U kopetro "$restored_database" >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT

backup=$(bash scripts/backup.sh "$tmp")
(cd "$backup" && sha256sum --check SHA256SUMS)
docker compose exec -T postgres createdb -U kopetro "$restored_database"
docker compose exec -T postgres pg_restore -U kopetro -d "$restored_database" --exit-on-error --no-owner --no-acl < "$backup/database.dump"
count=$(docker compose exec -T postgres psql -U kopetro -d "$restored_database" -Atqc   "SELECT count(*) FROM \"Ballot\" b JOIN \"Election\" e ON e.id=b.\"electionId\" WHERE e.name='Ujian Beban';")
test "$count" = 200
mkdir "$tmp/photos"
tar -xzf "$backup/photos.tar.gz" -C "$tmp/photos"
test -n "$(find "$tmp/photos" -type f -name '*.webp' -print -quit)"
docker compose up --no-build --wait app >/dev/null
echo "Backup restored with 200 load-test ballots and archived images."
