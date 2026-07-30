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
    "production-install.sh",
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
  assert.match(security, /http:\/\/127\.0\.0\.1:3001\/health/);
  assert.match(security, /version\.version !== process\.env\.EXPECTED_VERSION/);
  assert.match(security, /verify_natsu_tls_sessions/);
  assert.match(security, /a\.datname='natsu' AND a\.usename='natsu_app'/);
  assert.match(security, /write_receipt applying/);
  assert.match(security, /apply 必须显式传 --execute/);
  assert.match(security, /rollback 必须显式传 --execute/);
  assert.match(security, /CONTROLLED_TOOL_ROOT="\/usr\/local\/lib\/workspace-postgresql"/);
  assert.match(security, /assert_controlled_tooling/);
  assert.match(security, /production-security\.sh 必须从受控路径/);
  const fileInvocations = [...security.matchAll(/psql[^\n]*-f "\$SCRIPT_DIR\/production-[^"]+"/g)]
    .map((match) => match[0]);
  assert.equal(fileInvocations.length, 4);
  assert.ok(fileInvocations.every((invocation) => invocation.includes("-v ON_ERROR_STOP=1")));
  assert.match(security, /install_hba before/);
  assert.match(security, /snapshot_runtime_env_links "\$backup_dir\/pm2-plan\.json" "\$backup_dir\/runtime-env-links\.before"/);
  assert.match(security, /switch_runtime_env_links "\$backup_dir\/runtime-env-links\.before"/);
  assert.match(security, /verify_runtime_env_links "\$backup_dir\/runtime-env-links\.before"/);
  assert.match(security, /restore_runtime_env_links "\$backup_dir\/runtime-env-links\.before"/);
  assert.match(security, /runtimeEnvLinksSha256/);
  assert.match(security, /mv -Tf -- "\$temporary" "\$link"/);
  assert.match(security, /legacy_pm2 jlist \| node "\$SCRIPT_DIR\/production-pm2-plan\.mjs" create --input -/);
  assert.doesNotMatch(security, /pm2-before\.json/);
  assert.match(security, /systemctl start workspace-runtime-pm2\.service/);
  assert.match(security, /systemctl reset-failed workspace-runtime-pm2\.service/);
  assert.ok(
    security.indexOf("systemctl reset-failed workspace-runtime-pm2.service")
      < security.indexOf("systemctl start workspace-runtime-pm2.service"),
    "the orchestrator must clear a stale systemd failure before starting PM2",
  );
  assert.match(security, /verify_runtime_systemd_pm2_daemon/);
  assert.match(security, /verify_runtime_systemd_pm2_processes/);
  assert.match(security, /systemctl show workspace-runtime-pm2\.service -p MainPID --value/);
  assert.match(security, /systemctl show workspace-runtime-pm2\.service -p ControlGroup --value/);
  assert.match(security, /pm2_pid="\$\(< \/var\/lib\/workspace-runtime\/\.pm2\/pm2\.pid\)"/);
  assert.doesNotMatch(security, /IFS= read -r pm2_pid/);
  assert.match(security, /\/proc\/\$pid\/cgroup/);
  assert.match(security, /systemctl disable --now workspace-runtime-pm2\.service/);
  assert.ok(
    security.indexOf("systemctl start workspace-runtime-pm2.service")
      < security.indexOf('production-pm2-plan.mjs" apply'),
    "systemd must own the PM2 daemon before applying the process plan",
  );
  const rollbackStart = security.indexOf('else\n  [ "$EXECUTE" = 1 ] || { echo "[错误] rollback');
  const rollbackBranch = security.slice(rollbackStart);
  assert.ok(rollbackStart > 0);
  assert.ok(
    rollbackBranch.indexOf('install_hba before "$backup_dir"')
      < rollbackBranch.indexOf('production-pm2-plan.mjs" apply'),
    "rollback must restore the legacy HBA before starting legacy PM2",
  );
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
  const staleDaemonKill = service.indexOf("ExecStartPre=-/usr/bin/pm2 kill");
  const stalePidRemove = service.indexOf("ExecStartPre=/usr/bin/rm -f -- /var/lib/workspace-runtime/.pm2/pm2.pid");
  const daemonStart = service.indexOf("ExecStart=/bin/sh -ec '/usr/bin/pm2 ping");
  assert.ok(staleDaemonKill >= 0 && staleDaemonKill < stalePidRemove && stalePidRemove < daemonStart);
  assert.deepEqual(
    service.match(/^ExecStartPre=.*\/usr\/bin\/rm.*$/gm),
    ["ExecStartPre=/usr/bin/rm -f -- /var/lib/workspace-runtime/.pm2/pm2.pid"],
  );
  assert.doesNotMatch(service, /ExecStartPre=.*(?:dump\.pm2|\/home\/ubuntu\/workspace\/(?:current|releases)|\*)/);
  assert.match(service, /ExecStart=.*pm2 ping/);
  assert.match(service, /if \[ -s \/var\/lib\/workspace-runtime\/\.pm2\/dump\.pm2 \]/);
  assert.match(service, /ExecStartPost=.*pm2\.pid/);
  assert.match(service, /ExecStop=\/usr\/bin\/pm2 kill/);
});

test("production tooling installer pins root ownership and postgres-readable SQL", () => {
  const installer = read("production-install.sh");
  assert.match(installer, /TOOL_ROOT="\/usr\/local\/lib\/workspace-postgresql"/);
  assert.match(installer, /install -d -o root -g root -m 0755 "\$TOOL_ROOT"/);
  assert.match(installer, /\*\.sql\|\*\.service\|\*\.conf\) mode=0644/);
  assert.match(installer, /install -o root -g root -m "\$mode"/);
  assert.match(installer, /runuser -u postgres -- test -r "\$sql"/);
  assert.match(installer, /mv -Tf -- "\$temporary" "\$destination"/);
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

    const stdinOutput = path.join(temporary, "plan-from-stdin.json");
    execFileSync(process.execPath, [
      path.join(directory, "production-pm2-plan.mjs"),
      "create",
      "--input", "-",
      "--output", stdinOutput,
      "--remote-root", runtimeRoot,
    ], { input: JSON.stringify(fixture) });
    assert.deepEqual(
      JSON.parse(readFileSync(stdinOutput, "utf8")).processes.map((entry) => entry.name),
      ["workspace", "workspace-wecom-agent"],
    );

    const runner = path.join(temporary, "runtime-runner.mjs");
    const actual = plan.processes.map((entry, index) => ({
      name: entry.name,
      pid: 4100 + index,
      pm2_env: {
        status: "online",
        DATABASE_URL: "postgresql://workspace_runtime:redacted@127.0.0.1/workspace",
      },
    }));
    writeFileSync(
      runner,
      `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify(actual))});\n`,
      { mode: 0o755 },
    );
    const pidRows = execFileSync(process.execPath, [
      path.join(directory, "production-pm2-plan.mjs"),
      "pids",
      "--plan", output,
      "--runner", runner,
    ], { encoding: "utf8" }).trim().split("\n");
    assert.deepEqual(pidRows, ["workspace|4100", "workspace-wecom-agent|4101"]);

    const applyPlan = JSON.parse(planText);
    const workspaceSpec = applyPlan.processes.find((entry) => entry.name === "workspace");
    const wecomSpec = applyPlan.processes.find((entry) => entry.name === "workspace-wecom-agent");
    workspaceSpec.args = [];
    wecomSpec.args = ["server.js", "--worker"];
    writeFileSync(output, JSON.stringify(applyPlan));
    const captureFile = path.join(temporary, "runner-argv.ndjson");
    const captureRunner = path.join(temporary, "capture-runner.mjs");
    writeFileSync(
      captureRunner,
      `#!/usr/bin/env node\nimport { appendFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(captureFile)}, JSON.stringify(process.argv.slice(2)) + "\\n");\n`,
      { mode: 0o755 },
    );
    execFileSync(process.execPath, [
      path.join(directory, "production-pm2-plan.mjs"),
      "apply",
      "--plan", output,
      "--runner", captureRunner,
    ]);
    const capturedArgs = readFileSync(captureFile, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    const argsByName = new Map(capturedArgs.map((args) => [args[args.indexOf("--name") + 1], args]));
    assert.deepEqual(argsByName.get("workspace"), [
      "start", workspaceSpec.executable, "--name", "workspace", "--cwd", workspaceSpec.cwd, "--update-env",
    ]);
    assert.deepEqual(argsByName.get("workspace-wecom-agent"), [
      "start", wecomSpec.executable, "--name", "workspace-wecom-agent", "--cwd", wecomSpec.cwd, "--update-env",
      "--", "server.js", "--worker",
    ]);

    const failingRunner = path.join(temporary, "failing-runner.mjs");
    writeFileSync(
      failingRunner,
      "#!/usr/bin/env node\nprocess.stderr.write('postgresql://workspace_runtime:database-secret@127.0.0.1/workspace?token=token-secret\\nsecond-line-secret\\n');\nprocess.exit(42);\n",
      { mode: 0o755 },
    );
    const failedApply = spawnSync(process.execPath, [
      path.join(directory, "production-pm2-plan.mjs"),
      "apply",
      "--plan", output,
      "--runner", failingRunner,
    ], { encoding: "utf8" });
    assert.notEqual(failedApply.status, 0);
    assert.match(failedApply.stderr, /exit=42/);
    assert.match(failedApply.stderr, /\[REDACTED\]/);
    assert.doesNotMatch(failedApply.stderr, /database-secret|token-secret|second-line-secret/);

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
