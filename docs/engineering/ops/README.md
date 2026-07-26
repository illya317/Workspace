# Deployment

Reusable production release orchestration and its reviewable control plane live in this repository:
`ops/publish.sh`, `ops/publish-cnb.sh`, `ops/release-to-cnb.sh`, `ops/cnb-release.yml`, and
`ops/deploy.sh`. The private operations workspace contains secrets, runtime targets, environment
values, and thin wrappers that load `.env` before executing these tracked scripts; it is not a
second source of release logic. Tenant-specific CNB imports, server paths, and health target live in
`WORKSPACE_CONFIG_DIR/config/tenant/cnb-release.yml`.

`ops/publish.sh deploy` is the public Full and single-unit deployment command. `publish-cnb.sh`,
`release-to-cnb.sh`, and `deploy.sh` are internal stages covered by the publish/runtime contract
tests; their separate names do not represent alternative release paths. Profile/Fleet commands are
trusted pipeline internals rather than local alternatives to this operator entry.

Production release requires an exact-tree local full-CI receipt, then goes directly to CNB. GitHub
PR/CI remains available for collaboration but is not queried or awaited by the deploy path.

Repository-owned runtime dependency contracts:

- [CI/CD 与测试分级](./ci-cd.md)
- [Deploy Unit Graph](./deploy-units.md)
- [私有工作区与新租户初始化](./workspace-config.md)
- [Agent runtime: Pi DeepSeek Flash and Kimi](./kimi-agent-runtime.md)
- [数据发布批次与生产回执](./data-releases.md)

## PostgreSQL runtime contract

- `DATABASE_URL` is the PrismaPg runtime URL. `DIRECT_URL` selects the same database through a direct session endpoint and is used by migrations, checks, `pg_dump`, and restore tooling.
- Local/CI also defines `SHADOW_DATABASE_URL` for a separate disposable database. Production must not point the shadow URL at the live database.
- Active Prisma history lives in `prisma/migrations` and starts at the sanitized schema-only baseline. Pre-genesis history is retained only in the private audit bundle under `WORKSPACE_CONFIG_DIR/audit`; it is never shipped in source or release artifacts.
- `prisma db push` is forbidden for shared and production databases. Deploy executes `prisma migrate deploy`, checks migration/constraint state, seeds the resource registry, then runs the read-only permission-action check.
- After migrations and resource seeding, deploy runs `scripts/provision-agent-workforce.mjs --execute` followed by `--check`. The provisioner resolves HR identities by stable codes, holds a PostgreSQL session advisory lock before opening its fixed-snapshot transaction, and aborts the release on ambiguity or immutable-binding drift before application processes are replaced. Its default mode is rollback-only dry-run. It creates missing canonical virtual employees, positions, Agent profiles and runtime bindings. The Workspace-bound AI0004 receives only the exact `agent.assistant` entry/read/submit grant set and the three fixed business API connector keys; it receives no `agent.config` management entry, source capability, repository access, direct write tool, or deployment ability. Provisioner-owned Workspace grants on external Codex/CI/server identities are revoked only while the latest ledger event still belongs to the provisioner. Local development, direct commits, and deployment remain external runtime capabilities. The provisioner never reactivates ended employment/positions, resumes a suspended profile or runtime binding, restores an explicit RBAC revoke, or overwrites post-provision instructions and capability lists.
- The production Node runtime registers the tenant permission-review schedule after module overrides are loaded. AI0003 performs the full review every day at `08:00` in the tenant business time zone; successful permission-grant transactions trigger the same review engine immediately. The approved topology, all explicit grants, role assignments, implicit grant manager and separation rules live in `profile.files.permissionReview` and travel through the tenant-config manifest. Findings use a PostgreSQL advisory lock, persisted open-finding fingerprints, registered strong notifications and structured logs. See [`permission-review.md`](../security/permission-review.md).
- The standalone artifact carries the governed External customer/supplier master importer and its XLS parser. This is a post-deploy, one-off data operation rather than an automatic deploy step: run dry-run from the active release, copy its database/file-hash/row-count evidence into the required execute guards, and use `--require-empty-master` for the initial production load. The source workbooks remain outside Git and release artifacts. The authoritative command and merge rules are documented in `app/(modules)/external/ARCHITECTURE.md`.
- Business-data manifests and source files live under private `WORKSPACE_CONFIG_DIR/data-release-manifests` and `data-release-sources`. Upload and verification use the separate `publish.sh data upload|verify|status --id <id>` entrypoint. Code deployment never checks, uploads, binds, or applies a data batch. Git and release artifacts contain only generic handlers, validators, and receipt contracts.
- Each normal deployment creates a custom-format `pg_dump`, verifies it with `pg_restore --list`, writes a SHA-256 sidecar, and only then replaces the application process.

## SQLite cutover contract

The one-time provider cutover is not a normal deploy:

1. Stop every application, bot, cron, worker, and manual writer.
2. Create an immutable SQLite online-backup snapshot; record its byte size, SHA-256, and `integrity_check=ok`.
3. Reconcile the snapshot through the final legacy SQLite migration on a copy. Never mutate the only source.
4. Apply the PostgreSQL baseline to a new empty database.
5. Restore the audited legacy migration directory from private `WORKSPACE_CONFIG_DIR/audit`, then run `npm run db:migrate:sqlite-to-postgresql -- --sqlite <snapshot> --manifest <manifest> --expected-source-sha256 <hash> --legacy-migrations-dir <private-absolute-dir>` first in dry-run mode and repeat with `--execute`.
6. The ETL requires an empty target, uses one transaction, preserves IDs and sequence high-water marks, and aborts on source-hash drift, unexpected orphans, count/hash mismatch, or constraint failure.
7. Agent transcripts remain under `WORKSPACE_CONFIG_DIR/agent`; PostgreSQL stores session ownership/profile metadata, requester/actor run audit, and dual-identity proposal records. Freeze and back up the whole runtime directory together with the database cutover.
8. For the one-time production cutover, set `SQLITE_CUTOVER_SOURCE`, `SQLITE_CUTOVER_SHA256`, `SQLITE_CUTOVER_ROLLBACK_ENV`, private `SQLITE_LEGACY_MIGRATIONS_DIR`, and optionally `SQLITE_CUTOVER_MANIFEST` in the remote runtime env. The deploy applies the empty PostgreSQL baseline, runs the verified ETL, writes a completion receipt, then removes and unsets those one-time variables before starting services.
9. Configure the mandatory `HEALTHCHECK_URL`. The candidate process must pass its loopback runtime/cache smoke, and the public 3000 process must pass the local health check before the release symlink changes or the cutover is declared externally available.
10. Prove `pg_dump`/`pg_restore` into an isolated database and run application read/write smokes before changing production URLs.
11. After the first PostgreSQL write, SQLite is a forensic rollback artifact, not an automatically current primary. Rolling back application code without replaying PostgreSQL writes would lose data.

Migration manifests and database dumps contain operational metadata and must stay in the private runtime/backup workspace, never in git.

Only the verified cutover command, the private audited Prisma-history bundle, and the narrowly scoped
recovery tools documented in `scripts/migrate/sqlite-legacy/README.md` remain part of SQLite recovery.
Historical debug, direct-write import, reconciliation, maintenance, and precompute scripts are not
retained as runnable operations.
