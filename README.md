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

## Launch and results

Use **Pelancaran** to open voting now, set a start and end in Malaysia time,
or close an open election. The server evaluates the schedule on each request.
An administrator can return an election to draft only before it receives a
ballot. Opening a scheduled election early keeps its scheduled closing time.

**Keputusan** refreshes turnout while visible. Candidate counts are hidden
from administrators until close by default. An administrator can enable a
live view. Once the election closes, publishing lets registered voters use
their ID and key to view the results. The results page displays aggregate
counts and abstentions. A tie at the selection cutoff flags all tied
candidates for review. The audit log records launch, schedule, publication,
and other administrative changes alongside anonymous vote events by voter code.

## Election mail and downloads

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, and your provider's
`SMTP_USER` and `SMTP_PASSWORD` in `.env`. Use `SMTP_SECURE=true` for
implicit TLS (typically port 465). The default requires STARTTLS for
non-implicit connections. The app accepts a sender address without a
display name.

For local testing only, start the optional Mailpit profile and open its inbox
at <http://127.0.0.1:8025>.

```sh
SMTP_HOST=mailpit SMTP_PORT=1025 SMTP_FROM=voting@example.com \
  SMTP_REQUIRE_TLS=false docker compose --profile mail-test up --build --wait
```

In **Pengundi**, choose one unvoted voter, all unvoted voters, or the
no-email group for printed slips. Invitation and slip generation issue fresh
keys and revoke old credentials for the affected voters. Invitations and
reminders go only to unvoted voters with email. Reminders preserve the
existing key. For partial SMTP failures, retry only the affected voter
codes. SMTP acceptance confirms acceptance by the relay. An ambiguous
SMTP disconnect or a database failure after relay acceptance may require
issuing a fresh invitation for that voter. Downloaded slips and invitation
messages contain voter credentials. Handle them as confidential material.

Admin exports are available on **Keputusan**, **Pengundi**, and **Log audit**.
Results exports follow the live-result visibility setting. Voter and audit
CSV files contain no voter keys. CSV preserves Unicode names, and the current
PDF font substitutes unsupported glyphs in printed names and headings.

## Deploy on a VPS

1. Install Docker Engine and the Compose v2 plugin on a supported Linux VPS.
   Assign a hostname and point its DNS records to the server. Allow inbound
   TCP 80 and 443 for Caddy and restrict SSH access to administrators.
2. Clone the approved release and copy `.env.example` to `.env`. Restrict
   read access with `chmod 600 .env`. Set `SEED_DEMO=false`, generate
   independent random database and session secrets, and configure SMTP.
   Set `CADDY_SITE` to the public hostname and `APP_ORIGIN` to its matching
   HTTPS origin. Caddy uses the direct client IP for rate limits. Keep its
   backend and PostgreSQL ports on the Compose network.
3. Start the stack and inspect it.

   ```sh
   docker compose up -d --build --wait
   docker compose ps
   docker compose logs --tail=100 app caddy
   ```

4. Sign in at `/admin/login`, change the initial password under **Tukar kata
   laluan**, and verify the election settings and SMTP sender before the AGM.
   Password changes revoke existing admin sessions. The bootstrap password
   in `.env` is used only to create an account.
5. Schedule nightly backups and rehearse a restore to a separate Compose
   project. See [Backup and restore](docs/restore.md).

### Test a disposable stack

With test credentials in the environment, start Compose, run `npm ci` and
`npx playwright install chromium`, then run:

```sh
KOPETRO_DISPOSABLE_TEST_DB=1 bash scripts/test-m6.sh
KOPETRO_DISPOSABLE_TEST_DB=1 bash scripts/smoke-backup.sh
```

The test runner changes election state and creates synthetic voter records.
Use a fresh disposable database. The load benchmark starts 200 simultaneous
voters and measures the HTTPS journey from submitted credentials to the
successful vote response that displays confirmation. The browser receives
the ballot in the sign-in response. The benchmark verifies every durable
receipt by reopening the page and reports p95 in milliseconds.
