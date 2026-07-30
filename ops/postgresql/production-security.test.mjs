import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(path.join(directory, name), "utf8");

test("production shell and Node entrypoints parse", () => {
  for (const name of [
    "production-finance-bot-hook.sh",
    "production-hba.sh",
    "production-legacy-pm2.sh",
    "production-runtime-pm2.sh",
    "production-security.sh",
  ]) {
    execFileSync("bash", ["-n", path.join(directory, name)]);
  }
  execFileSync(process.execPath, ["--check", path.join(directory, "production-pm2-plan.mjs")]);
});

test("HBA final is role and database exact while transition alone permits legacy", () => {
  const script = path.join(directory, "production-hba.sh");
  const transition = execFileSync(script, ["transition"], { encoding: "utf8" });
  const final = execFileSync(script, ["final"], { encoding: "utf8" });
  assert.match(final, /hostssl workspace\s+workspace_migrator\s+127\.0\.0\.1\/32/);
  assert.doesNotMatch(final, /hostssl all\s+workspace_migrator/);
  assert.match(final, /hostssl natsu\s+natsu_app/);
  assert.match(final, /host\s+all\s+all\s+127\.0\.0\.1\/32\s+reject/);
  assert.match(transition, /workspace_app/);
  assert.doesNotMatch(final, /workspace_app/);
});

test("role SQL is split, monitor-limited, legacy-clean, and contains no RLS policy", () => {
  const roles = read("production-roles.sql");
  const verify = read("production-verify.sql");
  assert.match(roles, /CREATE ROLE workspace_owner NOLOGIN/);
  assert.match(roles, /GRANT workspace_owner TO workspace_migrator WITH INHERIT FALSE, SET TRUE/);
  assert.match(roles, /GRANT SELECT ON TABLE public\."Department",public\."Position",public\."EmployeePosition",public\."Employee",public\."Employment",public\."LoginAttempt" TO workspace_monitor/);
  assert.doesNotMatch(roles, /GRANT SELECT ON ALL TABLES[^\n]+workspace_monitor/);
  assert.match(roles, /REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM workspace_app/);
  assert.match(verify, /legacy routine owner remains/);
  assert.match(verify, /legacy type owner remains/);
  assert.match(verify, /legacy database session remains/);
  assert.match(verify, /legacy owner or ACL dependency remains in workspace database/);
  assert.match(verify, /monitor may select a non-allowlisted relation/);
  assert.match(verify, /pg_shdepend/);
  assert.match(verify, /RLS baseline changed; RLS is outside this cutover/);
  assert.doesNotMatch(roles + verify, /CREATE POLICY|ENABLE ROW LEVEL SECURITY|FORCE ROW LEVEL SECURITY/i);
});

test("orchestrator is receipt-bound, health/version-gated, narrow, and reversible", () => {
  const security = read("production-security.sh");
  const service = read("production-workspace-runtime.service");
  assert.match(security, /pg_dumpall --globals-only --no-role-passwords/);
  assert.match(security, /http:\/\/127\.0\.0\.1:3000\/workspace\/api\/internal\/health/);
  assert.match(security, /http:\/\/127\.0\.0\.1:3000\/workspace\/api\/settings\/version/);
  assert.match(security, /version\.version !== process\.env\.EXPECTED_VERSION/);
  assert.match(security, /write_receipt applying/);
  assert.match(security, /apply 必须显式传 --execute/);
  assert.match(security, /rollback 必须显式传 --execute/);
  assert.match(security, /install_hba before/);
  assert.match(security, /snapshot_runtime_env_links "\$backup_dir\/pm2-plan\.json" "\$backup_dir\/runtime-env-links\.before"/);
  assert.match(security, /switch_runtime_env_links "\$backup_dir\/runtime-env-links\.before"/);
  assert.match(security, /verify_runtime_env_links "\$backup_dir\/runtime-env-links\.before"/);
  assert.match(security, /restore_runtime_env_links "\$backup_dir\/runtime-env-links\.before"/);
  assert.match(security, /runtimeEnvLinksSha256/);
  assert.match(security, /mv -Tf -- "\$temporary" "\$link"/);
  assert.match(security, /install -d -o root -g root -m 0755 \/etc\/workspace/);
  assert.match(security, /url\.searchParams\.get\("sslmode"\) !== "verify-full"/);
  assert.match(security, /url\.searchParams\.get\("sslrootcert"\) !== "\/etc\/workspace\/postgresql\/ca\.pem"/);
  assert.match(security, /data\/docs-editor\/templates/);
  assert.match(security, /data\/backups/);
  assert.doesNotMatch(security, /for relative in[^\n]*\bdata\b(?:\s|$)/);
  assert.doesNotMatch(security, /MONITOR_USER|workspace-monitor/);
  assert.doesNotMatch(service, /ReadWritePaths=.*\.workspace\/data(?:\s|$)/);
  assert.match(service, /ReadWritePaths=-\/home\/ubuntu\/workspace\/\.workspace\/cache\/production\/qc/);
  assert.match(service, /ProtectHome=read-only/);
});

test("finance bot keeps trusted OS user while taking only the monitor URL", () => {
  const hook = read("production-finance-bot-hook.sh");
  const unit = read("production-finance-bot.conf");
  assert.match(hook, /finance bot 必须保留 User=ubuntu/);
  assert.match(hook, /os\.environ\.get\("WORKSPACE_DATABASE_URL"/);
  assert.match(hook, /finance-bot\.py\.before/);
  assert.match(hook, /systemctl restart "\$SERVICE"/);
  assert.doesNotMatch(unit, /^User=/m);
  assert.match(unit, /EnvironmentFile=\/etc\/workspace\/finance-bot\.env/);
  assert.match(unit, /workspace-security\/finance-bot\.py/);
});

test("PM2 plan migrates exactly two processes and drops secret environment", () => {
  const temporary = mkdtempSync(path.join(tmpdir(), "workspace-pm2-plan-"));
  try {
    const input = path.join(temporary, "jlist.json");
    const output = path.join(temporary, "plan.json");
    const runtimeRoot = path.join(temporary, "runtime");
    const processCwd = path.join(runtimeRoot, "releases", "example");
    mkdirSync(processCwd, { recursive: true });
    const base = (name) => ({
      name,
      pm2_env: {
        pm_exec_path: process.execPath,
        pm_cwd: processCwd,
        args: ["server.js"],
        PORT: name === "workspace" ? "3000" : "3010",
        DATABASE_URL: "postgresql://workspace_app:must-not-survive@127.0.0.1/workspace",
        DIRECT_URL: "postgresql://workspace_app:must-not-survive@127.0.0.1/workspace",
      },
    });
    const fixture = [base("workspace"), base("workspace-wecom-agent"), { name: "natsu", pm2_env: {} }];
    writeFileSync(input, JSON.stringify(fixture));
    execFileSync(process.execPath, [path.join(directory, "production-pm2-plan.mjs"), "create", "--input", input, "--output", output, "--remote-root", runtimeRoot]);
    const planText = readFileSync(output, "utf8");
    const plan = JSON.parse(planText);
    assert.deepEqual(plan.processes.map((entry) => entry.name), ["workspace", "workspace-wecom-agent"]);
    assert.doesNotMatch(planText, /DATABASE_URL|DIRECT_URL|must-not-survive/);
    assert.equal(statSync(output).mode & 0o777, 0o600);

    writeFileSync(input, JSON.stringify([...fixture, base("workspace-candidate")]));
    const extra = spawnSync(process.execPath, [path.join(directory, "production-pm2-plan.mjs"), "create", "--input", input, "--output", output, "--remote-root", runtimeRoot]);
    assert.notEqual(extra.status, 0);

    writeFileSync(input, JSON.stringify([base("workspace"), base("workspace"), base("workspace-wecom-agent")]));
    const duplicate = spawnSync(process.execPath, [path.join(directory, "production-pm2-plan.mjs"), "create", "--input", input, "--output", output, "--remote-root", runtimeRoot]);
    assert.notEqual(duplicate.status, 0);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("PM2 wrappers preserve only allowlisted process values and strip control URLs", () => {
  const runtime = read("production-runtime-pm2.sh");
  assert.match(runtime, /process_environment=\(\)/);
  assert.match(runtime, /WORKSPACE_PM2_PROCESS_\$key/);
  assert.match(runtime, /unset DIRECT_URL SHADOW_DATABASE_URL WORKSPACE_BACKUP_DATABASE_URL WORKSPACE_MONITOR_DATABASE_URL/);
  assert.match(runtime, /unset PGPASSWORD PGPASSFILE PGSERVICE PGSERVICEFILE PGOPTIONS PGUSER PGHOST PGDATABASE/);
  assert.match(runtime, /export \"\$key=\$value\"/);
  assert.doesNotMatch(runtime, /env -i[^\n]*DIRECT_URL/);
});

test("runtime env and PM2 verification reject alternate PostgreSQL credentials", () => {
  const security = read("production-security.sh");
  const runtime = read("production-runtime-pm2.sh");
  const plan = read("production-pm2-plan.mjs");
  for (const key of ["WORKSPACE_BACKUP_DATABASE_URL", "WORKSPACE_MONITOR_DATABASE_URL", "PGPASSWORD", "PGPASSFILE", "PGOPTIONS", "PGUSER"]) {
    assert.match(security, new RegExp(key));
    assert.match(runtime, new RegExp(key));
    assert.match(plan, new RegExp(key));
  }
  assert.match(plan, /Object\.hasOwn\(processEnv, key\)/);
});
