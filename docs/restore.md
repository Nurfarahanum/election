# Backup and restore

## Schedule backups

Run the script as a user who can run Docker Compose. It briefly stops the
application to capture the database and uploaded images together, then starts
the application again if it was running. Pick a time outside any voting
window. The script relies on Linux `flock`, `tar`, and `sha256sum`.

```sh
bash scripts/backup.sh /srv/kopetro-backups
```

For a VPS using UTC, the following user crontab entry runs at 02:00 MYT.
Adjust the path to the checkout and prepare a writable log directory.

```cron
0 18 * * * cd /srv/kopetro && /usr/bin/bash scripts/backup.sh /srv/kopetro-backups >> /srv/kopetro-backups/backup.log 2>&1
```

Each timestamped directory holds `database.dump`, `photos.tar.gz`, and
`SHA256SUMS`. Store encrypted copies off the VPS with restricted access.
Keep the deployment's environment configuration in your secrets manager.
Apply the organisation's agreed retention policy to backups and logs.

## Restore into a fresh project

1. Check out the application version associated with the backup and configure
   `.env` for the destination. Use a fresh Compose project and volumes.
2. Check the backup files, start PostgreSQL and build the application image.

   ```sh
   export COMPOSE_PROJECT_NAME=kopetro-recovery
   export KOPETRO_BACKUP=/absolute/path/to/kopetro-YYYYMMDDTHHMMSSZ
   (cd "$KOPETRO_BACKUP" && sha256sum --check SHA256SUMS)
   docker compose up -d --wait postgres
   docker compose build app
   ```

3. Restore the database and images while the app is stopped.

   ```sh
   docker compose exec -T postgres pg_restore -U kopetro -d kopetro \
     --exit-on-error --no-owner --no-acl < "$KOPETRO_BACKUP/database.dump"
   docker compose run --rm --no-deps -T --entrypoint tar app \
     -C /app/candidate-photos -xzf - < "$KOPETRO_BACKUP/photos.tar.gz"
   ```

4. Revoke restored sessions before bringing the recovery service online.
   Stop the old Caddy instance or move DNS only when the replacement is
   ready to take over the HTTPS hostname.

   ```sh
   docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U kopetro -d kopetro \
     -c 'TRUNCATE "AdminSession", "VoterSession", "AdminLoginLimit", "VoterLoginLimit";'
   docker compose up -d --wait
   ```

5. Compare the voters, turnout, published state, audit history and uploaded
   images with the expected backup. Scheduled opening and closing still use
   the current clock. Votes or key changes after the backup time need
   reconciliation with the returning officer before reopening or publishing.
