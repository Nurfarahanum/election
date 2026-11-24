#!/usr/bin/env bash
set -euo pipefail
umask 077

repo_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_dir"
destination=${1:-"$repo_dir/backups"}
mkdir -p "$destination"
destination=$(cd "$destination" && pwd)
exec 9>"$destination/.backup.lock"
flock -n 9 || { echo "Another Kopetro backup is running." >&2; exit 1; }

stamp=$(date -u +%Y%m%dT%H%M%SZ)
stage=$(mktemp -d "$destination/.kopetro-${stamp}-XXXXXX")
restart_app=false

cleanup() {
  local status=$?
  trap - EXIT
  if "$restart_app"; then docker compose start app >&2 || status=1; fi
  if [[ -d "$stage" ]]; then rm -rf -- "$stage"; fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if [[ -n "$(docker compose ps --status running -q app)" ]]; then
  restart_app=true
  docker compose stop app >&2
fi

docker compose exec -T postgres pg_dump -U kopetro -d kopetro --format=custom --no-owner --no-acl > "$stage/database.dump"
docker compose run --rm --no-deps -T --entrypoint tar app -C /app/candidate-photos -czf - . > "$stage/photos.tar.gz"
test -s "$stage/database.dump"
test -s "$stage/photos.tar.gz"
docker compose exec -T postgres pg_restore --list < "$stage/database.dump" >/dev/null
tar -tzf "$stage/photos.tar.gz" >/dev/null
(cd "$stage" && sha256sum database.dump photos.tar.gz > SHA256SUMS)

final="$destination/kopetro-$stamp"
test ! -e "$final"
mv -T -- "$stage" "$final"
echo "$final"
