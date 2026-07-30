import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(path.join(directory, name), "utf8");
const pm2PlanTool = path.join(directory, "production-pm2-plan.mjs");

function digestFile(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function writeGatewayOwner(root, {
  owner = "fallback",
  slot = "blue",
  committed = true,
  stateSlot = slot,
  routeSlot = slot,
} = {}) {
  const gatewayRoot = path.join(root, "gateway");
  const generationId = (slot === "blue" ? "a" : "b").repeat(64);
  const generation = path.join(gatewayRoot, "generations", generationId);
  const stateRoot = path.join(generation, "unit-states");
  mkdirSync(stateRoot, { recursive: true });
  const active = {
    unitId: "assistant",
    releaseId: `assistant-${routeSlot}`,
    deploymentId: `assistant-${routeSlot}`,
    slot: routeSlot,
    port: routeSlot === "blue" ? 3208 : 3308,
    releaseDir: path.join(root, "runtime", "releases", `assistant-${routeSlot}`),
    receiptSha256: "c".repeat(64),
  };
  if (owner === "assistant") {
    mkdirSync(active.releaseDir, { recursive: true });
    writeFileSync(path.join(active.releaseDir, "server.js"), "process.stdin.resume();\n");
    writeFileSync(path.join(active.releaseDir, ".assistant-runtime.json"), JSON.stringify({
      sidecars: [{
        processName: "workspace-assistant-wecom",
        entry: "server.js",
        bridgePath: "/api/integrations/wecom/agent",
      }],
    }));
    writeFileSync(path.join(active.releaseDir, "artifact.manifest.json"), JSON.stringify({
      build: { basePath: "/workspace" },
    }));
  }
  const routeMap = {
    schemaVersion: 1,
    kind: "workspace-gateway-route-map",
    generationId,
    activeUnits: owner === "assistant" ? [active] : [],
  };
  const routeMapFile = path.join(generation, "route-map.json");
  writeFileSync(routeMapFile, JSON.stringify(routeMap));
  const files = [{
    path: "route-map.json",
    size: statSync(routeMapFile).size,
    sha256: digestFile(routeMapFile),
  }];
  if (owner === "assistant") {
    const stateFile = path.join(stateRoot, "assistant.json");
    const state = {
      schemaVersion: 1,
      kind: "workspace-deploy-unit-state",
      unitId: "assistant",
      active: { ...active, slot: stateSlot },
    };
    writeFileSync(stateFile, JSON.stringify(state));
    files.push({
      path: "unit-states/assistant.json",
      size: statSync(stateFile).size,
      sha256: digestFile(stateFile),
    });
  }
  const manifestFile = path.join(generation, "generation-manifest.json");
  writeFileSync(manifestFile, JSON.stringify({
    schemaVersion: 1,
    kind: "workspace-gateway-generation",
    generationId,
    files,
  }));
  symlinkSync(path.join("generations", generationId), path.join(gatewayRoot, "current"));
  if (committed) writeFileSync(path.join(gatewayRoot, "committed-generation"), generationId + "\n");
  return { gatewayRoot, generationId, generation, active };
}

function pm2Entry(name, processCwd, state = "online", extraEnvironment = {}) {
  return {
    name,
    pid: state === "online" ? 4100 : 0,
    pm2_env: {
      pm_exec_path: process.execPath,
      pm_cwd: processCwd,
      args: ["server.js"],
      status: state === "online" ? "online" : "stopped",
      PORT: name === "workspace" ? "3000" : "3010",
      DATABASE_URL: "postgresql://workspace_app:must-not-survive@127.0.0.1/workspace",
      DIRECT_URL: "postgresql://workspace_app:must-not-survive@127.0.0.1/workspace",
      ...extraEnvironment,
    },
  };
}

function createPlan({ input, output, runtimeRoot, gatewayRoot }) {
  return spawnSync(process.execPath, [
    pm2PlanTool,
    "create",
    "--input", input,
    "--output", output,
    "--remote-root", runtimeRoot,
    "--gateway-root", gatewayRoot,
  ], { encoding: "utf8" });
}

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
  assert.doesNotMatch(roles + verify + read("production-security.sh"), /CREATE POLICY|ENABLE ROW LEVEL SECURITY|FORCE ROW LEVEL SECURITY/i);
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
  assert.match(
    security,
    /legacy_pm2 jlist \| node "\$SCRIPT_DIR\/production-pm2-plan\.mjs" create --input - --output "\$backup_dir\/pm2-plan\.json" --remote-root "\$REMOTE_ROOT" --gateway-root "\$CONFIG_ROOT\/gateway"/,
  );
  assert.match(security, /production-pm2-plan\.mjs" names --plan "\$1"/);
  assert.doesNotMatch(security, /< <\(managed_process_names/);
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
  assert.match(security, /\/proc\/\$pid\/cgroup/);
  assert.match(security, /systemctl disable --now workspace-runtime-pm2\.service/);
  assert.doesNotMatch(service, /^EnvironmentFile=/m);
  assert.doesNotMatch(service, /^ExecReload=/m);
  assert.doesNotMatch(service, /pm2 reload all --update-env/);
  assert.ok(
    security.indexOf("systemctl start workspace-runtime-pm2.service")
      < security.indexOf('production-pm2-plan.mjs" apply'),
    "systemd must own the PM2 daemon before applying the process plan",
  );
  const applyBranchStart = security.indexOf('if [ "$COMMAND" = apply ]; then');
  const verifyBranchStart = security.indexOf('elif [ "$COMMAND" = verify ]; then');
  const applyBranch = security.slice(applyBranchStart, verifyBranchStart);
  const daemonVerified = applyBranch.indexOf("verify_runtime_systemd_pm2_daemon");
  const reconciled = applyBranch.indexOf('production-pm2-plan.mjs" reconcile');
  const rolesApplied = applyBranch.indexOf('production-roles.sql');
  const planApplied = applyBranch.indexOf('production-pm2-plan.mjs" apply');
  assert.ok(daemonVerified >= 0 && daemonVerified < reconciled && reconciled < rolesApplied && rolesApplied < planApplied);
  assert.ok(
    applyBranch.indexOf('managed_names="$(managed_process_names')
      < applyBranch.indexOf("write_receipt applying"),
    "apply must validate the Gateway-bound process names before changing receipt or runtime state",
  );
  const rollbackStart = security.indexOf('else\n  [ "$EXECUTE" = 1 ] || { echo "[错误] rollback');
  const rollbackBranch = security.slice(rollbackStart);
  assert.ok(rollbackStart > 0);
  assert.ok(
    rollbackBranch.indexOf('managed_names="$(managed_process_names')
      < rollbackBranch.indexOf("systemctl stop finance-bot.service"),
    "rollback must validate the Gateway-bound process names before changing runtime state",
  );
  assert.ok(
    rollbackBranch.indexOf('install_hba before "$backup_dir"')
      < rollbackBranch.indexOf('setfacl --restore="$backup_dir/workspace-acl.before"')
      && rollbackBranch.indexOf('setfacl --restore="$backup_dir/workspace-acl.before"')
        < rollbackBranch.indexOf('production-pm2-plan.mjs" apply'),
    "rollback must restore legacy HBA and ACLs before starting legacy PM2",
  );
  assert.match(security, /install -d -o root -g root -m 0755 \/etc\/workspace/);
  assert.match(security, /url\.searchParams\.get\("sslmode"\) !== "verify-full"/);
  assert.match(security, /url\.searchParams\.get\("sslrootcert"\) !== "\/etc\/workspace\/postgresql\/ca\.pem"/);
  assert.match(security, /data\/docs-editor\/templates/);
  assert.match(security, /data\/backups/);
  const runtimeRwTargets = security.slice(
    security.indexOf("runtime_rw_targets() {"),
    security.indexOf("runtime_ro_targets() {"),
  );
  assert.doesNotMatch(runtimeRwTargets, /for relative in[^\n]*\bdata\b(?:\s|$)/);
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

test("runtime control-plane roots use one reversible deny list", () => {
  const security = read("production-security.sh");
  const protectedStart = security.indexOf("protected_control_paths() {");
  const denyStart = security.indexOf("deny_runtime_control_paths() {");
  const backupStart = security.indexOf("backup_runtime_acls() {");
  const installStart = security.indexOf("install_runtime_permissions() {");
  const verifyStart = security.indexOf("verify_runtime_permissions() {");
  assert.ok(protectedStart >= 0 && denyStart > protectedStart && backupStart > denyStart);
  assert.ok(installStart > backupStart && verifyStart > installStart);

  const protectedBody = security.slice(protectedStart, denyStart);
  for (const target of [
    "$CONTROL_ENV_TARGET",
    "$FINANCE_ENV_TARGET",
    "$STATE_ROOT",
    "$BACKUP_ROOT",
    "$CONFIG_ROOT/.deployment",
    "$CONFIG_ROOT/deployment-history",
    "$CONFIG_ROOT/data-release-manifests",
    "$CONFIG_ROOT/data-release-sources",
    "$CONFIG_ROOT/internal-unit-identities",
    "$CONFIG_ROOT/security-hardening-inputs",
    "$REMOTE_ROOT/.workspace.backups",
  ]) {
    assert.match(protectedBody, new RegExp(target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(protectedBody, /find "\$CONFIG_ROOT" -maxdepth 1 -type f -name '\.env\*'/);

  const denyBody = security.slice(denyStart, backupStart);
  assert.match(denyBody, /setfacl -m "u:\$RUNTIME_USER:---" "\$target"/);
  assert.doesNotMatch(denyBody, /setfacl -R/);
  assert.match(security.slice(backupStart, installStart), /protected_control_paths/);
  assert.match(security.slice(installStart, verifyStart), /deny_runtime_control_paths/);
  assert.match(security.slice(verifyStart, security.indexOf("install_hba() {")), /protected_control_paths/);
  assert.match(security, /install -d -o root -g root -m 0700 "\$STATE_ROOT" "\$BACKUP_ROOT"/);
  assert.match(security, /install -d -o root -g root -m 0700 "\$backup_dir"/);
  assert.match(security, /setfacl --restore="\$backup_dir\/workspace-acl\.before"/);
});

test("company brand assets are read-only through traverse-only parents", () => {
  const security = read("production-security.sh");
  const rwStart = security.indexOf("runtime_rw_targets() {");
  const roStart = security.indexOf("runtime_ro_targets() {");
  const traverseStart = security.indexOf("runtime_traverse_only_targets() {");
  const protectedStart = security.indexOf("protected_data_directories() {");
  const backupStart = security.indexOf("backup_runtime_acls() {");
  const installStart = security.indexOf("install_runtime_permissions() {");
  const verifyStart = security.indexOf("verify_runtime_permissions() {");
  const hbaStart = security.indexOf("install_hba() {");
  const rwBody = security.slice(rwStart, roStart);
  const roBody = security.slice(roStart, traverseStart);
  const traverseBody = security.slice(traverseStart, protectedStart);
  const backupBody = security.slice(backupStart, security.indexOf("backup_optional_file() {"));
  const installBody = security.slice(installStart, verifyStart);
  const verifyBody = security.slice(verifyStart, hbaStart);

  assert.doesNotMatch(rwBody, /assets\/brand(?:\/company)?/);
  assert.match(roBody, /assets\/brand\/company/);
  assert.doesNotMatch(roBody, /(?:^|\s)assets(?:\s|$)/m);
  assert.match(traverseBody, /for relative in data assets assets\/brand/);
  assert.doesNotMatch(traverseBody, /assets\/brand\/company/);
  assert.match(backupBody, /getfacl -p "\$target"[\s\S]*runtime_traverse_only_targets/);
  assert.match(backupBody, /getfacl -Rp "\$target"[\s\S]*runtime_ro_targets/);
  assert.match(installBody, /setfacl -m "u:\$RUNTIME_USER:--x" "\$target"[\s\S]*runtime_traverse_only_targets/);
  assert.match(installBody, /setfacl -Rm "u:\$RUNTIME_USER:rX" "\$target"[\s\S]*runtime_ro_targets/);
  assert.doesNotMatch(installBody, /assets(?:\/brand)?[^\n]*rwX/);
  assert.match(verifyBody, /test -x "\$target"[\s\S]*test -r "\$target"[\s\S]*test -w "\$target"[\s\S]*runtime_traverse_only_targets/);
  assert.match(verifyBody, /runtime 用户可读取或写入 traverse-only 路径/);
  assert.match(verifyBody, /test -r "\$target"[\s\S]*test -x "\$target"[\s\S]*test -w "\$target"[\s\S]*runtime_ro_targets/);
  assert.match(verifyBody, /runtime 用户可写只读路径/);
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

test("PM2 plan accepts the first legacy fallback and drops secret environment", () => {
  const temporary = mkdtempSync(path.join(tmpdir(), "workspace-pm2-plan-"));
  try {
    const input = path.join(temporary, "jlist.json");
    const output = path.join(temporary, "plan.json");
    const runtimeRoot = path.join(temporary, "runtime");
    const gatewayRoot = path.join(temporary, "gateway");
    const processCwd = path.join(runtimeRoot, "releases", "example");
    mkdirSync(processCwd, { recursive: true });
    const base = (name) => pm2Entry(name, processCwd);
    const fixture = [base("workspace"), base("workspace-wecom-agent"), { name: "natsu", pm2_env: {} }];
    writeFileSync(input, JSON.stringify(fixture));
    const created = createPlan({ input, output, runtimeRoot, gatewayRoot });
    assert.equal(created.status, 0, created.stderr);
    const planText = readFileSync(output, "utf8");
    const plan = JSON.parse(planText);
    assert.equal(plan.schemaVersion, 2);
    assert.equal(plan.gateway.mode, "legacy");
    assert.equal(plan.gateway.owner, "fallback");
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
      "--gateway-root", gatewayRoot,
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
        ...(entry.name === "workspace" ? {
          DATABASE_URL: "postgresql://workspace_runtime:redacted@127.0.0.1/workspace",
        } : {}),
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
      "#!/usr/bin/env node\nif(process.argv[2]==='jlist'){process.stdout.write('[]');process.exit(0);}\nprocess.stderr.write('postgresql://workspace_runtime:database-secret@127.0.0.1/workspace?token=token-secret\\nsecond-line-secret\\n');\nprocess.exit(42);\n",
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
    const extra = createPlan({ input, output, runtimeRoot, gatewayRoot });
    assert.notEqual(extra.status, 0);

    writeFileSync(input, JSON.stringify([base("workspace"), base("workspace"), base("workspace-wecom-agent")]));
    const duplicate = createPlan({ input, output, runtimeRoot, gatewayRoot });
    assert.notEqual(duplicate.status, 0);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("PM2 plan validates committed and explicit markerless fallback ownership", () => {
  const temporary = mkdtempSync(path.join(tmpdir(), "workspace-pm2-fallback-"));
  try {
    for (const committed of [true, false]) {
      const root = path.join(temporary, committed ? "committed" : "legacy-generation");
      const runtimeRoot = path.join(root, "runtime");
      const processCwd = path.join(runtimeRoot, "releases", "example");
      const input = path.join(root, "jlist.json");
      const output = path.join(root, "plan.json");
      mkdirSync(processCwd, { recursive: true });
      const { gatewayRoot } = writeGatewayOwner(root, { owner: "fallback", committed });
      writeFileSync(input, JSON.stringify([
        pm2Entry("workspace", processCwd),
        pm2Entry("workspace-wecom-agent", processCwd),
        pm2Entry("workspace-assistant-wecom-blue", processCwd, "inactive"),
      ]));
      const result = createPlan({ input, output, runtimeRoot, gatewayRoot });
      assert.equal(result.status, 0, result.stderr);
      const plan = JSON.parse(readFileSync(output, "utf8"));
      assert.equal(plan.gateway.owner, "fallback");
      assert.equal(plan.gateway.mode, committed ? "committed" : "legacy-fallback-generation");
      assert.deepEqual(plan.processes.map((entry) => [entry.name, entry.desiredState]), [
        ["workspace", "online"],
        ["workspace-assistant-wecom-blue", "inactive"],
        ["workspace-wecom-agent", "online"],
      ]);
      assert.deepEqual(plan.capturedProcessNames, [
        "workspace",
        "workspace-assistant-wecom-blue",
        "workspace-wecom-agent",
      ]);

      writeFileSync(input, JSON.stringify([
        pm2Entry("workspace", processCwd),
        pm2Entry("workspace-wecom-agent", processCwd),
        pm2Entry("workspace-assistant-wecom-blue", processCwd),
      ]));
      const dualOwner = createPlan({ input, output, runtimeRoot, gatewayRoot });
      assert.notEqual(dualOwner.status, 0);
      assert.match(dualOwner.stderr, /作为非 owner 必须 absent\/inactive/);
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("PM2 plan migrates only the committed Assistant slot and preserves its runtime guard", () => {
  const temporary = mkdtempSync(path.join(tmpdir(), "workspace-pm2-assistant-"));
  try {
    const runtimeRoot = path.join(temporary, "runtime");
    const processCwd = path.join(runtimeRoot, "releases", "assistant-blue");
    const input = path.join(temporary, "jlist.json");
    const output = path.join(temporary, "plan.json");
    mkdirSync(processCwd, { recursive: true });
    const { gatewayRoot, active } = writeGatewayOwner(temporary, { owner: "assistant", slot: "blue" });
    const assistantEnvironment = {
      pm_exec_path: path.join(processCwd, "server.js"),
      WORKSPACE_CONFIG_DIR: temporary,
      WORKSPACE_DEPLOY_UNIT_ID: "assistant",
      WORKSPACE_DEPLOY_SLOT: "blue",
      WORKSPACE_DEPLOY_CURRENT_STATE_FILE: path.join(
        gatewayRoot, "current", "unit-states", "assistant.json",
      ),
      WECHAT_BOT_BRIDGE_URL: `http://127.0.0.1:${active.port}/workspace/api/integrations/wecom/agent`,
      PROJECT_NOTIFICATION_SCHEDULER_DISABLED: "1",
    };
    writeFileSync(input, JSON.stringify([
      pm2Entry("workspace", processCwd),
      pm2Entry("workspace-wecom-agent", processCwd, "inactive"),
      pm2Entry("workspace-assistant-wecom-blue", processCwd, "online", assistantEnvironment),
      pm2Entry("workspace-assistant-wecom-green", processCwd, "inactive"),
    ]));
    const result = createPlan({ input, output, runtimeRoot, gatewayRoot });
    assert.equal(result.status, 0, result.stderr);
    const plan = JSON.parse(readFileSync(output, "utf8"));
    assert.equal(plan.gateway.owner, "assistant");
    assert.equal(plan.gateway.slot, "blue");
    assert.deepEqual(plan.processes.map((entry) => [entry.name, entry.desiredState]), [
      ["workspace", "online"],
      ["workspace-assistant-wecom-blue", "online"],
      ["workspace-assistant-wecom-green", "inactive"],
      ["workspace-wecom-agent", "inactive"],
    ]);
    assert.deepEqual(
      plan.processes.find((entry) => entry.name === "workspace-assistant-wecom-blue").env,
      {
        PORT: "3010",
        PROJECT_NOTIFICATION_SCHEDULER_DISABLED: "1",
        WECHAT_BOT_BRIDGE_URL: assistantEnvironment.WECHAT_BOT_BRIDGE_URL,
        WORKSPACE_CONFIG_DIR: temporary,
        WORKSPACE_DEPLOY_CURRENT_STATE_FILE: assistantEnvironment.WORKSPACE_DEPLOY_CURRENT_STATE_FILE,
        WORKSPACE_DEPLOY_SLOT: "blue",
        WORKSPACE_DEPLOY_UNIT_ID: "assistant",
      },
    );

    const actual = [
      {
        name: "workspace",
        pid: 5100,
        pm2_env: {
          status: "online",
          DATABASE_URL: "postgresql://workspace_runtime:redacted@127.0.0.1/workspace",
        },
      },
      {
        name: "workspace-assistant-wecom-blue",
        pid: 5101,
        pm2_env: {
          status: "online",
          pm_exec_path: path.join(processCwd, "server.js"),
          pm_cwd: processCwd,
          WORKSPACE_DEPLOY_UNIT_ID: "assistant",
          WORKSPACE_DEPLOY_SLOT: "blue",
          WORKSPACE_DEPLOY_CURRENT_STATE_FILE: assistantEnvironment.WORKSPACE_DEPLOY_CURRENT_STATE_FILE,
          WECHAT_BOT_BRIDGE_URL: assistantEnvironment.WECHAT_BOT_BRIDGE_URL,
        },
      },
      { name: "workspace-wecom-agent", pid: 0, pm2_env: { status: "stopped" } },
      { name: "workspace-assistant-wecom-green", pid: 0, pm2_env: { status: "stopped" } },
    ];
    const runner = path.join(temporary, "runner.mjs");
    writeFileSync(
      runner,
      `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify(actual))});\n`,
      { mode: 0o755 },
    );
    const pids = execFileSync(process.execPath, [
      pm2PlanTool, "pids", "--plan", output, "--runner", runner,
    ], { encoding: "utf8" }).trim().split("\n");
    assert.deepEqual(pids, [
      "workspace|5100",
      "workspace-assistant-wecom-blue|5101",
    ]);
    for (const forbiddenKey of ["DATABASE_URL", "NEXTAUTH_SECRET", "ONLYOFFICE_JWT_SECRET"]) {
      const leakedActual = structuredClone(actual);
      leakedActual.find((entry) => entry.name === "workspace-assistant-wecom-blue")
        .pm2_env[forbiddenKey] = "must-not-reach-bot";
      writeFileSync(
        runner,
        `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify(leakedActual))});\n`,
        { mode: 0o755 },
      );
      const leaked = spawnSync(process.execPath, [
        pm2PlanTool, "verify", "--plan", output, "--runner", runner,
      ], { encoding: "utf8" });
      assert.notEqual(leaked.status, 0, forbiddenKey);
      assert.match(leaked.stderr, /泄露数据库或 Web control-plane 环境/);
      assert.doesNotMatch(leaked.stderr, /must-not-reach-bot/);
    }

    rmSync(path.join(gatewayRoot, "current"));
    rmSync(path.join(gatewayRoot, "committed-generation"));
    const promoted = writeGatewayOwner(temporary, { owner: "assistant", slot: "green" });
    rmSync(active.releaseDir, { recursive: true, force: true });
    const greenStateFile = path.join(
      gatewayRoot, "current", "unit-states", "assistant.json",
    );
    const promotedActual = [
      actual[0],
      { name: "workspace-wecom-agent", pid: 0, pm2_env: { status: "stopped" } },
      { name: "workspace-assistant-wecom-blue", pid: 0, pm2_env: { status: "stopped" } },
      {
        name: "workspace-assistant-wecom-green",
        pid: 5201,
        pm2_env: {
          status: "online",
          pm_exec_path: path.join(promoted.active.releaseDir, "server.js"),
          pm_cwd: promoted.active.releaseDir,
          WORKSPACE_DEPLOY_UNIT_ID: "assistant",
          WORKSPACE_DEPLOY_SLOT: "green",
          WORKSPACE_DEPLOY_CURRENT_STATE_FILE: greenStateFile,
          WECHAT_BOT_BRIDGE_URL:
            `http://127.0.0.1:${promoted.active.port}/workspace/api/integrations/wecom/agent`,
        },
      },
    ];
    writeFileSync(
      runner,
      `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify(promotedActual))});\n`,
      { mode: 0o755 },
    );
    const promotedPids = execFileSync(process.execPath, [
      pm2PlanTool, "pids", "--plan", output, "--runner", runner,
    ], { encoding: "utf8" }).trim().split("\n");
    assert.deepEqual(promotedPids, [
      "workspace|5100",
      "workspace-assistant-wecom-green|5201",
    ]);
    const managedNames = execFileSync(process.execPath, [
      pm2PlanTool, "names", "--plan", output,
    ], { encoding: "utf8" }).trim().split("\n");
    assert.deepEqual(managedNames, [
      "workspace",
      "workspace-assistant-wecom-blue",
      "workspace-assistant-wecom-green",
      "workspace-wecom-agent",
    ]);
    const staleRestore = spawnSync(process.execPath, [
      pm2PlanTool, "names", "--plan", output, "--require-current-specs",
    ], { encoding: "utf8" });
    assert.notEqual(staleRestore.status, 0);
    assert.match(staleRestore.stderr, /committed Assistant sidecar (?:exec\/cwd 不可解析|与 Gateway active runtime 不一致)/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("PM2 reconcile preserves the online committed Assistant sidecar", () => {
  const temporary = mkdtempSync(path.join(tmpdir(), "workspace-pm2-assistant-reconcile-"));
  try {
    const runtimeRoot = path.join(temporary, "runtime");
    const processCwd = path.join(runtimeRoot, "releases", "assistant-blue");
    const input = path.join(temporary, "jlist.json");
    const output = path.join(temporary, "plan.json");
    const stateFile = path.join(temporary, "state.json");
    const captureFile = path.join(temporary, "runner-argv.ndjson");
    const runner = path.join(temporary, "runner.mjs");
    mkdirSync(processCwd, { recursive: true });
    const { gatewayRoot, active } = writeGatewayOwner(temporary, { owner: "assistant", slot: "blue" });
    const assistantEnvironment = {
      pm_exec_path: path.join(processCwd, "server.js"),
      WORKSPACE_CONFIG_DIR: temporary,
      WORKSPACE_DEPLOY_UNIT_ID: "assistant",
      WORKSPACE_DEPLOY_SLOT: "blue",
      WORKSPACE_DEPLOY_CURRENT_STATE_FILE: path.join(
        gatewayRoot, "current", "unit-states", "assistant.json",
      ),
      WECHAT_BOT_BRIDGE_URL: `http://127.0.0.1:${active.port}/workspace/api/integrations/wecom/agent`,
    };
    writeFileSync(input, JSON.stringify([
      pm2Entry("workspace", processCwd),
      pm2Entry("workspace-wecom-agent", processCwd, "inactive"),
      pm2Entry("workspace-assistant-wecom-blue", processCwd, "online", assistantEnvironment),
      pm2Entry("workspace-assistant-wecom-green", processCwd, "inactive"),
    ]));
    const created = createPlan({ input, output, runtimeRoot, gatewayRoot });
    assert.equal(created.status, 0, created.stderr);
    writeFileSync(stateFile, JSON.stringify([
      {
        name: "workspace",
        pid: 5100,
        pm2_env: {
          status: "online",
          DATABASE_URL: "postgresql://workspace_runtime:redacted@127.0.0.1/workspace",
        },
      },
      { name: "workspace-wecom-agent", pid: 0, pm2_env: { status: "stopped" } },
      {
        name: "workspace-assistant-wecom-blue",
        pid: 5101,
        pm2_env: {
          status: "online",
          pm_exec_path: assistantEnvironment.pm_exec_path,
          pm_cwd: processCwd,
          WORKSPACE_DEPLOY_UNIT_ID: "assistant",
          WORKSPACE_DEPLOY_SLOT: "blue",
          WORKSPACE_DEPLOY_CURRENT_STATE_FILE: assistantEnvironment.WORKSPACE_DEPLOY_CURRENT_STATE_FILE,
          WECHAT_BOT_BRIDGE_URL: assistantEnvironment.WECHAT_BOT_BRIDGE_URL,
        },
      },
      { name: "workspace-assistant-wecom-green", pid: 0, pm2_env: { status: "stopped" } },
      { name: "natsu-api", pid: 6100, pm2_env: { status: "online" } },
    ]));
    writeFileSync(captureFile, "");
    writeFileSync(
      runner,
      `#!/usr/bin/env node
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(captureFile)}, JSON.stringify(args) + "\\n");
const stateFile = ${JSON.stringify(stateFile)};
const state = JSON.parse(readFileSync(stateFile, "utf8"));
if (args[0] === "jlist" && args.length === 1) process.stdout.write(JSON.stringify(state));
else if (args[0] === "delete" && args.length === 2) writeFileSync(stateFile, JSON.stringify(state.filter((entry) => entry.name !== args[1])));
else if (args[0] === "start") {
  const name = args[args.indexOf("--name") + 1];
  const inactive = args.includes("--no-autostart");
  const nextPid = name === "workspace" ? 5200 : 5201;
  writeFileSync(stateFile, JSON.stringify([...state, {
    name,
    pid: inactive ? 0 : nextPid,
    pm2_env: {
      status: inactive ? "stopped" : "online",
      ...(name === "workspace" ? {
        DATABASE_URL: "postgresql://workspace_runtime:redacted@127.0.0.1/workspace",
      } : {}),
    },
  }]));
} else process.exit(9);
`,
      { mode: 0o755 },
    );

    const cleanState = JSON.parse(readFileSync(stateFile, "utf8"));
    for (const [label, key, value, pattern] of [
      ["database leak", "DATABASE_URL", "must-not-survive", /无法安全保留/],
      ["bridge drift", "WECHAT_BOT_BRIDGE_URL", "http://127.0.0.1:1/wrong", /active runtime 不一致/],
    ]) {
      const unsafeState = structuredClone(cleanState);
      unsafeState.find((entry) => entry.name === "workspace-assistant-wecom-blue").pm2_env[key] = value;
      writeFileSync(stateFile, JSON.stringify(unsafeState));
      writeFileSync(captureFile, "");
      const rejected = spawnSync(process.execPath, [
        pm2PlanTool, "reconcile", "--plan", output, "--runner", runner,
      ], { encoding: "utf8" });
      assert.notEqual(rejected.status, 0, label);
      assert.match(rejected.stderr, pattern, label);
      assert.doesNotMatch(rejected.stderr, /must-not-survive/, label);
      assert.deepEqual(JSON.parse(readFileSync(stateFile, "utf8")), unsafeState, label);
      assert.deepEqual(readFileSync(captureFile, "utf8").trim().split("\n").map(JSON.parse), [["jlist"]]);
    }
    writeFileSync(stateFile, JSON.stringify(cleanState));
    writeFileSync(captureFile, "");
    const reconciled = spawnSync(process.execPath, [
      pm2PlanTool, "reconcile", "--plan", output, "--runner", runner,
    ], { encoding: "utf8" });
    assert.equal(reconciled.status, 0, reconciled.stderr);
    assert.match(reconciled.stdout, /preserved workspace-assistant-wecom-blue/);
    assert.deepEqual(
      JSON.parse(readFileSync(stateFile, "utf8")).map((entry) => [entry.name, entry.pid]),
      [["workspace-assistant-wecom-blue", 5101], ["natsu-api", 6100]],
    );
    assert.deepEqual(readFileSync(captureFile, "utf8").trim().split("\n").map(JSON.parse), [
      ["jlist"],
      ["delete", "workspace"],
      ["delete", "workspace-wecom-agent"],
      ["delete", "workspace-assistant-wecom-green"],
      ["jlist"],
    ]);

    writeFileSync(captureFile, "");
    const applied = spawnSync(process.execPath, [
      pm2PlanTool, "apply", "--plan", output, "--runner", runner,
    ], { encoding: "utf8" });
    assert.equal(applied.status, 0, applied.stderr);
    const applyCalls = readFileSync(captureFile, "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(applyCalls[0][0], "jlist");
    const startCalls = applyCalls.filter((args) => args[0] === "start");
    assert.equal(startCalls.length, 3);
    assert.equal(startCalls.filter((args) => !args.includes("--no-autostart")).length, 1);
    assert.equal(startCalls.find((args) => !args.includes("--no-autostart"))[
      startCalls.find((args) => !args.includes("--no-autostart")).indexOf("--name") + 1
    ], "workspace");
    assert.deepEqual(startCalls.filter((args) => args.includes("--no-autostart"))
      .map((args) => args[args.indexOf("--name") + 1]).sort(), [
      "workspace-assistant-wecom-green",
      "workspace-wecom-agent",
    ]);
    assert.ok(applyCalls.every((args) => !args.includes("workspace-assistant-wecom-blue")));

    const pids = execFileSync(process.execPath, [
      pm2PlanTool, "pids", "--plan", output, "--runner", runner,
    ], { encoding: "utf8" }).trim().split("\n");
    assert.deepEqual(pids, ["workspace|5200", "workspace-assistant-wecom-blue|5101"]);

    rmSync(path.join(gatewayRoot, "current"));
    rmSync(path.join(gatewayRoot, "committed-generation"));
    writeGatewayOwner(temporary, { owner: "fallback", slot: "green" });
    writeFileSync(stateFile, JSON.stringify([{ name: "natsu-api", pid: 6100, pm2_env: { status: "online" } }]));
    writeFileSync(captureFile, "");
    const restored = spawnSync(process.execPath, [
      pm2PlanTool, "apply", "--plan", output, "--runner", runner, "--current-owner",
    ], { encoding: "utf8" });
    assert.equal(restored.status, 0, restored.stderr);
    const restoreStarts = readFileSync(captureFile, "utf8").trim().split("\n").map(JSON.parse)
      .filter((args) => args[0] === "start");
    assert.deepEqual(restoreStarts.filter((args) => !args.includes("--no-autostart"))
      .map((args) => args[args.indexOf("--name") + 1]).sort(), [
      "workspace",
      "workspace-wecom-agent",
    ]);
    assert.deepEqual(restoreStarts.filter((args) => args.includes("--no-autostart"))
      .map((args) => args[args.indexOf("--name") + 1]).sort(), [
      "workspace-assistant-wecom-blue",
      "workspace-assistant-wecom-green",
    ]);
    const fallbackPids = execFileSync(process.execPath, [
      pm2PlanTool, "pids", "--plan", output, "--runner", runner,
    ], { encoding: "utf8" }).trim().split("\n");
    assert.deepEqual(fallbackPids, ["workspace|5200", "workspace-wecom-agent|5201"]);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("PM2 plan fails closed for ambiguous Gateway owner evidence", () => {
  const temporary = mkdtempSync(path.join(tmpdir(), "workspace-pm2-ambiguous-"));
  try {
    const cases = [
      { label: "missing-marker", gateway: { owner: "assistant", committed: false } },
      {
        label: "route-state-mismatch",
        gateway: { owner: "assistant", slot: "blue", stateSlot: "green", routeSlot: "blue" },
      },
    ];
    for (const scenario of cases) {
      const root = path.join(temporary, scenario.label);
      const runtimeRoot = path.join(root, "runtime");
      const processCwd = path.join(runtimeRoot, "releases", "example");
      const input = path.join(root, "jlist.json");
      const output = path.join(root, "plan.json");
      mkdirSync(processCwd, { recursive: true });
      const { gatewayRoot } = writeGatewayOwner(root, scenario.gateway);
      writeFileSync(input, JSON.stringify([
        pm2Entry("workspace", processCwd),
        pm2Entry("workspace-wecom-agent", processCwd, "inactive"),
        pm2Entry("workspace-assistant-wecom-blue", processCwd),
      ]));
      const result = createPlan({ input, output, runtimeRoot, gatewayRoot });
      assert.notEqual(result.status, 0, scenario.label);
      assert.match(result.stderr, /marker 缺失|route\/state 不一致/);
    }

    const driftRoot = path.join(temporary, "drift");
    const runtimeRoot = path.join(driftRoot, "runtime");
    const processCwd = path.join(runtimeRoot, "releases", "example");
    const input = path.join(driftRoot, "jlist.json");
    const output = path.join(driftRoot, "plan.json");
    mkdirSync(processCwd, { recursive: true });
    const { gatewayRoot, active } = writeGatewayOwner(driftRoot, { owner: "assistant", slot: "blue" });
    writeFileSync(input, JSON.stringify([
      pm2Entry("workspace", processCwd),
      pm2Entry("workspace-wecom-agent", processCwd, "inactive"),
      pm2Entry("workspace-assistant-wecom-blue", active.releaseDir, "online", {
        pm_exec_path: path.join(active.releaseDir, "server.js"),
        WORKSPACE_DEPLOY_UNIT_ID: "assistant",
        WORKSPACE_DEPLOY_SLOT: "blue",
        WORKSPACE_DEPLOY_CURRENT_STATE_FILE: path.join(
          gatewayRoot, "current", "unit-states", "assistant.json",
        ),
        WECHAT_BOT_BRIDGE_URL: `http://127.0.0.1:${active.port}/workspace/api/integrations/wecom/agent`,
      }),
    ]));
    assert.equal(createPlan({ input, output, runtimeRoot, gatewayRoot }).status, 0);
    writeFileSync(path.join(gatewayRoot, "committed-generation"), "d".repeat(64) + "\n");
    const runner = path.join(driftRoot, "runner.mjs");
    writeFileSync(runner, "#!/usr/bin/env node\nprocess.stdout.write('[]');\n", { mode: 0o755 });
    const drifted = spawnSync(process.execPath, [
      pm2PlanTool, "verify", "--plan", output, "--runner", runner,
    ], { encoding: "utf8" });
    assert.notEqual(drifted.status, 0);
    assert.match(drifted.stderr, /current 与 committed generation 不一致|committed owner 自 plan 创建后已变化/);

    const captureFile = path.join(driftRoot, "runner-argv.ndjson");
    writeFileSync(
      runner,
      `#!/usr/bin/env node\nimport { appendFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(captureFile)}, JSON.stringify(process.argv.slice(2)) + "\\n");\nprocess.stdout.write("[]");\n`,
      { mode: 0o755 },
    );
    writeFileSync(path.join(gatewayRoot, "committed-generation"), "a".repeat(64) + "\n");
    rmSync(path.join(gatewayRoot, "committed-generation"));
    for (const mutatingCommand of ["reconcile", "apply"]) {
      writeFileSync(captureFile, "");
      const rejected = spawnSync(process.execPath, [
        pm2PlanTool, mutatingCommand, "--plan", output, "--runner", runner,
      ], { encoding: "utf8" });
      assert.notEqual(rejected.status, 0, mutatingCommand);
      assert.match(rejected.stderr, /committed marker 缺失但存在 Assistant owner state/);
      assert.equal(readFileSync(captureFile, "utf8"), "", mutatingCommand);
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("PM2 PID reader accepts no trailing newline and rejects ambiguous content", () => {
  const temporary = mkdtempSync(path.join(tmpdir(), "workspace-pm2-pid-"));
  try {
    const pidFile = path.join(temporary, "pm2.pid");
    const command = [path.join(directory, "production-pm2-plan.mjs"), "read-pid", "--file", pidFile];
    writeFileSync(pidFile, "435312");
    const withoutNewline = spawnSync(process.execPath, command, { encoding: "utf8" });
    assert.equal(withoutNewline.status, 0);
    assert.equal(withoutNewline.stdout, "435312");

    writeFileSync(pidFile, "435312\n");
    assert.equal(spawnSync(process.execPath, command).status, 0);

    for (const invalid of ["", "435312\n435313\n", "not-a-pid"]) {
      writeFileSync(pidFile, invalid);
      const result = spawnSync(process.execPath, command, { encoding: "utf8" });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /PM2 PID 文件格式无效/);
      assert.doesNotMatch(result.stderr, /435312|435313|not-a-pid/);
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("PM2 reconcile is owner-bound, tolerates absence, and rejects extras", () => {
  const temporary = mkdtempSync(path.join(tmpdir(), "workspace-pm2-reconcile-"));
  try {
    const planFile = path.join(temporary, "plan.json");
    const stateFile = path.join(temporary, "state.json");
    const captureFile = path.join(temporary, "runner-argv.ndjson");
    const runner = path.join(temporary, "runner.mjs");
    const gatewayRoot = path.join(temporary, "gateway");
    const plan = {
      schemaVersion: 2,
      kind: "workspace-production-pm2-migration",
      gateway: {
        schemaVersion: 1,
        root: gatewayRoot,
        mode: "legacy",
        generationId: null,
        owner: "fallback",
        slot: null,
        generationManifestSha256: null,
        routeMapSha256: null,
        assistantStateSha256: null,
        assistantRuntime: null,
      },
      capturedProcessNames: ["workspace", "workspace-wecom-agent"],
      processes: ["workspace", "workspace-wecom-agent"].map((name) => ({
        name,
        executable: process.execPath,
        cwd: temporary,
        args: [],
        env: {},
        desiredState: "online",
      })),
    };
    writeFileSync(planFile, JSON.stringify(plan));
    writeFileSync(
      runner,
      `#!/usr/bin/env node
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(captureFile)}, JSON.stringify(args) + "\\n");
const stateFile = ${JSON.stringify(stateFile)};
const state = JSON.parse(readFileSync(stateFile, "utf8"));
if (args[0] === "jlist" && args.length === 1) process.stdout.write(JSON.stringify(state));
else if (args[0] === "delete" && args.length === 2) writeFileSync(stateFile, JSON.stringify(state.filter((entry) => entry.name !== args[1])));
else process.exit(9);
`,
      { mode: 0o755 },
    );
    const reconcile = () => spawnSync(process.execPath, [
      path.join(directory, "production-pm2-plan.mjs"),
      "reconcile",
      "--plan", planFile,
      "--runner", runner,
    ], { encoding: "utf8" });

    writeFileSync(stateFile, JSON.stringify([
      { name: "workspace", pid: 4100, pm2_env: { status: "online" } },
      { name: "workspace-wecom-agent", pid: 4101, pm2_env: { status: "online" } },
      { name: "natsu-api" },
    ]));
    writeFileSync(captureFile, "");
    const stale = reconcile();
    assert.equal(stale.status, 0, stale.stderr);
    assert.match(stale.stdout, /reconciled 2 owner-bound Workspace process/);
    assert.deepEqual(JSON.parse(readFileSync(stateFile, "utf8")), [{ name: "natsu-api" }]);
    assert.deepEqual(readFileSync(captureFile, "utf8").trim().split("\n").map(JSON.parse), [
      ["jlist"],
      ["delete", "workspace"],
      ["delete", "workspace-wecom-agent"],
      ["jlist"],
    ]);

    writeFileSync(stateFile, JSON.stringify([{ name: "natsu-api" }]));
    writeFileSync(captureFile, "");
    const missing = reconcile();
    assert.equal(missing.status, 0, missing.stderr);
    assert.match(missing.stdout, /reconciled 0 owner-bound Workspace process/);
    assert.deepEqual(readFileSync(captureFile, "utf8").trim().split("\n").map(JSON.parse), [["jlist"], ["jlist"]]);

    const unexpectedState = [
      { name: "workspace", pid: 4100, pm2_env: { status: "online" } },
      { name: "workspace-wecom-agent", pid: 4101, pm2_env: { status: "online" } },
      { name: "workspace-candidate" },
      { name: "natsu-api" },
    ];
    writeFileSync(stateFile, JSON.stringify(unexpectedState));
    writeFileSync(captureFile, "");
    const unexpected = reconcile();
    assert.notEqual(unexpected.status, 0);
    assert.match(unexpected.stderr, /未纳入迁移的 Workspace 进程: workspace-candidate/);
    assert.deepEqual(JSON.parse(readFileSync(stateFile, "utf8")), unexpectedState);
    assert.deepEqual(readFileSync(captureFile, "utf8").trim().split("\n").map(JSON.parse), [["jlist"]]);
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
  assert.match(runtime, /WORKSPACE_DEPLOY_SLOT/);
  assert.match(runtime, /WORKSPACE_DEPLOY_CURRENT_STATE_FILE/);
  assert.match(runtime, /PROJECT_NOTIFICATION_SCHEDULER_DISABLED/);
  assert.match(runtime, /WECHAT_BOT_ID WECHAT_BOT_SECRET WECOM_WORKER_BRIDGE_SECRET/);
  assert.match(runtime, /WECHAT_REDIRECT_ORIGIN WORKSPACE_PUBLIC_ORIGIN/);
  assert.match(runtime, /exec \/usr\/bin\/env -i "\$\{bot_environment\[@\]\}"/);
  assert.doesNotMatch(runtime, /env -i[^\n]*DIRECT_URL/);
});

test("runtime PM2 wrapper gives Bot only its explicit environment allowlist", () => {
  const temporary = mkdtempSync(path.join(tmpdir(), "workspace-runtime-pm2-env-"));
  try {
    const fakeBin = path.join(temporary, "bin");
    const runtimeHome = path.join(temporary, "runtime-home");
    const runtimeEnv = path.join(temporary, "runtime.env");
    const captureFile = path.join(temporary, "capture.json");
    const pm2 = path.join(temporary, "pm2-capture.mjs");
    mkdirSync(fakeBin, { recursive: true });
    mkdirSync(runtimeHome, { recursive: true });
    writeFileSync(path.join(fakeBin, "id"), "#!/bin/sh\n[ \"$1\" = -u ] && { echo 0; exit 0; }\nexec /usr/bin/id \"$@\"\n", { mode: 0o755 });
    writeFileSync(
      path.join(fakeBin, "runuser"),
      "#!/bin/sh\n[ \"$1\" = -u ] || exit 9\nshift 2\n[ \"${1:-}\" != -- ] || shift\nexec \"$@\"\n",
      { mode: 0o755 },
    );
    writeFileSync(
      pm2,
      `#!/usr/bin/env node\nimport { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(captureFile)}, JSON.stringify({ args: process.argv.slice(2), env: process.env }));\n`,
      { mode: 0o755 },
    );
    writeFileSync(runtimeEnv, [
      "DATABASE_URL=postgresql://workspace_runtime:runtime-password@127.0.0.1/workspace",
      "NEXTAUTH_SECRET=web-session-secret",
      "ONLYOFFICE_JWT_SECRET=onlyoffice-secret",
      "UNRELATED_PRIVATE_TOKEN=unrelated-secret",
      "NODE_ENV=production",
      "WECHAT_BOT_ID=bot-id",
      "WECHAT_BOT_SECRET=bot-secret",
      "WECOM_WORKER_BRIDGE_SECRET=worker-bridge-secret-at-least-32-characters",
      "WECHAT_REDIRECT_ORIGIN=https://fh-bio.cn",
      "WORKSPACE_PUBLIC_ORIGIN=https://fh-bio.cn",
      "",
    ].join("\n"));
    const wrapper = path.join(directory, "production-runtime-pm2.sh");
    const environment = {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH}`,
      WORKSPACE_RUNTIME_ENV_FILE: runtimeEnv,
      WORKSPACE_RUNTIME_HOME: runtimeHome,
      WORKSPACE_PM2_BINARY: pm2,
      PORT: "3208",
      NEXT_PUBLIC_BASE_PATH: "/workspace",
      WORKSPACE_CONFIG_DIR: path.join(temporary, "config"),
      WORKSPACE_DEPLOY_UNIT_ID: "assistant",
      WORKSPACE_DEPLOY_SLOT: "blue",
      WORKSPACE_DEPLOY_CURRENT_STATE_FILE: path.join(temporary, "gateway", "current", "assistant.json"),
      WORKSPACE_INTERNAL_SIGNING_PRIVATE_KEY_FILE: path.join(temporary, "identity", "assistant.pem"),
      WORKSPACE_INTERNAL_TRUSTED_PUBLIC_KEYS_FILE: path.join(temporary, "identity", "trusted.json"),
      WORKSPACE_INTERNAL_REPLAY_DIRECTORY: path.join(temporary, "identity", "replay"),
      WECHAT_BOT_BRIDGE_URL: "http://127.0.0.1:3208/workspace/api/integrations/wecom/agent",
      PROJECT_NOTIFICATION_SCHEDULER_DISABLED: "1",
      WORKSPACE_MIGRATOR_DATABASE_PASSWORD: "outer-migrator-secret",
    };
    const bot = spawnSync("bash", [
      wrapper, "start", process.execPath, "--name", "workspace-assistant-wecom-blue",
    ], { encoding: "utf8", env: environment });
    assert.equal(bot.status, 0, bot.stderr);
    const botCapture = JSON.parse(readFileSync(captureFile, "utf8"));
    assert.equal(botCapture.env.WECHAT_BOT_ID, "bot-id");
    assert.equal(botCapture.env.WECHAT_BOT_SECRET, "bot-secret");
    assert.equal(botCapture.env.WECOM_WORKER_BRIDGE_SECRET, "worker-bridge-secret-at-least-32-characters");
    assert.equal(botCapture.env.WORKSPACE_PUBLIC_ORIGIN, "https://fh-bio.cn");
    assert.equal(botCapture.env.WORKSPACE_DEPLOY_SLOT, "blue");
    assert.equal(botCapture.env.WECHAT_BOT_BRIDGE_URL, environment.WECHAT_BOT_BRIDGE_URL);
    for (const forbidden of [
      "DATABASE_URL",
      "NEXTAUTH_SECRET",
      "ONLYOFFICE_JWT_SECRET",
      "WORKSPACE_MIGRATOR_DATABASE_PASSWORD",
      "UNRELATED_PRIVATE_TOKEN",
      "WORKSPACE_RUNTIME_ENV_FILE",
    ]) {
      assert.equal(Object.hasOwn(botCapture.env, forbidden), false, forbidden);
    }

    for (const webName of ["workspace", "workspace-candidate"]) {
      const web = spawnSync("bash", [
        wrapper, "start", process.execPath, "--name", webName,
      ], { encoding: "utf8", env: environment });
      assert.equal(web.status, 0, web.stderr);
      const webCapture = JSON.parse(readFileSync(captureFile, "utf8"));
      assert.match(webCapture.env.DATABASE_URL, /^postgresql:\/\/workspace_runtime:/);
      assert.equal(webCapture.env.NEXTAUTH_SECRET, "web-session-secret");
      assert.equal(webCapture.env.ONLYOFFICE_JWT_SECRET, "onlyoffice-secret");
      assert.equal(Object.hasOwn(webCapture.env, "WORKSPACE_MIGRATOR_DATABASE_PASSWORD"), false);
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
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
  assert.match(plan, /Object\.hasOwn\(environment, key\)/);
  assert.match(plan, /botForbiddenEnvironment/);
});

test("runtime daemon verification captures strict PID output without read newline semantics", () => {
  const security = read("production-security.sh");
  assert.match(security, /pm2_pid="\$\(node "\$SCRIPT_DIR\/production-pm2-plan\.mjs" read-pid --file \/var\/lib\/workspace-runtime\/\.pm2\/pm2\.pid\)"/);
  assert.doesNotMatch(security, /IFS= read -r pm2_pid/);
  assert.doesNotMatch(security, /(?:echo|printf)[^\n]*\$pm2_pid/);
});
