import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const read = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
const runtime = read("scripts/runtime/run-with-repo-node.sh");
const localFullCi = read("scripts/ci/run-local-full-ci.mjs");
const entries = [
  ".githooks/pre-commit",
  ".githooks/pre-push",
  "ops/publish.sh",
  "ops/publish-cnb.sh",
];

test("local Git and release entries bootstrap the repository Node runtime", () => {
  for (const entry of entries) {
    const source = read(entry);
    assert.match(source, /WORKSPACE_REPO_RUNTIME_READY/);
    assert.match(source, /scripts\/runtime\/run-with-repo-node\.sh/);
  }
});

test("repository runtime selects Node and keeps temporary files in governed local paths", () => {
  assert.match(runtime, /\.node-version/);
  assert.match(runtime, /WORKSPACE_NODE_BINARY/);
  assert.match(runtime, /\.cache\/runtime-tmp/);
  assert.match(runtime, /export TMPDIR=/);
  assert.match(runtime, /export PATH=/);
  assert.match(runtime, /WORKSPACE_REPO_RUNTIME_READY=1/);
  const runtimePath = fileURLToPath(new URL("../scripts/runtime/run-with-repo-node.sh", import.meta.url));
  const syntax = spawnSync("bash", ["-n", runtimePath], {
    encoding: "utf8",
  });
  assert.equal(syntax.status, 0, syntax.stderr);
});

test("the full CI executable self-bootstraps the repository Node major", () => {
  assert.match(localFullCi, /requiresRepositoryNodeBootstrap/);
  assert.match(localFullCi, /scripts\/runtime\/run-with-repo-node\.sh/);
  assert.match(localFullCi, /spawnSync\(wrapper, \["node"/);
});

test("package metadata declares the same Node major as .node-version", () => {
  const packageJson = JSON.parse(read("package.json"));
  const requiredMajor = read(".node-version").trim();
  assert.equal(packageJson.engines?.node, `${requiredMajor}.x`);
});

test("repository scripts avoid the tsx CLI IPC server", () => {
  const packageJson = JSON.parse(read("package.json"));
  for (const [name, command] of Object.entries(packageJson.scripts)) {
    assert.equal(command.includes("npx tsx"), false, `${name} uses npx tsx`);
    assert.equal(command.startsWith("tsx "), false, `${name} starts with tsx`);
    assert.equal(command.includes("-- tsx "), false, `${name} runs tsx through a lock wrapper`);
    assert.equal(command.includes("&& tsx "), false, `${name} chains tsx directly`);
  }

  assert.doesNotMatch(read("scripts/check/run-domain-validation-changed.js"), /spawnSync\(["']npx["'], \[["']tsx["']/);
  assert.doesNotMatch(read("ops/build-standalone-artifact.sh"), /\bnpx\s+tsx\b/);
  assert.doesNotMatch(read("scripts/check/with-check-lock.js"), /spawn\(["'](?:npx|tsx)["']/);
  assert.match(read("scripts/check/with-check-lock.js"), /process\.once\("SIGHUP", handleSignal\)/);
});

test("standalone artifact carries the governed external-party importer", () => {
  const packager = read("ops/build-standalone-artifact.sh");
  assert.match(packager, /copy_runtime_package_tree[^\n]*\bxlsx\b/);
  assert.match(packager, /copy_runtime_package_tree[^\n]*\btsx\b/);
  assert.match(packager, /copy_runtime_package_tree[^\n]*\bsharp\b/);
  assert.match(packager, /standalone sharp runtime is incomplete/);
  assert.match(packager, /scripts\/import\/import-external-party-master\.mjs/);
  assert.match(packager, /scripts\/import\/external-party-master-source\.mjs/);
  assert.match(packager, /scripts\/lib\/database-url\.js/);
});

test("standalone data release importers resolve the traced Next runtime", () => {
  const packager = read("ops/build-standalone-artifact.sh");
  assert.match(packager, /release_next_runtime="\.next\/standalone\/node_modules\/next"/);
  assert.match(packager, /ln -s "\$next_runtime_link" "\$release_next_runtime"/);
  assert.match(packager, /require\.resolve\("next\/server", \{ paths: \[path\.join\(root, "packages\/platform\/server"\)\] \}\)/);
});

test("Playwright process cleanup skips only a sandbox EPERM", () => {
  const source = read("scripts/check/check-playwright-processes.ts");
  assert.match(source, /\.code === "EPERM"/);
  assert.match(source, /process\.exit\(0\)/);
  assert.match(source, /Unable to inspect the process table/);
  assert.match(source, /process\.exitCode = 1/);
});

test("secure PostgreSQL dev template isolates runtime and migration credentials", () => {
  const compose = read("ops/postgresql/dev/compose.yaml");
  const app = compose.match(/\n  app:\n([\s\S]*?)\n  migrate:/)?.[1] ?? "";
  const migrate = compose.match(/\n  migrate:\n([\s\S]*?)\n  verify:/)?.[1] ?? "";
  const database = compose.match(/\n  db:\n([\s\S]*?)\n  app:/)?.[1] ?? "";

  assert.match(app, /workspace_dev_runtime_password/);
  assert.match(app, /postgres_ca/);
  assert.doesNotMatch(app, /workspace_dev_migrator_password|postgres_server_key|DIRECT_URL|SHADOW_DATABASE_URL/);
  assert.match(migrate, /profiles: \["migration"\]/);
  assert.match(migrate, /workspace_dev_migrator_password/);
  assert.doesNotMatch(migrate, /workspace_dev_runtime_password|postgres_server_key/);
  assert.match(database, /postgres_server_key/);
  assert.match(compose, /"127\.0\.0\.1:3100:3000"/);
  assert.doesNotMatch(app, /service_completed_successfully|migrate:/);
  assert.match(read("ops/postgresql/dev/start-app.sh"), /unset DIRECT_URL SHADOW_DATABASE_URL PGPASSWORD PGOPTIONS/);
  assert.match(read("ops/postgresql/dev/migrate-app.sh"), /npm run db:migrate:dev/);
  assert.match(read("ops/postgresql/dev/migrate-app.sh"), /post-migrate-grants\.sql/);
});

test("database root bootstrap atomically makes local secrets readable only by postgres", () => {
  const compose = read("ops/postgresql/dev/compose.yaml");
  const startDatabase = read("ops/postgresql/dev/start-db.sh");
  const roles = read("ops/postgresql/dev/roles-and-grants.sql");

  assert.match(startDatabase, /id -u[\s\S]*must run as root/);
  assert.match(startDatabase, /private_dir="\$\{tls_dir\}\/private"/);
  assert.match(startDatabase, /install -d -o postgres -g postgres -m 0700/);
  assert.match(startDatabase, /atomic_copy_for_postgres[\s\S]*install -o postgres -g postgres -m 0400[\s\S]*mv -f/);
  for (const name of [
    "postgres_admin_password",
    "workspace_dev_runtime_password",
    "workspace_dev_migrator_password",
    "workspace_dev_backup_password",
    "workspace_dev_monitor_password",
  ]) {
    assert.match(startDatabase, new RegExp(`\\b${name}\\b`));
  }
  assert.match(startDatabase, /configuration_names=[\s\S]*pg_hba\.conf[\s\S]*pg_ident\.conf[\s\S]*roles-and-grants\.sql/);
  assert.match(startDatabase, /\/docker-entrypoint-initdb\.d[\s\S]*20-workspace-security\.sql/);
  assert.match(startDatabase, /export POSTGRES_PASSWORD_FILE="\$\{private_dir\}\/postgres_admin_password"/);
  assert.match(compose, /POSTGRES_PASSWORD_FILE: \/var\/lib\/postgresql\/tls\/private\/postgres_admin_password/);
  assert.match(compose, /hba_file=\/var\/lib\/postgresql\/tls\/private\/pg_hba\.conf/);
  assert.match(compose, /ident_file=\/var\/lib\/postgresql\/tls\/private\/pg_ident\.conf/);
  assert.match(compose, /\.\/roles-and-grants\.sql:\/workspace-dev\/bootstrap\/roles-and-grants\.sql:ro/);
  assert.match(compose, /\/docker-entrypoint-initdb\.d:size=1m,mode=0700/);
  assert.doesNotMatch(compose, /\.\/roles-and-grants\.sql:\/docker-entrypoint-initdb\.d/);
  assert.doesNotMatch(roles, /\/run\/secrets/);
  assert.equal((roles.match(/\/var\/lib\/postgresql\/tls\/private\//g) ?? []).length, 5);
});

test("secure PostgreSQL dev template enforces verify-full TLS and private key confinement", () => {
  const compose = read("ops/postgresql/dev/compose.yaml");
  const urlRenderer = read("ops/postgresql/dev/render-database-url.mjs");
  const hba = read("ops/postgresql/dev/pg_hba.conf");
  const tlsGenerator = read("ops/postgresql/dev/generate-tls.sh");

  assert.match(compose, /ssl=on/);
  assert.match(compose, /ssl_min_protocol_version=TLSv1\.2/);
  assert.match(urlRenderer, /sslmode", "verify-full"/);
  assert.match(urlRenderer, /sslrootcert/);
  assert.match(tlsGenerator, /subjectAltName=DNS:db/);
  assert.match(tlsGenerator, /-checkhost db/);
  assert.match(hba, /hostnossl\s+all\s+all\s+172\.29\.31\.0\/24\s+reject/);
  assert.match(hba, /hostssl\s+workspace_dev\s+workspace_dev_runtime\s+172\.29\.31\.0\/24\s+scram-sha-256/);
  assert.match(hba, /host\s+all\s+all\s+0\.0\.0\.0\/0\s+reject/);
  assert.equal((compose.match(/postgres_server_key/g) ?? []).length, 2);
  assert.doesNotMatch(compose.match(/\n  app:\n([\s\S]*?)\n  migrate:/)?.[1] ?? "", /postgres_server_key/);
  assert.match(compose, /log_min_duration_statement=-1/);
  assert.match(compose, /log_min_duration_sample=-1/);
  assert.match(compose, /log_statement_sample_rate=0/);
  assert.match(compose, /log_transaction_sample_rate=0/);
  assert.match(compose, /log_duration=off/);
  assert.match(compose, /log_statement=none/);
  assert.match(compose, /log_min_error_statement=panic/);
  assert.match(compose, /log_parameter_max_length=0/);
  assert.match(compose, /log_parameter_max_length_on_error=0/);
  assert.doesNotMatch(compose, /log_min_duration_statement=[1-9]/);
});

test("secure PostgreSQL dev networks isolate DB while preserving edge egress", () => {
  const compose = read("ops/postgresql/dev/compose.yaml");
  const marketDataOverride = read("ops/postgresql/dev/compose.market-data.override.yaml");
  const database = compose.match(/\n  db:\n([\s\S]*?)\n  app:/)?.[1] ?? "";
  const app = compose.match(/\n  app:\n([\s\S]*?)\n  migrate:/)?.[1] ?? "";

  assert.match(compose, /workspace-dev-db-internal:\n\s+name: workspace-dev-db-internal\n\s+internal: true/);
  assert.match(compose, /workspace-dev-edge:\n\s+name: workspace-dev-edge\n\s+external: true/);
  assert.match(database, /workspace-dev-db-internal/);
  assert.doesNotMatch(database, /workspace-dev-edge/);
  assert.match(app, /workspace-dev-db-internal/);
  assert.match(app, /workspace-dev-edge/);
  assert.match(marketDataOverride, /market-data:[\s\S]*workspace-dev-network[\s\S]*workspace-dev-edge/);
  assert.match(marketDataOverride, /aliases:[\s\S]*market-data/);
  assert.doesNotMatch(marketDataOverride, /workspace-dev-db-internal/);
  assert.match(read("ops/postgresql/dev/app.env.example"), /MARKET_INTELLIGENCE_AKTOOLS_BASE_URL=http:\/\/market-data:8080/);
});

test("secure PostgreSQL dev roles, limits, verification, backup, and installer are fail closed", () => {
  const roles = read("ops/postgresql/dev/roles-and-grants.sql");
  const verification = read("ops/postgresql/dev/verify.sql");
  const shadowVerification = read("ops/postgresql/dev/verify-shadow.sql");
  const verificationRunner = read("ops/postgresql/dev/verify.sh");
  const backup = read("ops/postgresql/dev/backup-hook.sh");
  const rotation = read("ops/postgresql/dev/rotate-backups.sh");
  const installer = read("ops/postgresql/dev/install.sh");
  const backupService = read("ops/postgresql/dev/systemd/workspace-dev-postgresql-backup.service");
  const backupTimer = read("ops/postgresql/dev/systemd/workspace-dev-postgresql-backup.timer");
  const readme = read("ops/postgresql/dev/README.md");
  const executableTemplateSources = [roles, verification, backup, rotation, installer].join("\n");

  assert.match(roles, /workspace_dev_owner NOLOGIN NOSUPERUSER/);
  assert.match(roles, /workspace_dev_runtime LOGIN NOSUPERUSER/);
  assert.match(roles, /\('workspace_dev', '\/var\/lib\/postgresql\/tls\/private\/postgres_admin_password'\)/);
  assert.match(roles, /GRANT workspace_dev_owner TO workspace_dev_migrator/);
  assert.match(roles, /statement_timeout = ['"]120s['"]/);
  assert.match(roles, /lock_timeout = ['"]10s['"]/);
  assert.match(roles, /CONNECTION LIMIT 20/);
  assert.match(roles, /REVOKE ALL ON TABLE public\."_prisma_migrations"/);
  assert.match(roles, /GRANT SELECT ON TABLE public\."_prisma_migrations" TO workspace_dev_backup/);
  assert.match(roles, /ALTER ROUTINE/);
  assert.match(roles, /ALTER TYPE/);
  assert.match(roles, /c\.relkind <> 'S'[\s\S]*sequence_ownership\.deptype IN \('a', 'i'\)/);
  assert.match(roles, /\\connect workspace_dev_shadow[\s\S]*ALTER SCHEMA public OWNER TO workspace_dev_owner/);
  assert.match(roles, /\$shadow_ownership\$[\s\S]*ALTER ROUTINE[\s\S]*ALTER TYPE/);
  const relationOwnershipVerification = verification.match(
    /legacy_no_public_relation_ownership[\s\S]*?legacy_no_public_routine_ownership/,
  )?.[0] ?? "";
  assert.doesNotMatch(relationOwnershipVerification, /relkind IN|sequence_ownership|deptype IN \('a', 'i'\)/);
  const typeOwnershipVerification = verification.match(
    /legacy_no_public_type_ownership[\s\S]*?legacy_no_public_schema_ownership/,
  )?.[0] ?? "";
  assert.doesNotMatch(typeOwnershipVerification, /typtype IN|NOT EXISTS \(SELECT 1 FROM pg_type base_type|typrelid/);
  assert.match(typeOwnershipVerification, /extension_base_type\.typarray = t\.oid/);
  assert.match(shadowVerification, /shadow_database_owner/);
  assert.match(shadowVerification, /shadow_public_schema_owner/);
  assert.match(shadowVerification, /shadow_public_schema_create/);
  assert.match(shadowVerification, /shadow_no_legacy_public_relation_ownership/);
  assert.match(shadowVerification, /shadow_no_legacy_public_type_ownership/);
  assert.match(verificationRunner, /PGDATABASE=workspace_dev_shadow[\s\S]*PGOPTIONS='-c role=workspace_dev_owner'/);
  assert.match(roles, /workspace_ddl_audit action=ddl/);
  assert.match(roles, /workspace_ddl_audit action=drop/);
  assert.match(verification, /tls_active/);
  assert.match(verification, /legacy_no_public_relation_ownership/);
  assert.match(verification, /legacy_no_public_routine_ownership/);
  assert.match(verification, /legacy_no_public_type_ownership/);
  assert.match(backup, /pg_dump --format=custom --file=/);
  assert.doesNotMatch(backup, /--no-owner|--no-privileges/);
  assert.match(backup, /pg_restore --list/);
  assert.match(backup, /security-inventory\.sql/);
  assert.match(backup, /final_inventory/);
  assert.match(backup, /sha256sum --check/);
  assert.match(rotation, /retention_days < 7/);
  assert.match(rotation, /-mtime "\+\$\{retention_days\}"/);
  assert.match(rotation, /dump\.security-inventory/);
  assert.match(backupService, /\/usr\/bin\/docker compose --project-name workspace-dev-secure/);
  assert.match(backupService, /\/home\/ubuntu\/workspace-dev\/postgresql-security\/compose\.yaml/);
  assert.match(backupTimer, /Persistent=true/);
  assert.match(backupTimer, /OnCalendar=/);
  assert.match(installer, /Refusing to overwrite non-empty target/);
  assert.match(installer, /realpath -m/);
  assert.match(installer, /workspace-dev\/source\/\*/);
  assert.match(installer, /repository_root/);
  assert.match(installer, /verify-shadow\.sql/);
  assert.match(installer, /restore-drill\.sh/);
  assert.match(readme, /\/test\/api\/auth\/dev-login-bypass.*404/);
  assert.doesNotMatch(executableTemplateSources, /dev-login-bypass|CREATE POLICY|ENABLE ROW LEVEL SECURITY/);
});

test("backup artifacts remain operator-owned and the isolated restore drill verifies security state", () => {
  const compose = read("ops/postgresql/dev/compose.yaml");
  const backupService = compose.match(/\n  backup:\n([\s\S]*?)\nsecrets:/)?.[1] ?? "";
  const backup = read("ops/postgresql/dev/backup-hook.sh");
  const inventory = read("ops/postgresql/dev/security-inventory.sql");
  const bootstrap = read("ops/postgresql/dev/restore-drill-bootstrap.sql");
  const verification = read("ops/postgresql/dev/restore-drill-verify.sql");
  const drill = read("ops/postgresql/dev/restore-drill.sh");
  const readme = read("ops/postgresql/dev/README.md");

  assert.match(backupService, /user: "1000:1001"/);
  assert.match(backupService, /security-inventory\.sql/);
  assert.match(backup, /umask 077/);
  assert.match(backup, /chmod 0600 "\$\{temporary_dump\}" "\$\{temporary_inventory\}" "\$\{temporary_manifest\}"/);
  assert.match(backup, /inventory_checksum/);
  assert.match(inventory, /role\|%s\|login=/);
  assert.match(inventory, /database\|%s\|owner=/);
  assert.match(inventory, /schema\|%s\|owner=/);
  assert.match(inventory, /relation\|kind=/);
  assert.match(inventory, /routine\|name=/);
  assert.match(inventory, /default_acl\|owner=/);
  assert.match(bootstrap, /CREATE DATABASE workspace_dev_restore OWNER workspace_dev_owner/);
  assert.match(verification, /restore_runtime_no_migration_write/);
  assert.match(verification, /restore_runtime_no_schema_create/);
  assert.match(drill, /id -u[\s\S]*1000/);
  assert.match(drill, /--network none/);
  assert.doesNotMatch(drill, /--publish|-p [0-9]/);
  assert.match(drill, /HostConfig\.PortBindings/);
  assert.match(drill, /pg_restore -U postgres --exit-on-error/);
  assert.match(drill, /cmp -s "\$\{inventory_path\}" "\$\{restored_inventory\}"/);
  assert.match(drill, /stat -c '%u:%g:%a'/);
  assert.match(drill, /restore-receipts/);
  assert.match(drill, /security_inventory_match=passed/);
  assert.match(drill, /resources-removed/);
  assert.match(drill, /postgres_image_id=/);
  assert.match(readme, /uid\/gid `1000:1001`/);
  assert.match(readme, /--network none/);
  assert.match(readme, /role\/owner\/ACL inventory byte-for-byte/);
});

test("watchdog recovery is secure-only, fail-closed, and app-only", () => {
  const watchdog = read("ops/postgresql/dev/workspace-dev-watchdog-compose.sh");
  const switcher = read("ops/postgresql/dev/switch-watchdog.sh");
  const dropin = read("ops/postgresql/dev/systemd/workspace-dev-watchdog-secure.conf");
  const readme = read("ops/postgresql/dev/README.md");

  assert.match(watchdog, /SECURE_RUNTIME_ROOT=.*postgresql-security[\s\S]*workspace-dev-secure[\s\S]*SECURE_RUNTIME_ROOT.*compose\.yaml/);
  assert.match(watchdog, /compose_app stop app/);
  assert.match(watchdog, /compose_app up -d --no-deps app/);
  assert.doesNotMatch(watchdog, /compose_app up -d (?!\-\-no-deps)/);
  assert.doesNotMatch(watchdog, /STACK_MODE|legacy/);
  assert.match(switcher, /<apply\|status>/);
  assert.doesNotMatch(switcher, /rollback|legacy|workspace-dev\/compose\.yaml/);
  assert.match(switcher, /DIRECT_URL\|SHADOW_DATABASE_URL\|PGPASSWORD\|PGOPTIONS/);
  assert.match(switcher, /Secure watchdog drop-in is missing or differs/);
  assert.match(dropin, /ExecStart=\nExecStart=\/home\/ubuntu\/workspace-dev\/postgresql-security\/workspace-dev-watchdog-compose\.sh/);
  assert.doesNotMatch(dropin, /EnvironmentFile/);
  assert.match(readme, /watchdog is deliberately secure-only/i);
  assert.match(readme, /There is no `switch-watchdog\.sh rollback` action/);
  assert.match(readme, /mutually compatible old source tree, app env, PostgreSQL HBA\/TLS configuration/);
});

test("secure PostgreSQL dev shell and Node templates pass syntax checks", () => {
  const scripts = [
    "backup-hook.sh", "generate-secrets.sh", "generate-tls.sh", "install-node-deps.sh",
    "install.sh", "migrate-app.sh", "restore-drill.sh", "rotate-backups.sh", "start-app.sh", "start-db.sh",
    "switch-watchdog.sh", "verify.sh", "workspace-dev-watchdog-compose.sh",
  ];
  for (const script of scripts) {
    const scriptPath = fileURLToPath(new URL(`./postgresql/dev/${script}`, import.meta.url));
    const syntax = spawnSync("bash", ["-n", scriptPath], { encoding: "utf8" });
    assert.equal(syntax.status, 0, `${script}: ${syntax.stderr}`);
  }
  const rendererPath = fileURLToPath(new URL("./postgresql/dev/render-database-url.mjs", import.meta.url));
  const rendererSyntax = spawnSync(process.execPath, ["--check", rendererPath], { encoding: "utf8" });
  assert.equal(rendererSyntax.status, 0, rendererSyntax.stderr);
});
