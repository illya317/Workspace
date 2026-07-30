# Secure PostgreSQL development runtime template

This template separates the long-running Workspace application from the one-shot Prisma migrator. It applies only to the development service on `127.0.0.1:3100`; it does not modify production and does not implement RLS.

Security contract:

- `app` receives only `workspace_dev_runtime_password` and the CA certificate.
- `migrate` is a one-shot profile and receives only the migrator password and CA certificate.
- The DB entrypoint runs as root only long enough to atomically copy the five local Compose password secrets plus HBA, ident, and role SQL into PostgreSQL-owned `0700` tmpfs directories with `0400` private files. Fresh init, server startup, and role rotation read only those copies.
- The PostgreSQL server key is mounted only into `db`; the CA private key remains on the host.
- Every TCP client uses TLS `verify-full`; the server certificate contains `DNS:db`.
- PostgreSQL is attached only to `workspace-dev-db-internal`. The app joins that network and the pre-created external `workspace-dev-edge` network.
- `market-data` remains owned by `/home/ubuntu/workspace-dev/compose.yaml`; its override keeps both the legacy network and external edge network. The secure project never defines or recreates it.
- The app depends only on DB health, never on migration. The watchdog must be repointed to the secure Compose file and may restart only `app`.
- SQL text and bind values are not logged: statement logging and slow-query logging are disabled, error-statement logging is limited to `panic`, and parameter logging is zero. Event triggers emit only sanitized DDL metadata.
- Port exposure remains `127.0.0.1:3100:3000`; PostgreSQL has no published port and no login bypass is introduced.

## Install without applying

From the repository root:

```bash
ops/postgresql/dev/install.sh --target /home/ubuntu/workspace-dev/postgresql-security
```

The installer refuses a non-empty destination and only copies templates. It does not touch Compose, containers, databases, secrets, certificates, systemd, or the current source checkout.

## Prepare private inputs

Inside the installed directory:

```bash
cp .env.example .env
cp app.env.example app.env
./generate-secrets.sh ./secrets
./generate-tls.sh ./tls
```

Merge the existing non-database app settings into `app.env`. Preserve `MARKET_INTELLIGENCE_AKTOOLS_BASE_URL=http://market-data:8080`. The file must not contain `DATABASE_URL`, `DIRECT_URL`, `SHADOW_DATABASE_URL`, `PGPASSWORD`, or `PGOPTIONS`. Keep the directory mode `0700`, secret/key modes `0600`, and do not copy it into the source checkout.

Before applying, verify that `172.29.31.0/24` does not overlap another host or Docker network. The HBA CIDR and Compose IPAM subnet are one atomic setting and must be changed together.

Validate both projects without resolving private env files:

```bash
docker compose \
  --project-name workspace-dev-secure \
  --env-file /home/ubuntu/workspace-dev/postgresql-security/.env \
  --file /home/ubuntu/workspace-dev/postgresql-security/compose.yaml \
  config --no-env-resolution --quiet

docker compose \
  --project-name workspace-dev \
  --file /home/ubuntu/workspace-dev/compose.yaml \
  --file /home/ubuntu/workspace-dev/postgresql-security/compose.market-data.override.yaml \
  config --no-env-resolution --quiet
```

## Keep market-data available across the cutover

Create the shared edge network once, then attach the already-running market-data container without recreating it:

```bash
docker network inspect workspace-dev-edge >/dev/null 2>&1 || \
  docker network create workspace-dev-edge

if docker inspect workspace-dev-market-data \
  --format '{{json .NetworkSettings.Networks}}' | grep -q 'workspace-dev-edge'; then
  docker network disconnect workspace-dev-edge workspace-dev-market-data
fi
docker network connect --alias market-data \
  workspace-dev-edge workspace-dev-market-data
```

Disconnecting only edge does not affect the existing app, which continues to use `workspace-dev-network`. Reconnecting with the explicit alias guarantees that the secure app resolves the same container as `market-data`. From this point onward, every market-data create/rebuild must use both Compose files so the edge attachment and alias are durable:

```bash
docker compose \
  --project-name workspace-dev \
  --file /home/ubuntu/workspace-dev/compose.yaml \
  --file /home/ubuntu/workspace-dev/postgresql-security/compose.market-data.override.yaml \
  up -d --no-deps market-data
```

Do not run `up app` or `up db` through the legacy project after the secure cutover. The secure project owns those two services; the legacy project owns only market-data.

## Existing-volume cutover

1. Acquire a watchdog suppression lease and record its ID.
2. Create and validate a pre-cutover dump before changing credentials or HBA.
3. Save the current Compose, app env, HBA, role/ACL/owner inventory, and their SHA-256 values.
4. Validate both Compose combinations with the commands above, without printing resolved env files.
5. Attach the running market-data container to edge. Stop and remove only the legacy `app` and `db` containers, preserving the named volume and market-data:

   ```bash
   docker compose --project-name workspace-dev \
     --file /home/ubuntu/workspace-dev/compose.yaml stop app db
   docker compose --project-name workspace-dev \
     --file /home/ubuntu/workspace-dev/compose.yaml rm -f app db
   ```

6. Start secure DB, preserving `workspace-dev-postgres-data`, then apply roles through the DB-local peer mapping:

   ```bash
   docker compose --project-name workspace-dev-secure \
     --env-file /home/ubuntu/workspace-dev/postgresql-security/.env \
     --file /home/ubuntu/workspace-dev/postgresql-security/compose.yaml up -d db
   docker compose --project-name workspace-dev-secure \
     --env-file /home/ubuntu/workspace-dev/postgresql-security/.env \
     --file /home/ubuntu/workspace-dev/postgresql-security/compose.yaml \
     exec --user postgres -T db \
     psql -X -v ON_ERROR_STOP=1 -U workspace_dev -d postgres \
     -f /var/lib/postgresql/tls/private/roles-and-grants.sql
   ```

7. Run the one-shot migration and its post-migration grant refresh:

   ```bash
   docker compose --project-name workspace-dev-secure \
     --env-file /home/ubuntu/workspace-dev/postgresql-security/.env \
     --file /home/ubuntu/workspace-dev/postgresql-security/compose.yaml \
     --profile migration run --rm migrate
   ```

8. Run read-only verification, create a second validated backup, then start app:

   ```bash
   docker compose --project-name workspace-dev-secure \
     --env-file /home/ubuntu/workspace-dev/postgresql-security/.env \
     --file /home/ubuntu/workspace-dev/postgresql-security/compose.yaml \
     --profile verify run --rm verify
   docker compose --project-name workspace-dev-secure \
     --env-file /home/ubuntu/workspace-dev/postgresql-security/.env \
     --file /home/ubuntu/workspace-dev/postgresql-security/compose.yaml \
     --profile backup run --rm backup
   docker compose --project-name workspace-dev-secure \
     --env-file /home/ubuntu/workspace-dev/postgresql-security/.env \
     --file /home/ubuntu/workspace-dev/postgresql-security/compose.yaml up -d app
   ```

9. Atomically switch the watchdog to the installed app-only Compose wrapper, then inspect the effective unit:

   ```bash
   cd /home/ubuntu/workspace-dev/postgresql-security
   sudo ./switch-watchdog.sh apply
   sudo ./switch-watchdog.sh status
   ```

   The wrapper always uses fixed absolute Compose paths and `up -d --no-deps app`; it cannot start DB, migration, or market-data services. Verify `/test/login`, `/test/api/internal/health`, that `/test/api/auth/dev-login-bypass` remains 404, and that production `/workspace` remains healthy. Release the watchdog lease in a `finally` path.

At container start, root copies HBA, ident, and role SQL from root-only bootstrap mounts into PostgreSQL-owned tmpfs files. Fresh volumes run the copied role SQL through `/docker-entrypoint-initdb.d`; existing volumes require the explicit DB-local command above against the copied tmpfs path. The role script transfers non-extension public relations, routines, standalone types, and the public schema away from legacy `workspace_dev` in both `workspace_dev` and `workspace_dev_shadow`; serial and identity sequences follow their owning table automatically. Verification fails unless the migrator can `SET ROLE workspace_dev_owner`, owns the shadow database and public schema, can create there, and leaves zero non-extension public objects owned by the legacy role. `migrate-app.sh` refreshes main-database grants after every migration and removes runtime access to `_prisma_migrations`.

## Automated verified backups

The backup container creates a custom-format dump, validates its catalog with `pg_restore --list`, writes and rechecks a SHA-256 manifest, and only then removes matching dump/manifest files older than seven days. Install the host timer after the secure DB is healthy:

```bash
sudo install -m 0644 \
  /home/ubuntu/workspace-dev/postgresql-security/systemd/workspace-dev-postgresql-backup.service \
  /etc/systemd/system/workspace-dev-postgresql-backup.service
sudo install -m 0644 \
  /home/ubuntu/workspace-dev/postgresql-security/systemd/workspace-dev-postgresql-backup.timer \
  /etc/systemd/system/workspace-dev-postgresql-backup.timer
sudo systemctl daemon-reload
sudo systemctl enable --now workspace-dev-postgresql-backup.timer
sudo systemctl start workspace-dev-postgresql-backup.service
```

The unit uses fixed absolute Compose and env paths, runs as `ubuntu`, writes failures to the journal, and never references host port 3000 or production `/workspace`. Verify scheduling and the latest artifact:

```bash
systemctl list-timers workspace-dev-postgresql-backup.timer
systemctl status workspace-dev-postgresql-backup.service --no-pager
journalctl -u workspace-dev-postgresql-backup.service -n 100 --no-pager
latest_manifest="$(find /home/ubuntu/workspace-dev/backups/postgresql -maxdepth 1 \
  -type f -name 'workspace-dev-*.dump.sha256' -print | sort | tail -n 1)"
test -n "${latest_manifest}"
(cd "$(dirname "${latest_manifest}")" && sha256sum --check "$(basename "${latest_manifest}")")
```

## Rollback

Role creation and ownership changes are additive; do not drop the new roles or restore database data during the observation window unless an invariant or restore comparison proves corruption.

The supported runtime rollback keeps the new source entrypoint. Before switching the watchdog to legacy Compose, update `/home/ubuntu/workspace-dev/runtime/.workspace/.env` privately so it contains the rotated legacy-admin `DATABASE_URL` and removes `DIRECT_URL`, `SHADOW_DATABASE_URL`, `PGPASSWORD`, and `PGOPTIONS`. Do not print the URL. Preserve a mode-`0600` backup and its SHA-256 first, then run:

```bash
cd /home/ubuntu/workspace-dev/postgresql-security
sudo ./switch-watchdog.sh rollback
sudo ./switch-watchdog.sh status
```

Rollback validation fails closed unless the legacy env is runtime-only. The installed wrapper still performs only `stop app` and `up -d --no-deps app`; migrations remain a separate one-shot command. Restore the saved legacy Compose/HBA files only after that validation, keep market-data on both networks, and use the new `postgres_admin_password` rather than the retired password.

Restoring the old source entrypoint is outside this automated rollback. It requires a recorded source commit/tree hash, the saved pre-cutover runtime contract, and a separate approval because it reintroduces migration credentials into a long-running process. The original `workspace_dev` superuser remains reachable by the DB container's local peer mapping and has no TCP HBA rule.
