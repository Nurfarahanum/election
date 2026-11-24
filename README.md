# Kopetro AGM Online Voting

## Start milestone M1 locally

Use Docker with Compose v2. Copy `.env.example` to `.env`, then set a unique
admin password of at least 12 characters and fill in both secret fields. Use
`openssl rand -hex 32` separately for each secret.

```sh
docker compose up --build --wait
```

For local HTTPS, export Caddy's local CA and trust it in your development
browser or operating system.

```sh
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./kopetro-local-ca.crt
```

Open <https://localhost/admin/login> and use `ADMIN_EMAIL` and
`ADMIN_PASSWORD`. Caddy redirects plain HTTP to HTTPS. The application and
database ports stay inside the Compose network.

On first startup, the app applies Prisma migrations and creates the configured
admin and a draft election. `SEED_DEMO=true` populates a new database with
the prototype's three positions, eight candidates and twelve voters. Demo
keys are hashed and discarded. The configured password is used when creating
the account. An existing account keeps its password when the container
restarts. Set `SEED_DEMO=false` before first startup for a blank ballot.

For source checks, use Node.js 24 and run `npm ci`, `npm run lint`,
`npm run typecheck` and `npm test`.

For a public HTTPS deployment, set `CADDY_SITE` to your public hostname,
set `APP_ORIGIN` to its HTTPS origin and point DNS to the server. Caddy
needs access to ports 80 and 443.

## Manage a ballot and voter list

The **Ballot** tab manages positions, maximum choices, candidates and candidate
photos. Photos are cropped to a centered square and written as 400×400 WebP
files to the `candidate_photos` Compose volume. Back up that volume with the
database if you need to retain photos.

In **Pengundi**, upload a UTF-8 CSV or the first worksheet of an XLSX file
with two columns, `nama,emel`. A header row and the second column are optional.
Each upload supports up to 500 data rows and 1 MiB. Preview and correct any
errors before importing. Duplicates match by email (case-insensitive) or, for
entries without email, by normalized name. An import is applied as one batch.

Keys appear only in the successful creation or regeneration response. Record
them before dismissing the list or leaving the page. Regeneration invalidates
the old key. The voter list and audit records contain no plaintext keys.

## Voter flow

Voters visit `/vote` and use their ID and key. Both are case-insensitive.
A voter code locks for 15 minutes after five wrong keys. The app uses the client IP from Caddy to apply a database-backed login budget of 300 attempts per IP per
15-minute window so voters can share an AGM venue network.

The ballot displays a review before final submission. Unselected positions
count as abstentions. Successful submissions mark the voter and write an
anonymous ballot in the same PostgreSQL transaction. The confirmation page
shows that voting is complete. A voter session expires after four hours and
is invalidated when an administrator regenerates the key.

Opening and scheduling through the admin UI are part of milestone M4. The
Compose smoke test sets a test election's schedule directly in its disposable
database to exercise the M3 flow.
