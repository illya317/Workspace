# PostgreSQL security operations

This runbook covers the Workspace PostgreSQL role, transport, audit, backup, and recovery controls. Row-level security is intentionally excluded.

## Security boundary

- The long-running application uses a non-owner runtime role with explicit DML grants and bounded sessions.
- Prisma migration uses a separate one-shot login that can `SET ROLE` to a `NOLOGIN` object owner.
- PostgreSQL remains loopback/private-network only. HBA rules are database, role, address, and TLS specific, followed by explicit rejects.
- Runtime, migration, backup, and monitor secrets are separate. A long-running process must not receive `DIRECT_URL` or a shadow URL.
- Production Workspace processes run as `workspace-runtime`, which has no sudo, Docker, LXD, or PostgreSQL system-group membership.
- The systemd unit starts and owns the PM2 daemon before any Workspace process is created. Before each start it kills only a stale daemon from the same `workspace-runtime` user and `PM2_HOME`, then removes only the generated `pm2.pid`; it preserves `dump.pm2`, releases, and source. Verification requires the unit `MainPID`, PM2 pid file, daemon, and every managed application PID to resolve to the same unit cgroup, so namespace and filesystem hardening apply to the live processes rather than only to a later supervisor command.
- The legacy PM2 `jlist` snapshot is streamed directly into the sanitizer and is not persisted as raw `jlist`; the root-mode sanitized migration plan is persisted. Exact pre-cutover PM2 dump and environment snapshots are retained only as mode-`0600`, root-only rollback artifacts, must be treated as credential-bearing, and require an explicit retention or deletion decision after the rollback window.

## SQL settings control plane

The root-only Platform Governance page may create PostgreSQL operation requests, but the web runtime never executes privileged SQL, receives a generated password, or writes a host secret. Requests are strict, bounded `SystemConfig` records under `postgresqlOperationRequest:`. They contain an operation, allowlisted target, expected-current evidence, reason, actor, timestamps, hashed idempotency key, and request fingerprint; password and connection-string fields are forbidden. Corrupt or over-capacity queues fail closed.

The host worker handles only three runtime-role timeouts and runtime-password rotation. Timeout changes compare the observed value with the request, enforce `lock_timeout < statement_timeout`, execute a predeclared statement, and verify the observed result. Password rotation generates the credential on the host, persists its recovery stage in a root-owned mode-`0600` journal, changes the PostgreSQL role and mounted secret as one recoverable workflow, recreates the application, and proves a new connection. A crash after an external side effect cannot be treated as an ordinary retry; unresolved state is recorded as `reconciliation_required`. Worker status and logs contain only short result codes and summaries, never passwords, DSNs, raw SQL, or stderr that may carry secrets.

Installing or enabling a worker remains an environment operation. If no approved worker is installed, requests remain pending; the application must not fall back to applying them itself. The isolated `workspace-dev` environment installs the reviewed worker and one-minute timer from `ops/postgresql/dev`; its executable is pinned to the root-owned `/usr/local/lib/workspace-postgresql-dev` path, and the installer seals the fixed Compose inputs against non-root mutation while preserving uid `1000` access to mounted mode-`0600` secrets. The worker accepts an explicit execution flag, serializes execution, validates the receipt ledger and request HMAC before claiming or mutating work, and recovers only runtime-setting requests left `running` beyond the stale threshold. Password rotation remains skipped unless a root operator approves one exact request key; it recreates only the development app, then proves an application-side database connection to the certificate SAN `db` with the remounted secret. The host backup unit runs as root to read the sealed Compose inputs while the backup container retains its unprivileged uid/gid. Production needs a separately reviewed installation and is not changed by the development worker.

## Local logical backups

`ops/postgresql/backup.sh` creates a custom-format dump, a password-free globals export, a catalog listing, a JSON manifest, and SHA-256 checksums. It uses `umask 077`, `flock`, incomplete staging, and an atomic final rename. Defaults retain seven daily, four weekly, and six monthly restore points.

Install the script at `/usr/local/lib/workspace-postgresql/backup.sh`, create `/var/backups/workspace/postgresql` as `0700 postgres:postgres`, and install the matching systemd service/timer. `/etc/workspace/postgresql/backup.env` is required, root-owned, and no broader than `0640`; it must define `WORKSPACE_POSTGRESQL_BACKUP_URL` for the least-privilege backup role. The script removes the password from child-process command lines and supplies it only through the process environment. A local `postgres` peer fallback is disabled by default and is available only for an explicit manual recovery invocation with `WORKSPACE_POSTGRESQL_ALLOW_LOCAL_PEER_FALLBACK=1`.

The optional `WORKSPACE_POSTGRESQL_OFFSITE_COMMAND` must be an absolute, root-owned, non-writable executable. It receives the completed backup directory and manifest path. It is responsible for authenticated encryption, data residency, immutable retention, and a durable remote receipt. No destination is assumed.

## Restore drill

`restore-drill.sh` verifies checksums and restores the latest dump into an exact PostgreSQL 16.14 Docker image with `network=none`, no published ports, a dedicated labeled volume, CPU/memory limits, and automatic cleanup. It replays the password-free globals export (excluding only the bootstrap `postgres` role that already exists), validates all five hardened role attributes plus the migrator's `SET` membership, and requires positive public-table, applied-migration, and user counts with zero invalid constraints. It then writes a mode-0600 receipt under `/var/lib/workspace/postgresql-restore-drills`.

The weekly timer is evidence that the backup can be restored; it never connects to, renames, or drops a production database.

## TLS

`tls-bootstrap.sh install` creates a private local CA and a server certificate with SANs for `localhost` and `127.0.0.1`. PostgreSQL owns the mode-0600 server key. Each validated key/certificate pair is installed into a private versioned release, and the `current` symlink is replaced atomically; checks compare the certificate and private-key public digests, ownership, mode, issuer, expiry, and SANs. Clients trust `/etc/workspace/postgresql/ca.pem` and use `sslmode=verify-full`; `NODE_EXTRA_CA_CERTS` points to the same CA for Node processes.

Install `postgresql-security.conf` as `/etc/postgresql/16/main/conf.d/30-workspace-security.conf`, validate it with `pg_ctlcluster 16 main reload`, inspect `pg_file_settings`, and prove both a valid connection and rejection with a wrong hostname or CA. The certificate timer fails 30 days before expiry.

## Audit and privacy

The security profile records connections, disconnections, and lock waits with database, role, application, client, and process metadata. It deliberately disables statement, duration, sampling, parameter, and error-statement text logging. `ddl-audit.sql` emits DDL object metadata through event-trigger log messages without recording raw SQL or bind values.

`ddl-audit-rollback.sql` removes only the two managed event triggers and the private `workspace_security` schema. Preserve it with the cutover receipt so audit installation remains independently reversible without restoring application data.

Install the logrotate profile as the PostgreSQL log policy only after backing up the existing distro file; duplicate logrotate entries for the same logfile are invalid.

## PITR gate

PITR is not enabled merely by installing these files. `pitr-check.sh` exits blocked until an approved off-host repository check executable is configured and passes. Only then may a separate reviewed change enable `archive_mode`, configure an archive command, restart PostgreSQL, force a WAL switch, prove `pg_stat_archiver` progress, take a full base backup, and complete a point-in-time restore drill.

Never enable WAL archival before the repository is writable and monitored: a failing archive command can fill `pg_wal` and stop the database.

## Rollback

Before installation, preserve HBA, PostgreSQL config, TLS files, logrotate policy, units, role/ACL inventory, process inventory, and a verified dump. The compatibility rollback restores the `workspace` database and its objects to `workspace_app`, restores migration-ledger access so the legacy deploy gate can run, and sets the four hardened login roles to `NOLOGIN` before the previous HBA and application process are restored. Reapplying `production-roles.sql` transfers ownership back to `workspace_owner` and re-enables the split credentials. A rollback therefore also requires the hardened backup/restore timers to remain stopped until reapplication; keep all receipts and backup evidence immutable.

Install the complete `production-*` runtime tool set with `production-install.sh --execute`. It atomically places root-owned, non-writable tools under `/usr/local/lib/workspace-postgresql`, leaves SQL readable by the `postgres` OS account, and `production-security.sh` refuses to prepare or mutate from a source checkout. During rollback the original HBA is restored before legacy PM2 processes are started; rollback SQL conditionally handles hardened roles that were not yet created by an interrupted apply.
