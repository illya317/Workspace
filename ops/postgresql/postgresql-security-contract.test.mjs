import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");

test("backup is private, atomic, verified, retained, and provider-neutral", () => {
  const source = read("./backup.sh");
  assert.match(source, /umask 077/);
  assert.match(source, /flock -n/);
  assert.match(source, /--format=custom/);
  assert.match(source, /--no-owner/);
  assert.match(source, /--no-privileges/);
  assert.match(source, /pg_dumpall --globals-only --no-role-passwords/);
  assert.match(source, /pg_restore --list/);
  assert.match(source, /sha256sum --check/);
  assert.match(source, /\.incomplete-/);
  assert.match(source, /WORKSPACE_POSTGRESQL_OFFSITE_COMMAND/);
  assert.match(source, /WORKSPACE_POSTGRESQL_BACKUP_URL is required/);
  assert.match(source, /WORKSPACE_POSTGRESQL_ALLOW_LOCAL_PEER_FALLBACK/);
  assert.match(source, /PGPASSWORD="\$backup_password" pg_dump/);
  assert.match(source, /--dbname="\$backup_connection_url"/);
  assert.doesNotMatch(source, /--dbname="\$backup_url"/);
  assert.match(source, /daily_keep.*7/);
  assert.match(source, /weekly_keep.*4/);
  assert.match(source, /monthly_keep.*6/);
  assert.doesNotMatch(source, /PGPASSWORD=["'][^$]/);
});

test("backup strips Prisma schema while preserving verified libpq TLS without leaking the password", () => {
  const temporary = mkdtempSync(path.join(tmpdir(), "workspace-backup-url-"));
  const bin = path.join(temporary, "bin");
  const backupRoot = path.join(temporary, "backups");
  const capture = path.join(temporary, "capture.log");
  const secret = "backupPasswordSentinel";
  mkdirSync(bin);
  const fakeDatabaseCommand = `#!/bin/sh
set -eu
command_name=\${0##*/}
for argument in "$@"; do
  case "$argument" in
    *"$TEST_SECRET"*|*schema=*|*password=*) exit 81 ;;
  esac
done
case "$command_name" in
  pg_isready|pg_dump|psql)
    [ "\${PGPASSWORD-}" = "$TEST_SECRET" ] || exit 82
    case "$*" in
      *sslmode=verify-full*sslrootcert=/etc/workspace/postgresql/ca.pem*application_name=workspace_backup*) ;;
      *) exit 83 ;;
    esac
    ;;
  pg_dumpall|pg_restore)
    [ "\${PGPASSWORD+x}" != x ] || exit 84
    ;;
esac
printf '%s\\n' "$command_name:ok" >> "$TEST_CAPTURE"
case "$command_name" in
  pg_dump)
    output=
    for argument in "$@"; do case "$argument" in --file=*) output=\${argument#--file=} ;; esac; done
    [ -n "$output" ] || exit 85
    printf 'fake custom dump\\n' > "$output"
    ;;
  pg_restore) printf 'fake catalog\\n' ;;
  pg_dumpall) printf 'CREATE ROLE example;\\n' ;;
  psql)
    case "$*" in
      *server_version*) printf '16.14\\n' ;;
      *pg_database_size*) printf '1024\\n' ;;
      *pg_current_wal_lsn*) printf '0/123456\\n' ;;
      *) exit 86 ;;
    esac
    ;;
esac
`;
  for (const command of ["pg_isready", "pg_dump", "pg_restore", "pg_dumpall", "psql"]) {
    const target = path.join(bin, command);
    writeFileSync(target, fakeDatabaseCommand);
    chmodSync(target, 0o755);
  }
  const baseEnvironment = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    TEST_CAPTURE: capture,
    TEST_SECRET: secret,
    WORKSPACE_POSTGRESQL_BACKUP_ROOT: backupRoot,
    WORKSPACE_POSTGRESQL_REQUIRE_OFFSITE: "0",
  };
  const validUrl = `postgresql://workspace_backup:${secret}@127.0.0.1:5432/workspace?schema=public&sslmode=verify-full&sslrootcert=%2Fetc%2Fworkspace%2Fpostgresql%2Fca.pem&application_name=workspace_backup`;
  try {
    execFileSync("bash", [new URL("./backup.sh", import.meta.url).pathname], {
      env: { ...baseEnvironment, WORKSPACE_POSTGRESQL_BACKUP_URL: validUrl },
      stdio: "pipe",
    });
    const latest = readlinkSync(path.join(backupRoot, "latest"));
    assert.match(latest, /^daily\/[0-9]{8}T[0-9]{6}Z$/);
    const commandEvidence = readFileSync(capture, "utf8");
    for (const command of ["pg_isready", "pg_dump", "pg_restore", "pg_dumpall", "psql"]) {
      assert.match(commandEvidence, new RegExp(`^${command}:ok$`, "m"));
    }

    for (const query of [
      "schema=private&sslmode=verify-full&sslrootcert=%2Fetc%2Fworkspace%2Fpostgresql%2Fca.pem&application_name=workspace_backup",
      "schema=public&sslmode=require&sslrootcert=%2Fetc%2Fworkspace%2Fpostgresql%2Fca.pem&application_name=workspace_backup",
      "schema=public&sslmode=verify-full&sslrootcert=%2Ftmp%2Fother.pem&application_name=workspace_backup",
      "schema=public&sslmode=verify-full&sslrootcert=%2Fetc%2Fworkspace%2Fpostgresql%2Fca.pem&application_name=workspace_backup&password=override",
      "schema=public&schema=public&sslmode=verify-full&sslrootcert=%2Fetc%2Fworkspace%2Fpostgresql%2Fca.pem&application_name=workspace_backup",
    ]) {
      const rejected = spawnSync("bash", [new URL("./backup.sh", import.meta.url).pathname], {
        env: {
          ...baseEnvironment,
          WORKSPACE_POSTGRESQL_BACKUP_ROOT: path.join(temporary, `rejected-${Math.random().toString(16).slice(2)}`),
          WORKSPACE_POSTGRESQL_BACKUP_URL: `postgresql://workspace_backup:${secret}@127.0.0.1:5432/workspace?${query}`,
        },
        encoding: "utf8",
      });
      assert.notEqual(rejected.status, 0);
      assert.equal(rejected.stdout.includes(secret), false);
      assert.equal(rejected.stderr.includes(secret), false);
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("restore drill is isolated and destroys only labeled temporary resources", () => {
  const source = read("./restore-drill.sh");
  assert.match(source, /--network none/);
  assert.match(source, /--restart no/);
  assert.match(source, /--no-owner/);
  assert.match(source, /--no-privileges/);
  assert.match(source, /--exit-on-error/);
  assert.match(source, /grep -xc .*CREATE ROLE postgres/);
  assert.match(source, /sed .*CREATE ROLE postgres.*psql .*ON_ERROR_STOP=1/);
  assert.match(source, /restoredWorkspaceRoleCount/);
  assert.match(source, /restored database has no users/);
  assert.match(source, /postgresql-restore-drill/);
  assert.match(source, /actual.*suffix/);
  assert.match(source, /invalid_constraint_count/);
  assert.doesNotMatch(source, /--publish|-p [0-9]/);
});

test("TLS bootstrap produces a private key and verified hostname certificate", () => {
  const source = read("./tls-bootstrap.sh");
  assert.match(source, /rsa_keygen_bits:3072/);
  assert.match(source, /subjectAltName/);
  assert.match(source, /DNS:/);
  assert.match(source, /IP Address:/);
  assert.match(source, /openssl verify/);
  assert.match(source, /openssl x509 -checkend/);
  assert.match(source, /server key does not match certificate/);
  assert.match(source, /server key owner is invalid/);
  assert.match(source, /mv -Tf .*server_current_link/);
  assert.match(source, /install -m 0600/);
  assert.doesNotMatch(source, /cat .*server\.key/);
});

test("security logging avoids SQL and parameter literals", () => {
  const config = read("./postgresql-security.conf");
  assert.match(config, /log_connections = on/);
  assert.match(config, /log_disconnections = on/);
  assert.match(config, /log_lock_waits = on/);
  assert.match(config, /log_statement = 'none'/);
  assert.match(config, /log_min_duration_statement = -1/);
  assert.match(config, /log_parameter_max_length_on_error = 0/);
  assert.match(config, /log_min_error_statement = 'panic'/);
  assert.doesNotMatch(config, /archive_mode\s*=\s*(?:on|always)/);
});

test("DDL audit logs metadata without raw SQL", () => {
  const source = read("./ddl-audit.sql");
  const rollback = read("./ddl-audit-rollback.sql");
  assert.match(source, /pg_event_trigger_ddl_commands/);
  assert.match(source, /pg_event_trigger_dropped_objects/);
  assert.match(source, /object_identity/);
  assert.doesNotMatch(source, /current_query|pg_stat_activity|query_text/i);
  assert.doesNotMatch(source, /CREATE POLICY|ENABLE ROW LEVEL SECURITY/i);
  assert.match(rollback, /DROP EVENT TRIGGER IF EXISTS workspace_ddl_command_audit/);
  assert.match(rollback, /DROP EVENT TRIGGER IF EXISTS workspace_sql_drop_audit/);
  assert.match(rollback, /DROP SCHEMA IF EXISTS workspace_security CASCADE/);
});

test("PITR remains fail-closed until an approved repository passes", () => {
  const source = read("./pitr-check.sh");
  assert.match(source, /no approved off-host repository/);
  assert.match(source, /repository_check/);
  assert.doesNotMatch(source, /ALTER SYSTEM|systemctl restart/);
});

test("backup and restore timers are persistent", () => {
  const backupService = read("../systemd/workspace-postgresql-backup.service");
  const backupTimer = read("../systemd/workspace-postgresql-backup.timer");
  const restoreService = read("../systemd/workspace-postgresql-restore-drill.service");
  const restoreTimer = read("../systemd/workspace-postgresql-restore-drill.timer");
  assert.match(backupService, /User=postgres/);
  assert.match(backupService, /UMask=0077/);
  assert.match(backupService, /EnvironmentFile=\/etc\/workspace\/postgresql\/backup\.env/);
  assert.doesNotMatch(backupService, /EnvironmentFile=-/);
  assert.match(backupTimer, /Persistent=true/);
  assert.match(restoreService, /User=root/);
  assert.match(restoreTimer, /Persistent=true/);
});

test("compatibility rollback restores legacy deploy ownership and disables hardened logins", () => {
  const source = read("./production-rollback.sql");
  assert.match(source, /ALTER DATABASE workspace OWNER TO workspace_app/);
  assert.match(source, /WHERE EXISTS \(SELECT 1 FROM pg_roles WHERE rolname='workspace_owner'\)/);
  assert.match(source, /WHERE rolname IN \('workspace_runtime','workspace_migrator','workspace_backup','workspace_monitor'\)/);
  assert.match(source, /format\('ALTER ROLE %I NOLOGIN', rolname\)/);
  assert.match(source, /format\('REVOKE ALL ON DATABASE workspace FROM %I', rolname\)/);
  assert.match(source, /\\gexec/);
  assert.match(source, /GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public\."_prisma_migrations" TO workspace_app/);
});
