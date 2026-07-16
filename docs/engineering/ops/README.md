# Deployment

Production release orchestration and its reviewable control plane live in this repository:
`ops/publish.sh`, `ops/publish-cnb.sh`, `ops/release-to-cnb.sh`, `ops/cnb-release.yml`, `ops/deploy.sh`,
and the CNB deploy-request/order contracts. The private operations workspace contains secrets, runtime targets, environment
values, and thin wrappers that load `.env` before executing these tracked scripts; it is not a
second source of release logic.

Repository-owned runtime dependency contracts:

- [Kimi Agent SDK runtime](./kimi-agent-runtime.md)

## PostgreSQL runtime contract

- `DATABASE_URL` is the PrismaPg runtime URL. `DIRECT_URL` selects the same database through a direct session endpoint and is used by migrations, checks, `pg_dump`, and restore tooling.
- Local/CI also defines `SHADOW_DATABASE_URL` for a separate disposable database. Production must not point the shadow URL at the live database.
- Active Prisma history lives in `prisma/migrations` and starts at `20260713000000_postgresql_baseline`. The old provider-specific history is audit-only under `prisma/migrations-sqlite-legacy`.
- `prisma db push` is forbidden for shared and production databases. Deploy executes `prisma migrate deploy`, checks migration/constraint state, seeds the resource registry, then runs the read-only permission-action check.
- After migrations and resource seeding, deploy runs `scripts/provision-agent-workforce.mjs --execute` followed by `--check`. The provisioner resolves HR identities by stable codes, holds a PostgreSQL session advisory lock before opening its fixed-snapshot transaction, and aborts the release on ambiguity or immutable-binding drift before application processes are replaced. Its default mode is rollback-only dry-run. It creates missing canonical virtual employees, positions, Agent profiles and runtime bindings. Only the Workspace-bound AI0004 receives the exact `agent.assistant` entry/read/submit and `agent.source` read/submit grant set. Provisioner-owned Workspace grants on external Codex/CI/server identities are revoked only while the latest ledger event still belongs to the provisioner; existing assistant grants are never copied into source grants. AI0004 is limited to source search and PR proposals; local development, direct commits and deployment remain external runtime capabilities. The provisioner never reactivates ended employment/positions, resumes a suspended profile or runtime binding, restores an explicit RBAC revoke, or overwrites post-provision instructions and capability lists.
- Each normal deployment creates a custom-format `pg_dump`, verifies it with `pg_restore --list`, writes a SHA-256 sidecar, and only then replaces the application process.

## SQLite cutover contract

The one-time provider cutover is not a normal deploy:

1. Stop every application, bot, cron, worker, and manual writer.
2. Create an immutable SQLite online-backup snapshot; record its byte size, SHA-256, and `integrity_check=ok`.
3. Reconcile the snapshot through the final legacy SQLite migration on a copy. Never mutate the only source.
4. Apply the PostgreSQL baseline to a new empty database.
5. Run `npm run db:migrate:sqlite-to-postgresql -- --sqlite <snapshot> --manifest <manifest> --expected-source-sha256 <hash>` first in dry-run mode, then repeat with `--execute`.
6. The ETL requires an empty target, uses one transaction, preserves IDs and sequence high-water marks, and aborts on source-hash drift, unexpected orphans, count/hash mismatch, or constraint failure.
7. Agent transcripts remain under `WORKSPACE_CONFIG_DIR/agent`; PostgreSQL stores session ownership/profile metadata, requester/actor run audit, and dual-identity proposal records. Freeze and back up the whole runtime directory together with the database cutover.
9. For the one-time production cutover, set `SQLITE_CUTOVER_SOURCE`, `SQLITE_CUTOVER_SHA256`, `SQLITE_CUTOVER_ROLLBACK_ENV`, and optionally `SQLITE_CUTOVER_MANIFEST` in the remote runtime env. `SQLITE_CUTOVER_ROLLBACK_ENV` must be an absolute path to the preserved, read-only pre-cutover SQLite runtime environment. The deploy applies the empty PostgreSQL baseline, runs the verified ETL, writes a completion receipt, then removes and unsets those one-time variables before starting services.
10. Configure the mandatory `HEALTHCHECK_URL`. The candidate process must pass its loopback runtime/cache smoke, and the public 3000 process must pass the local health check before the release symlink changes or the cutover is declared externally available.
11. Prove `pg_dump`/`pg_restore` into an isolated database and run application read/write smokes before changing production URLs.
12. After the first PostgreSQL write, SQLite is a forensic rollback artifact, not an automatically current primary. Rolling back application code without replaying PostgreSQL writes would lose data.

Migration manifests and database dumps contain operational metadata and must stay in the private runtime/backup workspace, never in git.
