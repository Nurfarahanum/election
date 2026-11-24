# Protected preview on Vercel

This preview is for synthetic election data. Keep Vercel Authentication
enabled for Preview deployments and use a dedicated PostgreSQL database.
Do not attach the database for an operational election.

1. Connect this repository to the Vercel project and deploy
   `kopetro/vercel-preview` as a Preview. Use Node.js 24, the Next.js
   preset, and Singapore (`sin1`).
2. Add `DATABASE_URL` and a random `SESSION_SECRET` of at least 32 characters
   to the Preview environment only. Use a pooled PostgreSQL connection
   where the provider offers one. Expose Vercel system environment variables.
   The application accepts the generated deployment URL as its HTTPS origin.
   Set `APP_ORIGIN` explicitly if a single stable hostname is preferred.
3. Against the separate preview database, apply migrations with a direct
   or session-mode connection and create the synthetic election and the
   initial preview admin. Supply `DATABASE_URL`, `ADMIN_EMAIL`, and
   `ADMIN_PASSWORD` via secure local environment variables.

   ```sh
   npm ci
   npx prisma migrate deploy
   SEED_DEMO=true npm run seed
   ```

   For Supabase, use a private schema, such as by adding `schema=kopetro`
   to both connection URLs, and keep that schema out of the Data API.
   Voter keys for the seeded accounts can be regenerated in the admin UI.
4. Open the generated protected URL and sign in with the preview admin.
   Verify the admin and voter logins, duplicate-vote prevention, result
   publication and downloads. Leave SMTP unset for initial testing.
   Vercel preview stores processed images in PostgreSQL and accepts image
   uploads of up to 4 MiB. Docker deployments keep using the image volume.
5. Run the 200-voter test separately on disposable preview fixtures before
   treating CI timings as evidence of capacity on Vercel.
