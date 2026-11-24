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
