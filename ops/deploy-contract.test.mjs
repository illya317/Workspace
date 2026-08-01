import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { readDeploySourceContract } from "./deploy/source-contract.mjs";

const deploy = readDeploySourceContract();
const deployEntrypoint = readFileSync(new URL("./deploy.sh", import.meta.url), "utf8");
const replaceProductionDatabase = readFileSync(new URL("./replace-production-database.sh", import.meta.url), "utf8");
const kimiSandboxRunner = readFileSync(new URL("./kimi-agent-sandbox-runner.sh", import.meta.url), "utf8");
const kimiDarwinSandboxRunner = readFileSync(new URL("./kimi-agent-sandbox-runner-darwin.sh", import.meta.url), "utf8");
const kimiDarwinSandboxProfile = readFileSync(new URL("./kimi-agent-sandbox-darwin.sb", import.meta.url), "utf8");
const kimiRuntimeInstaller = readFileSync(new URL("./install-kimi-agent-runtime.sh", import.meta.url), "utf8");
const libraryRuntimeInstaller = readFileSync(new URL("./install-library-runtime-deps.sh", import.meta.url), "utf8");
const embeddingInstaller = readFileSync(new URL("./install-library-embedding-model.sh", import.meta.url), "utf8");
const onlyOfficeInstaller = readFileSync(new URL("./install-onlyoffice-runtime.sh", import.meta.url), "utf8");
const runtimePermissionReconciler = readFileSync(new URL("./reconcile-runtime-config-permissions.sh", import.meta.url), "utf8");

function assertOrdered(source, needles) {
  let previous = -1;
  for (const needle of needles) {
    const index = source.indexOf(needle, previous + 1);
    assert.ok(index >= 0, "missing deploy contract fragment: " + needle);
    assert.ok(index > previous, "out-of-order deploy contract fragment: " + needle);
    previous = index;
  }
}

test("deploy composition resolves private modules from its own directory", () => {
  assertOrdered(deployEntrypoint, [
    'SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
    'cd "$SCRIPT_DIR/.."',
    'source "$SCRIPT_DIR/deploy/transport.sh"',
    'source "$SCRIPT_DIR/deploy/health.sh"',
  ]);
  assert.doesNotMatch(deploy, /RUN_LOCAL_CHECKS/);
  assert.doesNotMatch(deploy, /checks\.local/);
  assert.doesNotMatch(deploy, /run_local_checks/);
  assert.doesNotMatch(deploy, /npm run (?:deploy:preflight:ci|docs:check)/);
});

function embeddedPrograms(runtime, delimiter) {
  const pattern = new RegExp(`\\b${runtime}(?: [^\\n]*)? <<'${delimiter}'[^\\n]*\\n([\\s\\S]*?)\\n${delimiter}`, "g");
  const openers = deploy.match(new RegExp(`\\b${runtime}(?: [^\\n]*)? <<'${delimiter}'`, "g")) ?? [];
  const programs = [...deploy.matchAll(pattern)].map((match) => match[1]);
  assert.equal(programs.length, openers.length, `every ${runtime} heredoc must be extracted`);
  return programs;
}

function runPython(program, env = {}) {
  return spawnSync("python3", ["-c", program], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function runNode(program, env = {}) {
  return spawnSync(process.execPath, ["-e", program], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function hardenedDatabaseUrl(role, { options, host = "127.0.0.1", port = "5432", database = "workspace" } = {}) {
  const url = new URL(
    "postgresql://" + role + ":contract-secret@" + host + ":" + port + "/" + database,
  );
  url.searchParams.set("sslmode", "verify-full");
  url.searchParams.set("sslrootcert", "/etc/workspace/postgresql/ca.pem");
  if (options !== undefined) url.searchParams.set("options", options);
  return url.toString();
}

const runtimeDatabaseUrl = hardenedDatabaseUrl("workspace_runtime");
const directDatabaseUrl = hardenedDatabaseUrl(
  "workspace_migrator",
  { options: "-c role=workspace_owner" },
);

test("deploy delegates all receipt reads and writes to one versioned helper", () => {
  assert.match(deploy, /REMOTE_RELEASE_RECEIPT_TOOL=.*release-receipt\.mjs/);
  assert.match(deploy, /release-receipt\.mjs[\s\S]*?node --check/);
  assert.match(deploy, /'\$REMOTE_RELEASE_RECEIPT_TOOL' inspect/);
  assert.match(deploy, /'\$REMOTE_RELEASE_RECEIPT_TOOL' assert/);
  assert.match(deploy, /'\$REMOTE_RELEASE_RECEIPT_TOOL' write/);
  assert.doesNotMatch(deploy, /--deployed-canonical|--deployed-transport|--candidate-transport/);
  assert.match(deploy, /metadata\.transport\?\.kind/);
  assert.match(deploy, /--transport '\$RELEASE_TRANSPORT'/);
  assert.doesNotMatch(deploy, /DEPLOYED_TRANSPORT/);
  const invocation = deploy.slice(deploy.indexOf('echo "==> 验证服务器连接..."'));
  assert.ok(invocation.indexOf("acquire_remote_deploy_lock") < invocation.indexOf("sync_remote_deploy_tools"));
});

test("hardened production runtime keeps PM2 and database credentials behind an explicit compatibility seam", () => {
  assert.match(deploy, /WORKSPACE_RUNTIME_PM2_MODE="\$\{WORKSPACE_RUNTIME_PM2_MODE:-legacy\}"/);
  assert.match(deploy, /WORKSPACE_RUNTIME_PM2_RUNNER="\$\{WORKSPACE_RUNTIME_PM2_RUNNER:-\/usr\/local\/sbin\/workspace-runtime-pm2\}"/);
  assert.match(deploy, /WORKSPACE_RUNTIME_PM2_MODE" in\n\s+legacy\|hardened/);
  assert.match(deploy, /hardened PM2 模式必须隔离 runtime env 与 control-plane env/);
  assert.match(deploy, /hardened PM2 模式禁止通过 ENV_CONTENT 下发共享凭据/);

  const sshShim = deploy.slice(deploy.indexOf("ssh_cmd()"), deploy.indexOf("start_ssh_master()"));
  assert.match(sshShim, /pm2\(\)[\s\S]*?sudo -n -- \/usr\/bin\/env[\s\S]*?'\$WORKSPACE_RUNTIME_PM2_RUNNER'/);
  assert.match(sshShim, /PORT HOSTNAME BUILD_VERSION NEXT_PUBLIC_BUILD_VERSION NEXT_PUBLIC_BASE_PATH PG_POOL_MAX PG_APPLICATION_NAME/);
  assert.match(sshShim, /WORKSPACE_CONFIG_DIR/);
  assert.match(sshShim, /PROJECT_NOTIFICATION_SCHEDULER_DISABLED/);
  assert.match(sshShim, /WORKSPACE_DEPLOY_SLOT/);
  assert.match(sshShim, /WORKSPACE_DEPLOY_CURRENT_STATE_FILE/);
  assert.match(sshShim, /else\n\s+command pm2/);
  assert.match(sshShim, /workspace_assert_managed_runtime_environment/);
  assert.match(sshShim, /workspace-assistant-wecom-blue,workspace-assistant-wecom-green/);
  assert.match(sshShim, /Bot runtime process/);
  assert.match(sshShim, /'DIRECT_URL', 'SHADOW_DATABASE_URL', 'WORKSPACE_BACKUP_DATABASE_URL'/);
  assert.match(sshShim, /'PGPASSWORD', 'PGPASSFILE', 'PGSERVICE', 'PGSERVICEFILE', 'PGOPTIONS'/);
  assert.match(sshShim, /workspace_source_env_file '\$REMOTE_RUNTIME_ENV_FILE'/);
  assert.match(sshShim, /workspace_source_env_file '\$REMOTE_CONTROL_ENV_FILE'/);
  assert.match(sshShim, /runtime_database_url=\\\$DATABASE_URL[\s\S]*?DATABASE_URL=\\\$runtime_database_url/);
  assert.match(sshShim, /WORKSPACE_BACKUP_DATABASE_URL/);
  assert.match(sshShim, /control-plane env must not be accessible by group or other users/);
  assert.match(sshShim, /runtime env must not be group-writable\/executable or accessible by other users/);
  assert.match(sshShim, /workspace_assert_hardened_database_url/);
  assert.match(sshShim, /workspace_runtime 0 DATABASE_URL/);
  assert.match(sshShim, /workspace_migrator 1 DIRECT_URL/);
  assert.match(sshShim, /workspace_backup 0 WORKSPACE_BACKUP_DATABASE_URL/);
  assert.match(sshShim, /workspace_monitor 0 WORKSPACE_MONITOR_DATABASE_URL/);
  assertOrdered(deploy.slice(deploy.indexOf('echo "==> 验证服务器连接..."')), [
    "start_ssh_master",
    "verify_remote_runtime_pm2",
    "acquire_remote_deploy_lock",
    "reconcile_completed_deploy_markers",
  ]);

  const remoteDeploy = deploy.slice(
    deploy.indexOf("deploy_remote_artifact()"),
    deploy.indexOf("run_healthcheck()"),
  );
  assert.match(remoteDeploy, /ln -sfn [^\n]*REMOTE_RUNTIME_ENV_FILE[^\n]*release_dir\/\.env/);
  assert.match(remoteDeploy, /release runtime \.env 包含 control-plane 数据库凭据/);
  assert.match(remoteDeploy, /WORKSPACE_BACKUP_DATABASE_URL:-\\\$DIRECT_URL/);
  assert.doesNotMatch(remoteDeploy, /\. \"\\\$release_dir\/\.env\"/);
  assertOrdered(remoteDeploy, [
    "load_control_environment",
    "migrate deploy --schema=",
    "seed-resources-runtime.mjs",
    "PORT=3101 HOSTNAME=127.0.0.1 pm2 start",
  ]);
  assert.match(remoteDeploy, /bind_runtime_env_to_release[\s\S]*?pm2 start \\"\\\$old_release/);
  assertOrdered(remoteDeploy, [
    "export PROJECT_NOTIFICATION_SCHEDULER_DISABLED=1",
    "PORT=3101 HOSTNAME=127.0.0.1 pm2 start",
    "unset PROJECT_NOTIFICATION_SCHEDULER_DISABLED",
    "PORT=3000 HOSTNAME=0.0.0.0 pm2 start",
  ]);
});

test("legacy PM2 deployments remain outside the hardened credential contract", () => {
  const verifier = deploy.slice(
    deploy.indexOf("verify_remote_runtime_pm2()"),
    deploy.indexOf("start_ssh_master()"),
  );
  assertOrdered(verifier, [
    'if [ "$WORKSPACE_RUNTIME_PM2_MODE" != "hardened" ]',
    "使用 legacy PM2 兼容模式",
    "return 0",
    "workspace_assert_hardened_database_url",
  ]);

  const sshShim = deploy.slice(deploy.indexOf("ssh_cmd()"), deploy.indexOf("verify_remote_runtime_pm2()"));
  assert.match(sshShim, /if \[ '\$WORKSPACE_RUNTIME_PM2_MODE' = 'hardened' \][\s\S]*?else\n\s+command pm2/);
  assert.match(
    sshShim,
    /if \[ '\$WORKSPACE_RUNTIME_PM2_MODE' = 'hardened' \]; then\n\s+test -n \\"\\\${WORKSPACE_BACKUP_DATABASE_URL:-}\\"/,
  );
});

test("hardened deploy reapplies runtime ACLs after tenant directory replacement", () => {
  assert.match(deploy, /ops\/reconcile-runtime-config-permissions\.sh/);
  assert.match(deploy, /bash -n '\$REMOTE_DEPLOY_TOOL_DIR\/reconcile-runtime-config-permissions\.sh'/);
  assert.match(
    deploy,
    /sudo -n -- '\$REMOTE_DEPLOY_TOOL_DIR\/reconcile-runtime-config-permissions\.sh'[\s\S]*?'\$REMOTE_WORKSPACE_CONFIG_DIR' workspace-runtime/,
  );
  assert.match(runtimePermissionReconciler, /for relative in data assets assets\/brand/);
  assert.match(runtimePermissionReconciler, /assets\/brand\/company/);
  assert.match(runtimePermissionReconciler, /setfacl -Rm "u:\$RUNTIME_USER:rX"/);
  assert.match(runtimePermissionReconciler, /setfacl -Rm "u:\$RUNTIME_USER:rwX"/);
  assert.match(runtimePermissionReconciler, /runtime 用户可写只读路径/);
  assert.doesNotMatch(runtimePermissionReconciler, /chmod -R|chmod 777/);
});

test("hardened deploy URL contract pins every database credential to its exact role, endpoint, and TLS CA", () => {
  const programs = embeddedPrograms("node", "NODE");
  const matches = programs.filter(
    (program) => program.includes("EXPECTED_DATABASE_ROLE")
      && program.includes("forbiddenConnectionOverrides"),
  );
  assert.equal(matches.length, 1);
  const validator = matches[0];
  const validate = (databaseUrl, role, requireOwnerRole = false) =>
    runNode(validator, {
      DATABASE_URL_VALUE: databaseUrl,
      EXPECTED_DATABASE_ROLE: role,
      REQUIRE_OWNER_ROLE: requireOwnerRole ? "1" : "0",
      DATABASE_URL_LABEL: "test database URL",
    });

  for (const [role, databaseUrl, requireOwnerRole] of [
    ["workspace_runtime", runtimeDatabaseUrl, false],
    ["workspace_migrator", directDatabaseUrl, true],
    ["workspace_backup", hardenedDatabaseUrl("workspace_backup"), false],
    ["workspace_monitor", hardenedDatabaseUrl("workspace_monitor"), false],
  ]) {
    const result = validate(databaseUrl, role, requireOwnerRole);
    assert.equal(result.status, 0, result.stderr);
  }

  const invalidContracts = [
    {
      label: "wrong role",
      value: hardenedDatabaseUrl("workspace_backup"),
      role: "workspace_runtime",
      owner: false,
    },
    {
      label: "localhost alias",
      value: hardenedDatabaseUrl("workspace_runtime", { host: "localhost" }),
      role: "workspace_runtime",
      owner: false,
    },
    {
      label: "missing explicit port",
      value: runtimeDatabaseUrl.replace(":5432/", "/"),
      role: "workspace_runtime",
      owner: false,
    },
    {
      label: "wrong database",
      value: hardenedDatabaseUrl("workspace_runtime", { database: "postgres" }),
      role: "workspace_runtime",
      owner: false,
    },
    {
      label: "TLS downgrade",
      value: runtimeDatabaseUrl.replace("sslmode=verify-full", "sslmode=require"),
      role: "workspace_runtime",
      owner: false,
    },
    {
      label: "wrong CA",
      value: runtimeDatabaseUrl.replace(
        encodeURIComponent("/etc/workspace/postgresql/ca.pem"),
        encodeURIComponent("/tmp/ca.pem"),
      ),
      role: "workspace_runtime",
      owner: false,
    },
    {
      label: "connection query override",
      value: runtimeDatabaseUrl + "&host=localhost",
      role: "workspace_runtime",
      owner: false,
    },
    {
      label: "duplicate TLS mode",
      value: runtimeDatabaseUrl + "&sslmode=require",
      role: "workspace_runtime",
      owner: false,
    },
    {
      label: "runtime owner role option",
      value: hardenedDatabaseUrl("workspace_runtime", { options: "-c role=workspace_owner" }),
      role: "workspace_runtime",
      owner: false,
    },
    {
      label: "missing migrator owner role",
      value: hardenedDatabaseUrl("workspace_migrator"),
      role: "workspace_migrator",
      owner: true,
    },
    {
      label: "migrator owner role plus extra option",
      value: hardenedDatabaseUrl(
        "workspace_migrator",
        { options: "-c role=workspace_owner -c search_path=public" },
      ),
      role: "workspace_migrator",
      owner: true,
    },
  ];
  for (const contract of invalidContracts) {
    const result = validate(contract.value, contract.role, contract.owner);
    assert.notEqual(result.status, 0, contract.label);
    assert.doesNotMatch(result.stderr, /contract-secret/, contract.label);
  }
});

test("hardened deploy verifies per-process Web and Bot credential boundaries", () => {
  const programs = embeddedPrograms("node", "NODE");
  const matches = programs.filter(
    (program) => program.includes("MANAGED_PROCESSES")
      && program.includes("runtimeDatabaseUrls"),
  );
  assert.equal(matches.length, 1);
  const validator = matches[0];
  const verify = (pm2Environment, name = "workspace") => runNode(validator, {
    MANAGED_WEB_NAMES: "workspace-candidate,workspace",
    MANAGED_BOT_NAMES:
      "workspace-wecom-agent,workspace-assistant-wecom-blue,workspace-assistant-wecom-green",
    MANAGED_PROCESSES: JSON.stringify([{ name, pm2_env: pm2Environment }]),
  });

  assert.equal(verify({ DATABASE_URL: runtimeDatabaseUrl }).status, 0);
  assert.equal(verify({ env: { DATABASE_URL: runtimeDatabaseUrl } }).status, 0);
  assert.equal(
    verify({ DATABASE_URL: runtimeDatabaseUrl, env: { DATABASE_URL: runtimeDatabaseUrl } }).status,
    0,
  );

  for (const [label, environment] of [
    ["wrong role", { DATABASE_URL: hardenedDatabaseUrl("workspace_backup") }],
    ["TLS downgrade", { DATABASE_URL: runtimeDatabaseUrl.replace("verify-full", "require") }],
    ["wrong CA", { DATABASE_URL: runtimeDatabaseUrl.replace("ca.pem", "other-ca.pem") }],
    ["query override", { DATABASE_URL: runtimeDatabaseUrl + "&host=localhost" }],
    ["nested control credential", {
      DATABASE_URL: runtimeDatabaseUrl,
      env: { DATABASE_URL: runtimeDatabaseUrl, DIRECT_URL: directDatabaseUrl },
    }],
    ["ambiguous PM2 snapshots", {
      DATABASE_URL: runtimeDatabaseUrl,
      env: { DATABASE_URL: hardenedDatabaseUrl("workspace_backup") },
    }],
  ]) {
    const result = verify(environment);
    assert.notEqual(result.status, 0, label);
    assert.doesNotMatch(result.stderr, /contract-secret/, label);
  }

  assert.equal(verify({
    WECHAT_BOT_ID: "bot-id",
    WECHAT_BOT_SECRET: "bot-secret",
    WECOM_WORKER_BRIDGE_SECRET: "worker-secret",
  }, "workspace-assistant-wecom-blue").status, 0);
  for (const forbidden of ["DATABASE_URL", "NEXTAUTH_SECRET", "ONLYOFFICE_JWT_SECRET"]) {
    const result = verify({ [forbidden]: "must-not-reach-bot" }, "workspace-assistant-wecom-blue");
    assert.notEqual(result.status, 0, forbidden);
    assert.doesNotMatch(result.stderr, /must-not-reach-bot/, forbidden);
  }
});

test("legacy local receipt repair revalidates the frozen production identity under the deploy lock", () => {
  assert.match(deploy, /deployedReceiptRecovery/);
  assert.match(deploy, /receiptRecovery\.kind !== 'legacy-local-injection-source'/);
  assert.match(deploy, /--transport local/);
  assert.match(deploy, /--migration-set '\$RELEASE_RECEIPT_RECOVERY_MIGRATION_SET'/);
  assert.match(deploy, /comparison_base="\$RELEASE_RECEIPT_RECOVERY_BASE"/);
});

test("Full cutover atomically revokes every independent Gateway override", () => {
  assert.match(deploy, /gateway-generation\.mjs/);
  assert.match(deploy, /switch-deploy-gateway\.sh/);
  assert.match(deploy, /create-fallback/);
  assert.match(deploy, /routeMap\.activeUnits\.length !== 0/);
  assert.match(deploy, /routeMap\.routes\.length !== 0/);
  const cutover = deploy.slice(deploy.indexOf(
    "assert_release_version 'http://127.0.0.1:3000/workspace/api/settings/version' 'public'",
  ));
  assertOrdered(cutover, [
    "assert_release_version 'http://127.0.0.1:3000/workspace/api/settings/version' 'public'",
    'atomic_switch_current \\"\\$release_dir\\"',
    "begin_full_wecom_handoff",
    "reset_gateway_overrides_to_full",
    "workspace_sidecar_wait_absent '$PM2_WECOM_BOT_NAME'",
    'start_wecom_bot_for_release "\\$release_dir" \'新 release\'',
    "'$REMOTE_RELEASE_RECEIPT_TOOL' write",
    "release_committed=1",
    "full_wecom_handoff_committed=1",
  ]);
  assert.match(deploy, /workspace_stop_deploy_unit_sidecar assistant/);
});

test("candidate and public version checks use the frozen content digest", () => {
  const versionCheck = deploy.slice(
    deploy.indexOf("assert_release_version()"),
    deploy.indexOf("verify_remote_deployed_record()"),
  );
  assert.match(versionCheck, /actual_version[^\n]*RELEASE_CONTENT_DIGEST/);
  assert.doesNotMatch(versionCheck, /RELEASE_SOURCE_SHA/);
});

test("Full deploy preserves Assistant ownership until fallback commit and restores it on pre-commit failure", () => {
  assert.match(deploy, /source '\$REMOTE_DEPLOY_TOOL_DIR\/deploy-unit-sidecar\.sh'/);
  assert.match(deploy, /workspace_capture_gateway_assistant_owner '\$REMOTE_GATEWAY_ROOT'/);
  assert.match(
    deploy,
    /start_wecom_bot_for_release\(\)[\s\S]*?workspace_capture_gateway_assistant_owner[\s\S]*?保持 Assistant unit 企业微信 Bot owner/,
  );
  const restore = deploy.slice(
    deploy.indexOf("restore_full_wecom_handoff()"),
    deploy.indexOf("reset_gateway_overrides_to_full()"),
  );
  assertOrdered(restore, [
    "pm2 delete '$PM2_WECOM_BOT_NAME'",
    "full_wecom_previous_gateway_target",
    "workspace_start_deploy_unit_sidecar",
  ]);
  const rollback = deploy.slice(deploy.indexOf("rollback_cutover()"));
  assert.ok(
    rollback.indexOf("restore_full_wecom_handoff")
      < rollback.indexOf("上一 PostgreSQL release 回滚"),
  );
});

test("inner Full deploy never publishes the final success notification", () => {
  assert.match(deploy, /run_deploy_stage health\.final run_healthcheck/);
  assert.doesNotMatch(deploy, /run_deploy_stage notification\.record/);
});

test("local deploy stages record failures without disabling errexit", () => {
  const localStageRunner = deploy.slice(
    deploy.indexOf("run_deploy_stage()"),
    deploy.indexOf("release_remote_deploy_lock()"),
  );
  assert.match(localStageRunner, /if ! release_timing_active_begin \"\$stage\"/);
  assert.match(localStageRunner, /\"\$@\"\n(?:\s+#.*\n)*\s+release_timing_active_passed/);
  assert.doesNotMatch(localStageRunner, /set \+e|release_timing_finish .*passed/);
  const cleanup = deploy.slice(
    deploy.indexOf("cleanup_deploy()"),
    deploy.indexOf("trap cleanup_deploy EXIT"),
  );
  assert.match(cleanup, /local deploy_exit_code=\$\?/);
  assert.match(cleanup, /release_timing_active_finalize_on_exit \"\$deploy_exit_code\" \|\| true/);
  assert.match(cleanup, /return \"\$deploy_exit_code\"/);
});

test("remote verification messages cannot become local shell redirects", () => {
  assert.equal(deploy.includes('echo "[错误] \\$verification_phase:'), false);
  assert.equal(deploy.includes('echo "==> \\$verification_phase:'), false);
  assert.equal(deploy.includes('echo \\"[错误] \\$verification_phase:'), true);
  assert.equal(deploy.includes('echo \\"==> \\$verification_phase:'), true);
});

test("ordinary PostgreSQL releases restore the previous application until the release record is committed", () => {
  assert.match(deploy, /public_process_stopped=0/);
  assert.match(deploy, /release_committed=0/);
  assert.match(deploy, /pm2 delete '\$PM2_NAME'[\s\S]*?public_process_stopped=1/);
  assert.match(deploy, /\[ -z \\"\\\$cutover_source\\" \][\s\S]*?\[ \\"\\\$public_process_stopped\\" = '1' \][\s\S]*?\[ \\"\\\$release_committed\\" = '0' \]/);
  assert.match(deploy, /PORT=3000 HOSTNAME=0\.0\.0\.0 pm2 start \\"\\\$old_release\/\\\$old_server_entry\\"/);
  assert.match(deploy, /atomic_switch_current \\"\\\$old_release\\"/);
  assert.match(deploy, /'\$REMOTE_RELEASE_RECEIPT_TOOL' write[\s\S]*?--release-dir[\s\S]*?release_committed=1/);
});

test("deploy uses the exact CI migration parser and fences writers before the pinned recovery point", () => {
  assert.equal(deploy.includes("=\\\\$("), false, "remote command substitutions must have one escape");
  assert.match(
    deploy,
    /node \\"\\\$release_dir\/scripts\/ci\/check-migration-policy\.mjs\\" --file \\"\\\$migration_file\\" --print-mode/,
  );
  const start = deploy.indexOf('if [ -n \\"\\$maintenance_migrations\\" ]; then');
  const end = deploy.indexOf("echo '==> 执行 Prisma 数据库迁移...'", start);
  assert.ok(start >= 0 && end > start);
  const section = deploy.slice(start, end);
  assertOrdered(section, [
    'backupSha256=\\$maintenance_backup_sha',
    "pm2 delete '$PM2_NAME'",
    "pm2 save",
    "pg_dump --format=custom",
    "pg_restore --list",
    'backupSha256=\\$maintenance_backup_sha',
  ]);
  assert.match(section, /maintenance-pinned\/pre-/);
  assert.match(section, /mv \\"\\\$marker_tmp\\" \\"\\\$maintenance_marker_path\\"/);
});

test("database replacement keeps the shared gate and performs a fail-closed atomic database swap", () => {
  const remoteDeploy = deploy.slice(
    deploy.indexOf("deploy_remote_artifact()"),
    deploy.indexOf("run_healthcheck()"),
  );
  assertOrdered(remoteDeploy, [
    "database_replacement_guard=1",
    "pm2 delete '$PM2_NAME'",
    "replace-production-database.sh\\\" apply",
    "migrate deploy --schema=",
    "PORT=3101 HOSTNAME=127.0.0.1 pm2 start",
    "PORT=3000 HOSTNAME=0.0.0.0 pm2 start",
    "'$REMOTE_RELEASE_RECEIPT_TOOL' write",
    "commit_database_replacement_state",
  ]);
  assert.match(remoteDeploy, /旧生产数据库仍保留[\s\S]*?保持 Workspace 与企业微信停止/);
  assert.doesNotMatch(remoteDeploy, /database_replacement_guard[\s\S]*?dropdb/);
  assert.match(replaceProductionDatabase, /active_already_renamed=1[\s\S]*?继续让同一替换候选接管/);
  assert.match(replaceProductionDatabase, /database OID 不一致，拒绝猜测恢复/);
});

test("WeCom notification upgrade validates the new secret before writer cutover and keeps old-release rollback compatible", () => {
  assert.match(
    deploy,
    /wecom_bridge_secret_is_valid\(\)[\s\S]*?WECOM_WORKER_BRIDGE_SECRET[\s\S]*?trim\(\)\.length >= 32/,
  );
  assert.match(
    deploy,
    /wecom_release_requires_bridge_secret\(\)[\s\S]*?grep -q 'WECOM_WORKER_BRIDGE_SECRET'[\s\S]*?wecom-agent-bot\.mjs/,
  );
  assert.match(
    deploy,
    /start_wecom_bot_for_release\(\)[\s\S]*?wecom_release_requires_bridge_secret[\s\S]*?pm2 start/,
  );
  assert.match(
    deploy,
    /if \[ '\$DEPLOY_EXECUTION_MODE' != 'control-plane-only' \]; then\n\s+assert_new_wecom_release_ready\n\s+fi/,
  );
  assertOrdered(deploy, [
    "assert_new_wecom_release_ready",
    "trap rollback_cutover EXIT",
    "begin_remote_timing_stage migration.provision",
    "pm2 delete '$PM2_WECOM_BOT_NAME'",
    'start_wecom_bot_for_release "\\$release_dir" \'新 release\'',
  ]);
  assert.match(
    deploy,
    /start_wecom_bot_for_release \\"\\\$old_release\\" '旧 SQLite release 回滚'/,
  );
  assert.match(
    deploy,
    /start_wecom_bot_for_release \\"\\\$old_release\\" '上一 PostgreSQL release 回滚'/,
  );
  assert.doesNotMatch(
    deploy,
    /old_release\/scripts\/runtime\/wecom-agent-bot\.mjs[\s\S]{0,250}WECOM_WORKER_BRIDGE_SECRET/,
  );
});

test("a second maintenance attempt keeps old rollback disabled and reuses the verified pre-migration dump", () => {
  assert.equal((deploy.match(/maintenance_migration_started=0/g) ?? []).length, 1);
  assert.match(deploy, /if \[ -f \\"\\\$maintenance_marker_path\\" \]; then[\s\S]*?maintenance_marker_present=1[\s\S]*?maintenance_migration_started=1/);
  const resumeStart = deploy.indexOf("echo '==> 检测到 maintenance marker；先无条件隔离所有旧 writer'");
  const resumeStop = deploy.indexOf("pm2 delete '$PM2_WECOM_BOT_NAME'", resumeStart);
  const resumeSaved = deploy.indexOf("pm2 save", resumeStop);
  const markerParse = deploy.indexOf("persisted_line_count=", resumeSaved);
  const backupValidation = deploy.indexOf('pg_restore --list \\"\\$maintenance_backup\\"', markerParse);
  assert.ok(resumeStart >= 0 && resumeStop > resumeStart);
  assert.ok(resumeSaved > resumeStop, "writer stop must be persisted before marker validation");
  assert.ok(markerParse > resumeSaved, "marker must be parsed only after writers are fenced");
  assert.ok(backupValidation > markerParse, "pinned backup is validated after marker parsing");
  assert.match(
    deploy,
    /trap rollback_cutover EXIT[\s\S]*?if \[ \\"\\\$maintenance_migration_started\\" = '1' \]; then[\s\S]*?pm2 delete '\$PM2_NAME'[\s\S]*?pm2 save/,
  );
  assert.match(
    deploy,
    /if \[ \\"\\\$maintenance_migration_started\\" = '1' \]; then[\s\S]*?保持 Workspace 与企业微信停止[\s\S]*?elif \[ -n \\"\\\$old_release\\" \]/,
  );
  assert.match(deploy, /maintenance_backup_sha\\" != 'pending'[\s\S]*?digest 不匹配/);
  assert.match(
    deploy,
    /if \[ ! -f '\$REMOTE_WORKSPACE_CONFIG_DIR\/maintenance-deploy' \]; then\n\s+workspace_privileged rm -rf '\$REMOTE_BACKUP_DIR\/maintenance-pinned'/,
  );
  assert.match(
    deploy,
    /release_committed=1\n\s+full_wecom_handoff_committed=1\n\s+commit_database_replacement_state\n\s+finish_remote_timing_stage passed 0\n\s+rm -f '\$REMOTE_WORKSPACE_CONFIG_DIR\/maintenance-deploy'/,
  );
});

test("one-time Prisma genesis clears audited history only after the pinned backup and remains resumable", () => {
  const backup = deploy.indexOf('pg_dump --format=custom --no-owner --no-privileges');
  const prepare = deploy.indexOf('prisma-genesis-cutover.mjs\\" prepare');
  const resolve = deploy.indexOf('migrate resolve', prepare);
  const finalize = deploy.indexOf('prisma-genesis-cutover.mjs\\" finalize', resolve);
  const deployMigration = deploy.indexOf('migrate deploy', finalize);
  assert.ok(backup >= 0 && backup < prepare && prepare < resolve && resolve < finalize && finalize < deployMigration);
  assert.match(deploy, /legacy-migration-set-sha256/);
  assert.match(deploy, /genesis_state.*cleared[\s\S]*baseline-recorded[\s\S]*completed/);
});

test("Kimi runtime, artifact integrity, and release order fail closed", () => {
  assert.match(
    deploy,
    /installed-source\.sha256[\s\S]*?install-kimi-agent-runtime\.sh' --check[\s\S]*?跳过网络安装/,
  );
  assert.match(
    deploy,
    /ARTIFACT_PATH[\s\S]*?rsync -av[\s\S]*?\$ARTIFACT_MANIFEST_PATH[\s\S]*?cutover 前再次确认 release metadata 与部署顺序[\s\S]*?verify_release_order[\s\S]*?服务器复验产物/,
  );
  assert.match(
    deploy,
    /if \[ "\$order_action" = "noop" \]; then[\s\S]*?run_healthcheck[\s\S]*?exit 0/,
  );
});

test("Library, Qwen, and ONLYOFFICE reuse verified runtime installations", () => {
  assert.match(
    deploy,
    /Library\/Qwen 运行时 source\/version 未变化，跳过网络安装和模型加载/,
  );
  assert.match(deploy, /install-library-runtime-deps\.sh' --server --quick-check/);
  assert.match(deploy, /install-library-embedding-model\.sh' --quick-check/);
  assert.match(deploy, /ONLYOFFICE source\/version 未变化且健康，跳过 compose reconcile/);
  assert.match(libraryRuntimeInstaller, /--quick-check/);
  assert.match(libraryRuntimeInstaller, /LIBRARY_QUICK_CHECK/);
  assert.match(embeddingInstaller, /workspace-embedding-model\.json/);
  assert.match(embeddingInstaller, /"mode": "quick-check"/);
  const quickCheck = embeddingInstaller.slice(
    embeddingInstaller.indexOf('if [ "$MODE" = "quick-check" ]'),
    embeddingInstaller.indexOf('echo "==> Checking Qwen embedding model on CPU"'),
  );
  assert.doesNotMatch(quickCheck, /SentenceTransformer|model\.encode/);
});

test("CNB artifacts are uploaded, verified, and removed after extraction", () => {
  const remoteDeploy = deploy.slice(
    deploy.indexOf("deploy_remote_artifact()"),
    deploy.indexOf("run_healthcheck()"),
  );
  assert.match(remoteDeploy, /rsync -av[\s\S]*?\$ARTIFACT_PATH[\s\S]*?\$ARTIFACT_MANIFEST_PATH/);
  assert.match(remoteDeploy, /rm -f '\$remote_tar' '\$remote_manifest'/);
  assert.doesNotMatch(remoteDeploy, /preserve_remote_artifact|REMOTE_STANDALONE/);
});

test("remote release timing preserves one rollback shell and the critical-stage order", () => {
  const remoteDeploy = deploy.slice(
    deploy.indexOf("deploy_remote_artifact()"),
    deploy.indexOf("run_healthcheck()"),
  );
  assert.match(deploy, /REMOTE_RELEASE_TIMING_TOOL=.*release-timing\.mjs/);
  assert.match(deploy, /REMOTE_RELEASE_TIMING_SHELL=.*lib\/release-timing\.sh/);
  assert.match(deploy, /node --check '\$REMOTE_RELEASE_TIMING_TOOL'/);
  assert.match(deploy, /bash -n '\$REMOTE_RELEASE_TIMING_SHELL'/);
  assert.match(
    deploy,
    /REMOTE_RELEASE_TIMING_ENABLED=0\n\s+if \[ "\$RELEASE_TIMING_ENABLED" != "1" \]; then\n\s+return 0/,
  );
  assert.equal((remoteDeploy.match(/trap rollback_cutover EXIT/g) ?? []).length, 1);
  assert.doesNotMatch(remoteDeploy, /set \+e/);
  assertOrdered(remoteDeploy, [
    "trap rollback_cutover EXIT",
    "begin_remote_timing_stage migration.provision",
    "migrate deploy --schema=",
    "provision-agent-workforce.mjs\\\" --execute",
    "finish_remote_timing_stage passed 0",
    "begin_remote_timing_stage candidate.warmup",
    "PORT=3101 HOSTNAME=127.0.0.1 pm2 start",
    "finish_remote_timing_stage passed 0",
    "begin_remote_timing_stage public.cutover",
    "PORT=3000 HOSTNAME=0.0.0.0 pm2 start",
    "release_committed=1",
    "finish_remote_timing_stage passed 0",
  ]);
  const rollback = remoteDeploy.slice(
    remoteDeploy.indexOf("rollback_cutover()"),
    remoteDeploy.indexOf("trap rollback_cutover EXIT"),
  );
  assertOrdered(rollback, [
    "exit_code=\\$?",
    "trap - EXIT",
    "finish_active_remote_timing_on_exit \\\"\\$exit_code\\\" || true",
    "exit \\\"\\$exit_code\\\"",
  ]);
  assert.match(remoteDeploy, /chmod 700 '\$REMOTE_WORKSPACE_CONFIG_DIR\/release-timing'/);
  assert.match(remoteDeploy, /REMOTE_RELEASE_TIMING_ENABLED" = "1" \] && \[ -n "\$\{RELEASE_TIMING_FILE:-\}"/);
  assert.match(remoteDeploy, /if ! remote_timing_copy="\$\(mktemp/);
  assertOrdered(remoteDeploy, [
    "release-timing.mjs validate",
    '--input "$remote_timing_copy"',
    '--release-id "$RELEASE_SOURCE_SHA"',
    "--scope deploy.remote",
    "--required-stages migration.provision,candidate.warmup,public.cutover",
    'cat "$remote_timing_copy" >> "$RELEASE_TIMING_FILE"',
  ]);
  assert.match(remoteDeploy, /rm -f "\$remote_timing_copy" \|\| true/);
});

test("the expanded remote artifact deployment shell remains syntactically valid", () => {
  const start = deploy.indexOf('  ssh_cmd "\n', deploy.indexOf("deploy_remote_artifact()"));
  const end = deploy.indexOf('\n  "\n  if [ "$REMOTE_RELEASE_TIMING_ENABLED"', start);
  assert.ok(start >= 0 && end > start, "remote artifact deployment shell must be extractable");
  const remote = deploy
    .slice(start + '  ssh_cmd "\n'.length, end)
    .replaceAll('\\"', '"')
    .replaceAll('\\$', '$');
  const result = spawnSync("bash", ["-n"], { input: remote, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

test("remote artifact deployment passes one complete command to ssh_cmd", () => {
  const result = spawnSync("bash", ["-c", String.raw`
    source ops/deploy/atomic-cutover.sh
    rsync() { :; }
    verify_release_order() { :; }
    ssh_cmd() {
      if [ "$#" -ne 1 ]; then
        printf 'ssh_cmd received %s arguments\n' "$#" >&2
        return 97
      fi
    }
    RELEASE_SOURCE_SHA=0123456789abcdef
    RELEASE_SOURCE_TREE=tree
    RELEASE_CONTENT_DIGEST=content
    ARTIFACT_SHA=artifact
    ARTIFACT_MANIFEST_SHA=manifest
    ARTIFACT_PATH=/dev/null
    ARTIFACT_MANIFEST_PATH=/dev/null
    SERVER=mock
    REMOTE_WORKSPACE_CONFIG_DIR=/tmp/workspace-config
    REMOTE_DIR=/tmp/workspace
    REMOTE_RELEASE_TIMING_ENABLED=0
    deploy_remote_artifact
  `], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
});

test("deployment lifecycle does not apply or gate private data releases", () => {
  assert.doesNotMatch(deploy, /apply-data-release|data-release-gate|metadata\.deployment\?\.dataReleases/);
});

test("genesis state parser preserves JavaScript quotes across SSH quoting", () => {
  assert.ok(deploy.includes(
    'node -e \'let body=\\\"\\\"; process.stdin.on(\\\"data\\\", chunk => body += chunk).on(\\\"end\\\", () => process.stdout.write(JSON.parse(body).state));\'',
  ));
});

test("Kimi sandbox mounts only the validated per-turn agent config", () => {
  assert.match(kimiSandboxRunner, /--agent-file=/);
  assert.match(kimiSandboxRunner, /\"\$ROOT\"\/turns\/\*\/config\/agent\.yaml/);
  assert.match(kimiSandboxRunner, /RESOLVED_AGENT_FILE/);
  assert.match(kimiSandboxRunner, /args\+=\(--ro-bind \"\$AGENT_CONFIG_DIR\" \"\$AGENT_CONFIG_DIR\"\)/);
});

test("Kimi local macOS runtime keeps a restricted sandbox without changing production Bubblewrap", () => {
  assert.match(kimiRuntimeInstaller, /HOST_OS="\$\(uname -s\)"/);
  assert.match(kimiRuntimeInstaller, /Darwin[\s\S]*?kimi-agent-sandbox-runner-darwin\.sh/);
  assert.match(kimiRuntimeInstaller, /Linux[\s\S]*?install_sandbox_bwrap/);
  assert.match(kimiDarwinSandboxRunner, /^#!\/usr\/bin\/env -S -i \/bin\/bash/);
  assert.match(kimiDarwinSandboxRunner, /\/usr\/bin\/sandbox-exec/);
  assert.match(kimiDarwinSandboxRunner, /\/usr\/bin\/env -i/);
  assert.match(kimiDarwinSandboxRunner, /ROOT_PARENT_6/);
  assert.match(kimiDarwinSandboxRunner, /"\$ROOT"\/turns\/\*\/config\/agent\.yaml/);
  assert.match(kimiDarwinSandboxProfile, /\(allow default\)/);
  assert.match(kimiDarwinSandboxProfile, /\(deny file-read\*[\s\S]*?require-not[\s\S]*?VENV_DIR[\s\S]*?AGENT_CONFIG_DIR/);
  assert.match(kimiDarwinSandboxProfile, /literal \(param "ROOT_PARENT_6"\)/);
  assert.match(kimiDarwinSandboxProfile, /\(deny file-write\*[\s\S]*?HOME_DIR[\s\S]*?SHARE_DIR[\s\S]*?WORK_DIR[\s\S]*?TMP_DIR/);
  assert.doesNotMatch(kimiDarwinSandboxProfile, /\(allow file-write\*/);
});

test("ONLYOFFICE derives a public origin only from validated runtime origins", () => {
  assert.match(onlyOfficeInstaller, /hint="\$\{WECHAT_REDIRECT_ORIGIN:-\}"/);
  assert.match(onlyOfficeInstaller, /127\\\.0\\\.0\\\.1\|localhost/);
  assertOrdered(onlyOfficeInstaller, [
    "ensure_secret\nload_environment",
    "ensure_public_origin\nload_environment",
  ]);
});

test("ONLYOFFICE keeps Nginx rollback copies outside enabled site paths", () => {
  assert.match(onlyOfficeInstaller, /backup="\$\(mktemp\)"/);
  assert.match(onlyOfficeInstaller, /sudo cp "\$site" "\$backup"/);
  assert.equal(onlyOfficeInstaller.includes("$site.workspace-onlyoffice.bak"), false);
  assert.match(onlyOfficeInstaller, /\/var\/backups\/workspace\/nginx/);
  assertOrdered(onlyOfficeInstaller, [
    "relocate_legacy_nginx_backups\ninstall_nginx_location",
  ]);
});

test("migration receipt checks embed only the previously validated migration name", () => {
  assert.equal(deploy.includes(":'migration_name'"), false);
  assertOrdered(deploy, [
    "grep -Eq '^[0-9]{14}_[a-z0-9_]+$'",
    "WHERE migration_name = '\\$migration_name'",
  ]);
});

test("migration inventory accepts only the resolve-applied sanitized baseline with zero steps", (context) => {
  const program = embeddedPrograms("node", "NODE")
    .find((candidate) => candidate.includes("database migration inventory contains a malformed row"));
  assert.ok(program, "migration inventory validator must be present");

  const root = mkdtempSync(join(tmpdir(), "workspace-migration-inventory-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const writeMigration = (name) => {
    const directory = join(root, name);
    const sql = "SELECT 1;\n";
    mkdirSync(directory);
    writeFileSync(join(directory, "migration.sql"), sql);
    return createHash("sha256").update(sql).digest("hex");
  };
  const baseline = "00000000000000_sanitized_baseline";
  const ordinary = "20260727000000_ordinary";
  const baselineChecksum = writeMigration(baseline);
  const ordinaryChecksum = writeMigration(ordinary);

  const accepted = runNode(program, {
    MIGRATIONS_DIR: root,
    MIGRATION_ROWS: `${baseline}|${baselineChecksum}|1|0|0`,
  });
  assert.equal(accepted.status, 0, accepted.stderr);

  const rejected = runNode(program, {
    MIGRATIONS_DIR: root,
    MIGRATION_ROWS: `${ordinary}|${ordinaryChecksum}|1|0|0`,
  });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /has no applied steps/);
});

test("all embedded deployment Node programs are syntactically executable", () => {
  const programs = embeddedPrograms("node", "NODE");
  assert.ok(programs.length >= 8, "expected embedded Node deployment programs");
  for (const [index, program] of programs.entries()) {
    const result = spawnSync(process.execPath, ["--check", "-"], { input: program, encoding: "utf8" });
    assert.equal(result.status, 0, `embedded Node program ${index + 1}: ${result.stderr}`);
  }
});

test("all embedded deployment Python programs are syntactically executable", () => {
  const programs = embeddedPrograms("python3", "PY");
  assert.ok(programs.length >= 10, "expected embedded Python deployment programs");
  for (const [index, program] of programs.entries()) {
    const remoteProgram = program.replaceAll('\\"', '"');
    const result = spawnSync("python3", [
      "-c",
      "import sys; compile(sys.stdin.read(), '<embedded-deploy-python>', 'exec')",
    ], { input: remoteProgram, encoding: "utf8" });
    assert.equal(result.status, 0, "embedded Python program " + (index + 1) + ": " + result.stderr);
  }
});

test("deployment uses CNB metadata and local history without any GitHub token", () => {
  assert.match(deploy, /--candidate "\$RELEASE_SOURCE_SHA"/);
  assert.match(deploy, /--current-head "\$RELEASE_SOURCE_SHA"/);
  assert.match(deploy, /git merge-base --is-ancestor "\$comparison_base" "\$RELEASE_SOURCE_SHA"/);
  assert.equal(deploy.includes("GITHUB_TOKEN"), false);
  assert.equal(deploy.includes("GH_TOKEN"), false);
  assert.equal(deploy.includes("stage_remote_github_token"), false);
  assert.equal(deploy.includes("verify_remote_release_order"), false);
  assertOrdered(deploy, [
    "verify_remote_deployed_record 'pre-migration'",
    "migrate deploy",
    "assert_release_version 'http://127.0.0.1:3101/workspace/api/settings/version' 'candidate'",
    "verify_remote_deployed_record 'pre-cutover'",
    "PORT=3000 HOSTNAME=0.0.0.0 pm2 start",
  ]);
});

test("CNB reads relative JSON inputs as files instead of Node modules", () => {
  assert.match(deploy, /JSON\.parse\(require\("node:fs"\)\.readFileSync\(process\.argv\[1\], "utf8"\)\)/);
  assert.equal(
    /require\((?:"\.\/" \+ )?process\.argv\[1\]\)/.test(deploy),
    false,
    "relative JSON inputs must not use Node module resolution",
  );
});

test("bootstrap crash recovery binds progress, fences writers, and validates candidate migration inventory", () => {
  assert.match(deploy, /production-bootstrap-in-progress\.json/);
  assert.match(deploy, /candidateMigrationSetSha256/);
  assert.match(deploy, /'schemaVersion': 2/);
  assert.match(deploy, /'phase': 'mutation-started'/);
  assert.match(deploy, /legacyCnbBuildSn/);
  assert.match(deploy, /legacyRuntimeVersion/);
  assert.match(deploy, /legacyBuildId/);
  assert.match(deploy, /legacyCnbRepository/);
  assert.equal(deploy.includes("REPLACEABLE"), false);
  assert.match(deploy, /production bootstrap current release 已漂移/);
  assert.match(deploy, /锁内主动隔离所有可能残留的 writer/);
  assert.match(deploy, /database_progress=1/);
  assert.match(deploy, /absent from the candidate or has a different checksum/);
  assert.match(deploy, /unfinished; resolve it explicitly before retrying deployment/);
  assert.match(deploy, /if \[ -n '\$RELEASE_BOOTSTRAP_BASE' \]; then[\s\S]*?maintenance_migrations/);
  const progressCall = deploy.indexOf("\n    ensure_bootstrap_progress_marker\n    if [ -n");
  assert.ok(progressCall >= 0, "bootstrap progress marker must be called before mutations");
  for (const mutation of [
    'marker_tmp=\\"\\$maintenance_marker_path.tmp.',
    'migrate deploy --schema=',
    'seed-resources-runtime.mjs',
    'provision-agent-workforce.mjs\\" --execute',
    'pm2 start \\"\\$release_dir/\\$server_entry\\" --name \\"\\$cutover_candidate_name\\"',
  ]) {
    assert.ok(deploy.indexOf(mutation, progressCall) > progressCall, "progress marker must precede " + mutation);
  }
});

test("bootstrap PM2 proof accepts legacy Workspace plus optional WeCom and fails closed", (context) => {
  const program = embeddedPrograms("python3", "PY")
    .find((candidate) => candidate.includes("production bootstrap candidate writer is not safely offline"));
  assert.ok(program, "bootstrap PM2 proof program must be present");
  const root = mkdtempSync(join(tmpdir(), "workspace-bootstrap-pm2-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const target = join(root, "legacy");
  const app = join(target, "workspace");
  const executable = join(app, "server.js");
  mkdirSync(app, { recursive: true });
  writeFileSync(executable, "module.exports = {};\n");
  const baseEnv = {
    EXPECTED_TARGET: target,
    EXPECTED_PM2_NAME: "workspace",
    EXPECTED_CANDIDATE_NAME: "workspace-candidate",
    EXPECTED_WECOM_NAME: "workspace-wecom-agent",
  };
  const process = (name, status, pid, cwd = app, entry = executable) => ({
    name,
    pid,
    pm2_env: { status, pm_cwd: cwd, pm_exec_path: entry },
  });

  const first = runPython(program, {
    ...baseEnv,
    PM2_LIST: JSON.stringify([
      process("workspace", "online", 101),
      process("workspace-wecom-agent", "online", 102),
    ]),
  });
  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.stdout.trim(), "ONLINE");

  const retry = runPython(program, {
    ...baseEnv,
    PM2_LIST: JSON.stringify([
      process("workspace", "stopped", 0),
      process("workspace-candidate", "stopped", 0),
      process("workspace-wecom-agent", "stopped", 0),
    ]),
  });
  assert.equal(retry.status, 0, retry.stderr);
  assert.equal(retry.stdout.trim(), "OFFLINE");

  const ambiguous = runPython(program, {
    ...baseEnv,
    PM2_LIST: JSON.stringify([
      process("workspace", "online", 101),
      process("workspace-candidate", "launching", 301),
    ]),
  });
  assert.notEqual(ambiguous.status, 0, "transitional candidate state must fail closed");
});

test("bootstrap mutation marker is atomic, exact, and never rebinds another candidate", (context) => {
  const program = embeddedPrograms("python3", "PY")
    .find((candidate) => candidate.includes("path.parent.mkdir(parents=True, exist_ok=True)")
      && candidate.includes("'phase': 'mutation-started'"));
  assert.ok(program, "bootstrap marker creation program must be present");
  const root = mkdtempSync(join(tmpdir(), "workspace-bootstrap-marker-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const marker = join(root, "production-bootstrap-in-progress.json");
  const env = {
    BOOTSTRAP_PROGRESS_MARKER: marker,
    EXPECTED_BASELINE: "1".repeat(40),
    EXPECTED_CANDIDATE: "2".repeat(40),
    EXPECTED_TREE: "3".repeat(40),
    EXPECTED_MIGRATION_SET: "4".repeat(64),
    EXPECTED_LEGACY_RELEASE: "20260715164825-515f986a",
    EXPECTED_LEGACY_CNB_COMMIT: "5".repeat(40),
    EXPECTED_LEGACY_CNB_BUILD_SN: "cnb-8gh-1jtif23er",
    EXPECTED_LEGACY_RUNTIME_VERSION: "local-1784105165477",
    EXPECTED_LEGACY_BUILD_ID: "local-1784105165133",
    EXPECTED_LEGACY_CNB_REPOSITORY: "example-owner/example-repo",
    EXPECTED_BASELINE_COUNT: "17",
    EXPECTED_BASELINE_DIGEST: "6".repeat(64),
  };
  const created = runPython(program, env);
  assert.equal(created.status, 0, created.stderr);
  const receipt = JSON.parse(readFileSync(marker, "utf8"));
  assert.equal(receipt.schemaVersion, 2);
  assert.equal(receipt.phase, "mutation-started");
  assert.equal(receipt.candidateSha, env.EXPECTED_CANDIDATE);
  const sameCandidateRetry = runPython(program, env);
  assert.equal(sameCandidateRetry.status, 0, sameCandidateRetry.stderr);
  const differentCandidate = runPython(program, {
    ...env,
    EXPECTED_CANDIDATE: "7".repeat(40),
  });
  assert.notEqual(differentCandidate.status, 0, "a mutation-started receipt must never rebind");
});

test("completed marker reconciliation runs before release-order checks and preserves current-candidate resume", () => {
  assertOrdered(deploy, [
    "acquire_remote_deploy_lock",
    "reconcile_completed_deploy_markers",
    "verify_release_order",
  ]);
  assert.match(deploy, /all\(value == source for value in marker_sources\)[\s\S]*?print\('CLEAN'\)/);
  assert.match(deploy, /all\(value == os\.environ\['EXPECTED_CANDIDATE'\] for value in marker_sources\)[\s\S]*?print\('RESUME'\)/);
  assert.match(deploy, /marker_action\\" = 'RESUME'[\s\S]*?保留并进入锁内 resume/);
  assertOrdered(deploy, [
    "temporary.replace(path)",
    "release_committed=1",
    "rm -f '$REMOTE_WORKSPACE_CONFIG_DIR/maintenance-deploy'",
    "rm -f '$REMOTE_WORKSPACE_CONFIG_DIR/production-bootstrap-in-progress.json'",
  ]);
});

test("current switches atomically and deployed-release is the rollback commit point", () => {
  assert.equal(
    /ln -sfn [^\n]*'\$REMOTE_DIR\/current'/.test(deploy),
    false,
    "current must never use unlink-before-create ln -sfn",
  );
  assert.match(
    deploy,
    /atomic_switch_current\(\)[\s\S]*?ln -s "\\\$current_target" "\\\$current_swap_tmp"[\s\S]*?mv -Tf "\\\$current_swap_tmp" '\$REMOTE_DIR\/current'/,
  );
  assert.match(deploy, /atomic_switch_current \\"\\\$old_release\\"/);
  assert.match(deploy, /atomic_switch_current \\"\\\$release_dir\\"/);
  assertOrdered(deploy, [
    "assert_release_version 'http://127.0.0.1:3000/workspace/api/settings/version' 'public'",
    'atomic_switch_current \\"\\$release_dir\\"',
    "'$REMOTE_RELEASE_RECEIPT_TOOL' write",
    "release_committed=1",
  ]);
  assertOrdered(deploy, [
    "rollback_cutover()",
    "deployed-release 原子记录已绑定当前 candidate",
    "candidate_cleanup_failed=0",
  ]);
});

test("every uncommitted failure removes candidate, and unknown candidate state fences all other writers first", () => {
  const rollbackStart = deploy.indexOf("rollback_cutover()");
  const rollbackEnd = deploy.indexOf("trap rollback_cutover EXIT", rollbackStart);
  const rollback = deploy.slice(rollbackStart, rollbackEnd);
  assertOrdered(rollback, [
    'pm2 delete "\\$cutover_candidate_name"',
    'rollback_candidate_pid=\\$(pm2_pid_or_unavailable "\\$cutover_candidate_name")',
    "candidate_cleanup_failed=1",
    "candidate 无法确认停止；立即隔离 public 与 WeCom",
    "pm2 delete '$PM2_NAME'",
    "pm2 delete '$PM2_WECOM_BOT_NAME'",
    "rollback_public_pid=",
    "rollback_wecom_pid=",
    "pm2 save ||",
  ]);
  assert.match(
    deploy,
    /锁内清理遗留 candidate[\s\S]*?pm2 delete '\$PM2_NAME-candidate'[\s\S]*?candidate writer is still active before release verification[\s\S]*?pm2 save[\s\S]*?if \[ ! -e \\"\\\$maintenance_marker\\" \]/,
  );
});

test("every non-CLEAN marker path and failed CLEAN proof fences all managed writers", () => {
  assert.match(
    deploy,
    /marker_action\\" = 'RESUME'[\s\S]*?fence_all_writers[\s\S]*?进入锁内 resume/,
  );
  assert.match(
    deploy,
    /marker_action\\" = 'CONFLICT'[\s\S]*?fence_all_writers[\s\S]*?writer 已保持隔离/,
  );
  assert.match(
    deploy,
    /marker_action\\" != 'CLEAN'[\s\S]*?fence_all_writers[\s\S]*?action 无效/,
  );
  assert.match(
    deploy,
    /if ! \([\s\S]*?marker reconciliation runtime version[\s\S]*?\); then[\s\S]*?fence_all_writers[\s\S]*?CLEAN marker 无法证明/,
  );
});
