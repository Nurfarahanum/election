#!/usr/bin/env bash
set -euo pipefail

: "${ADMIN_EMAIL:?Set ADMIN_EMAIL}"
: "${ADMIN_PASSWORD:?Set ADMIN_PASSWORD}"
origin=${APP_ORIGIN:-https://localhost}
test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT

for attempt in {1..20}; do
  if docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt "$test_dir/root.crt" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

request=(curl --silent --show-error --cacert "$test_dir/root.crt")
login="$origin/admin/session"
jar="$test_dir/cookies"

test "$("${request[@]}" -o /dev/null -w '%{redirect_url}' "$origin/admin")" = "$origin/admin/login"
"${request[@]}" --fail -D "$test_dir/headers" "$origin/admin/login" > "$test_dir/login.html"
grep -qi 'strict-transport-security: max-age=31536000' "$test_dir/headers"
grep -qi "content-security-policy:.*frame-ancestors 'none'" "$test_dir/headers"
grep -q 'Log masuk admin' "$test_dir/login.html"
test "$("${request[@]}" -d '' -o /dev/null -w '%{http_code}' "$login")" = 403
test "$("${request[@]}" -H "Origin: $origin" --data-urlencode "email=$ADMIN_EMAIL" \
  --data-urlencode 'password=deliberately-wrong' -o /dev/null -w '%{redirect_url}' "$login")" = "$origin/admin/login?ralat=1"
test "$("${request[@]}" -c "$jar" -H "Origin: $origin" --data-urlencode "email=$ADMIN_EMAIL" \
  --data-urlencode "password=$ADMIN_PASSWORD" -D "$test_dir/auth-headers" -o /dev/null -w '%{redirect_url}' "$login")" = "$origin/admin"
grep -qi 'set-cookie: __Host-kopetro-admin=.*Secure.*HttpOnly.*SameSite=lax' "$test_dir/auth-headers"
"${request[@]}" -b "$jar" --fail "$origin/admin" > "$test_dir/admin.html"
grep -q 'Pengerusi' "$test_dir/admin.html"
test "$("${request[@]}" -b "$jar" -d '' -o /dev/null -w '%{http_code}' "$origin/admin/logout")" = 403
test "$("${request[@]}" -b "$jar" -H "Origin: $origin" -d '' \
  -o /dev/null -w '%{redirect_url}' "$origin/admin/logout")" = "$origin/admin/login"
test "$("${request[@]}" -b "$jar" -o /dev/null -w '%{redirect_url}' "$origin/admin")" = "$origin/admin/login"

for attempt in {1..8}; do
  test "$("${request[@]}" -H "Origin: $origin" --data-urlencode "email=$ADMIN_EMAIL" \
    --data-urlencode 'password=deliberately-wrong' -o /dev/null -w '%{redirect_url}' "$login")" = "$origin/admin/login?ralat=1"
done
test "$("${request[@]}" -H "Origin: $origin" -H 'X-Kopetro-Client-IP: 203.0.113.5' \
  --data-urlencode "email=$ADMIN_EMAIL" --data-urlencode "password=$ADMIN_PASSWORD" \
  -o /dev/null -w '%{redirect_url}' "$login")" = "$origin/admin/login?ralat=1"

echo 'HTTPS, admin authentication and rate limit smoke checks passed.'
