import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
