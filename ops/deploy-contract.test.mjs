import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const deploy = readFileSync(new URL("./deploy.sh", import.meta.url), "utf8");
const kimiSandboxRunner = readFileSync(new URL("./kimi-agent-sandbox-runner.sh", import.meta.url), "utf8");

function assertOrdered(source, needles) {
  let previous = -1;
  for (const needle of needles) {
    const index = source.indexOf(needle, previous + 1);
    assert.ok(index >= 0, "missing deploy contract fragment: " + needle);
    assert.ok(index > previous, "out-of-order deploy contract fragment: " + needle);
    previous = index;
  }
}

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

test("deployed release reader accepts only current receipts or the exact legacy CNB receipt", (context) => {
  const program = embeddedPrograms("python3", "PY")
    .find((candidate) => candidate.includes("unsupported deployed-release schema"));
  assert.ok(program, "deployed release reader must be present");
  const root = mkdtempSync(join(tmpdir(), "workspace-deployed-release-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const recordPath = join(root, "deployed-release.json");
  const base = {
    source: { commitSha: "a".repeat(40) },
    artifact: { sha256: "b".repeat(64) },
    cnb: { repository: "illya317/Workspace" },
  };
  const run = (record) => {
    writeFileSync(recordPath, JSON.stringify(record));
    return runPython(program, {
      REMOTE_WORKSPACE_CONFIG_DIR: root,
      EXPECTED_REPOSITORY: "illya317/Workspace",
    });
  };

  const current = run({
    ...base,
    schemaVersion: 1,
    cnb: { ...base.cnb, injectionSha: "c".repeat(40) },
  });
  assert.equal(current.status, 0);
  assert.match(current.stdout, /^RECORD\ta{40}\tc{40}\tb{64}\tillya317\/Workspace$/m);

  const legacy = run({
    ...base,
    schemaVersion: 2,
    cnb: { ...base.cnb, releaseCommitSha: "d".repeat(40) },
  });
  assert.equal(legacy.status, 0);
  assert.match(legacy.stdout, /^RECORD\ta{40}\td{40}\tb{64}\tillya317\/Workspace$/m);

  for (const ambiguous of [
    { ...base, schemaVersion: 1, cnb: { ...base.cnb, injectionSha: "c".repeat(40), releaseCommitSha: "d".repeat(40) } },
    { ...base, schemaVersion: 2, cnb: { ...base.cnb, injectionSha: "c".repeat(40), releaseCommitSha: "d".repeat(40) } },
    { ...base, schemaVersion: 3, cnb: { ...base.cnb, injectionSha: "c".repeat(40) } },
  ]) {
    const result = run(ambiguous);
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), "INVALID");
  }
});

test("ordinary PostgreSQL releases restore the previous application until the release record is committed", () => {
  assert.match(deploy, /public_process_stopped=0/);
  assert.match(deploy, /release_committed=0/);
  assert.match(deploy, /pm2 delete '\$PM2_NAME'[\s\S]*?public_process_stopped=1/);
  assert.match(deploy, /\[ -z \\"\\\$cutover_source\\" \][\s\S]*?\[ \\"\\\$public_process_stopped\\" = '1' \][\s\S]*?\[ \\"\\\$release_committed\\" = '0' \]/);
  assert.match(deploy, /PORT=3000 HOSTNAME=0\.0\.0\.0 pm2 start \\"\\\$old_release\/\\\$old_server_entry\\"/);
  assert.match(deploy, /atomic_switch_current \\"\\\$old_release\\"/);
  assert.match(deploy, /temporary\.replace\(path\)\nPY\n    release_committed=1/);
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
    /if \[ ! -f '\$REMOTE_WORKSPACE_CONFIG_DIR\/maintenance-deploy' \]; then\n\s+rm -rf '\$REMOTE_BACKUP_DIR\/maintenance-pinned'/,
  );
  assert.match(deploy, /release_committed=1\n\s+rm -f '\$REMOTE_WORKSPACE_CONFIG_DIR\/maintenance-deploy'/);
});

test("Kimi runtime, artifact integrity, and release order fail closed", () => {
  assert.match(
    deploy,
    /installed-source\.sha256[\s\S]*?install-kimi-agent-runtime\.sh' --check[\s\S]*?跳过网络安装/,
  );
  assert.match(
    deploy,
    /rsync -av[\s\S]*?\$ARTIFACT_MANIFEST_PATH[\s\S]*?上传后再次确认 CNB release metadata 与部署顺序[\s\S]*?verify_release_order[\s\S]*?服务器复验产物/,
  );
  assert.match(
    deploy,
    /if \[ "\$order_action" = "noop" \]; then[\s\S]*?run_healthcheck[\s\S]*?exit 0/,
  );
});

test("Kimi sandbox mounts only the validated per-turn agent config", () => {
  assert.match(kimiSandboxRunner, /--agent-file=/);
  assert.match(kimiSandboxRunner, /\"\$ROOT\"\/turns\/\*\/config\/agent\.yaml/);
  assert.match(kimiSandboxRunner, /RESOLVED_AGENT_FILE/);
  assert.match(kimiSandboxRunner, /args\+=\(--ro-bind \"\$AGENT_CONFIG_DIR\" \"\$AGENT_CONFIG_DIR\"\)/);
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
    EXPECTED_LEGACY_CNB_REPOSITORY: "illya317/Workspace",
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
    "temporary.replace(path)",
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
