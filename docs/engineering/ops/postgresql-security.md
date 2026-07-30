# PostgreSQL security operations

This runbook covers the Workspace PostgreSQL role, transport, audit, backup, and recovery controls. Row-level security is intentionally excluded.

## Security boundary

- The long-running application uses a non-owner runtime role with explicit DML grants and bounded sessions.
- Prisma migration uses a separate one-shot login that can `SET ROLE` to a `NOLOGIN` object owner.
- PostgreSQL remains loopback/private-network only. HBA rules are database, role, address, and TLS specific, followed by explicit rejects.
- Runtime, migration, backup, and monitor secrets are separate. A long-running process must not receive `DIRECT_URL` or a shadow URL.
- Production Workspace processes run as `workspace-runtime`, which has no sudo, Docker, LXD, or PostgreSQL system-group membership.
- The systemd unit starts and owns the PM2 daemon before any Workspace process is created. Verification requires the unit `MainPID`, PM2 pid file, daemon, and every managed application PID to resolve to the same unit cgroup, so namespace and filesystem hardening apply to the live processes rather than only to a later supervisor command.
- The legacy PM2 `jlist` snapshot is streamed directly into the sanitizer. Only the root-mode sanitized migration plan is persisted; raw process environments are never written to the cutover backup directory.

## Local logical backups

`ops/postgresql/backup.sh` creates a custom-format dump, a password-free globals export, a catalog listing, a JSON manifest, and SHA-256 checksums. It uses `umask 077`, `flock`, incomplete staging, and an atomic final rename. Defaults retain seven daily, four weekly, and six monthly restore points.

Install the script at `/usr/local/lib/workspace-postgresql/backup.sh`, create `/var/backups/workspace/postgresql` as `0700 postgres:postgres`, and install the matching systemd service/timer. `/etc/workspace/postgresql/backup.env` is optional and must be root-owned and no broader than `0640`; it may define `WORKSPACE_POSTGRESQL_BACKUP_URL` for the least-privilege backup role.

The optional `WORKSPACE_POSTGRESQL_OFFSITE_COMMAND` must be an absolute, root-owned, non-writable executable. It receives the completed backup directory and manifest path. It is responsible for authenticated encryption, data residency, immutable retention, and a durable remote receipt. No destination is assumed.

## Restore drill

`restore-drill.sh` verifies checksums and restores the latest dump into an exact PostgreSQL 16.14 Docker image with `network=none`, no published ports, a dedicated labeled volume, CPU/memory limits, and automatic cleanup. It validates public table count, applied Prisma migrations, constraints, and user count, then writes a mode-0600 receipt under `/var/lib/workspace/postgresql-restore-drills`.

The weekly timer is evidence that the backup can be restored; it never connects to, renames, or drops a production database.

## TLS

`tls-bootstrap.sh install` creates a private local CA and a server certificate with SANs for `localhost` and `127.0.0.1`. PostgreSQL owns the mode-0600 server key. Clients trust `/etc/workspace/postgresql/ca.pem` and use `sslmode=verify-full`; `NODE_EXTRA_CA_CERTS` points to the same CA for Node processes.

Install `postgresql-security.conf` as `/etc/postgresql/16/main/conf.d/30-workspace-security.conf`, validate it with `pg_ctlcluster 16 main reload`, inspect `pg_file_settings`, and prove both a valid connection and rejection with a wrong hostname or CA. The certificate timer fails 30 days before expiry.

## Audit and privacy

The security profile records connections, disconnections, and lock waits with database, role, application, client, and process metadata. It deliberately disables statement, duration, sampling, parameter, and error-statement text logging. `ddl-audit.sql` emits DDL object metadata through event-trigger log messages without recording raw SQL or bind values.

`ddl-audit-rollback.sql` removes only the two managed event triggers and the private `workspace_security` schema. Preserve it with the cutover receipt so audit installation remains independently reversible without restoring application data.

Install the logrotate profile as the PostgreSQL log policy only after backing up the existing distro file; duplicate logrotate entries for the same logfile are invalid.

## PITR gate

PITR is not enabled merely by installing these files. `pitr-check.sh` exits blocked until an approved off-host repository check executable is configured and passes. Only then may a separate reviewed change enable `archive_mode`, configure an archive command, restart PostgreSQL, force a WAL switch, prove `pg_stat_archiver` progress, take a full base backup, and complete a point-in-time restore drill.

Never enable WAL archival before the repository is writable and monitored: a failing archive command can fill `pg_wal` and stop the database.

## Rollback

Before installation, preserve HBA, PostgreSQL config, TLS files, logrotate policy, units, role/ACL inventory, process inventory, and a verified dump. Rollback restores those exact files, reloads PostgreSQL, restores the previous application URL if required, and keeps security evidence immutable. Do not delete new roles or transfer ownership back during a fast application rollback; temporarily grant the legacy login only runtime-equivalent DML privileges.
