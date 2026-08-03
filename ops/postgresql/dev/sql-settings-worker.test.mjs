import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
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

const sourceDirectory = new URL("./", import.meta.url);
const read = (name) => readFileSync(new URL(name, sourceDirectory), "utf8");
const workerSource = read("sql-settings-worker.sh");

const timestamp = "2026-07-31T03:00:00.000Z";
const idempotencyHash = "1".repeat(64);
const requestFingerprint = "2".repeat(64);
const settingRequest = (overrides = {}) => ({
  operation: "set-runtime-setting",
  status: "running",
  settingKey: "statement_timeout",
  requestedValue: "60s",
  expectedCurrentValueMs: 120000,
  reason: "contract test",
  requestedByUserId: 42,
  createdAt: timestamp,
  startedAt: timestamp,
  idempotencyHash,
  requestFingerprint,
  ...overrides,
});
const passwordRequest = () => ({
  operation: "rotate-runtime-password",
  status: "running",
  reason: "contract test",
  requestedByUserId: 42,
  createdAt: timestamp,
  startedAt: timestamp,
  idempotencyHash,
  requestFingerprint,
});

function createHarness(request, options = {}) {
  const temporary = mkdtempSync(path.join(tmpdir(), "workspace-sql-settings-"));
  const composeRoot = path.join(temporary, "postgresql-security");
  const fakeBin = path.join(temporary, "bin");
  const captureFile = path.join(temporary, "capture.ndjson");
  const stateFile = path.join(temporary, "state.json");
  const oldPassword = "a".repeat(64);
  const newPassword = "b".repeat(64);
  mkdirSync(path.join(composeRoot, "secrets"), { recursive: true });
  mkdirSync(fakeBin, { recursive: true });
  writeFileSync(path.join(composeRoot, ".env"), "WORKSPACE_DEV_SOURCE_DIR=/fake\n", { mode: 0o600 });
  writeFileSync(path.join(composeRoot, "compose.yaml"), `name: workspace-dev-secure
services:
  db:
    container_name: workspace-dev-db
  app:
    container_name: workspace-dev
`);
  writeFileSync(path.join(composeRoot, "secrets", "workspace_dev_runtime_password"), oldPassword, { mode: 0o600 });
  const renderedWorker = workerSource
    .replace(
      'readonly EXPECTED_COMPOSE_ROOT="/home/ubuntu/workspace-dev/postgresql-security"',
      `readonly EXPECTED_COMPOSE_ROOT=${JSON.stringify(composeRoot)}`,
    )
    .replace(
      '[ "$(id -u)" -eq 0 ] || fail "the SQL settings worker must run as root"',
      ': # fake contract test runs without root',
    )
    .replace(
      '[ -S "$DOCKER_SOCKET" ] || fail "the governed Docker socket is unavailable"',
      ': # fake contract test uses a fake docker command',
    )
    .replace('install -d -o root -g root -m 0700 "$journal_directory"', 'install -d -m 0700 "$journal_directory"')
    .replaceAll('[ "$(stat -c %u "$journal_directory")" = 0 ]', '[ "$(stat -c %u "$journal_directory")" -ge 0 ]')
    .replaceAll('[ "$(stat -c %u "$journal_path")" = 0 ]', '[ "$(stat -c %u "$journal_path")" -ge 0 ]')
    .replace('chown root:root "$temporary"', 'chmod 0600 "$temporary"');
  const worker = path.join(composeRoot, "sql-settings-worker.sh");
  writeFileSync(worker, renderedWorker, { mode: 0o700 });

  const fakeDocker = path.join(fakeBin, "docker.mjs");
  writeFileSync(fakeDocker, `#!/usr/bin/env node
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
const args = process.argv.slice(2);
const stdin = readFileSync(0, "utf8");
const readState = () => existsSync(process.env.FAKE_STATE_FILE)
  ? JSON.parse(readFileSync(process.env.FAKE_STATE_FILE, "utf8"))
  : { composeCount: 0, settingApplyCount: 0 };
const writeState = (value) => writeFileSync(process.env.FAKE_STATE_FILE, JSON.stringify(value));
const record = {
  args,
  stdinHasOldPassword: stdin.includes(process.env.FAKE_OLD_PASSWORD),
  stdinHasNewPassword: stdin.includes(process.env.FAKE_NEW_PASSWORD),
  stdinHasSetting: stdin.includes("ALTER ROLE workspace_dev_runtime IN DATABASE workspace_dev SET"),
  stdinHasSuccess: args.some((value) => value === "request_status=succeeded"),
  stdinHasFailed: args.some((value) => value === "request_status=failed"),
  stdinHasReconciliation: args.some((value) => value === "request_status=reconciliation_required"),
  errorCode: (args.find((value) => value.startsWith("error_code=")) || "").slice("error_code=".length),
  message: (args.find((value) => value.startsWith("message=")) || "").slice("message=".length),
};
appendFileSync(process.env.FAKE_CAPTURE_FILE, JSON.stringify(record) + "\\n");
if (args[0] === "exec" && args.some((value) => value.includes("FOR UPDATE SKIP LOCKED"))) {
  const encoded = Buffer.from(process.env.FAKE_REQUEST_JSON, "utf8").toString("base64");
  process.stdout.write(process.env.FAKE_REQUEST_KEY + "|" + encoded + "\\n");
} else if (args[0] === "exec" && args.includes("/bin/bash")) {
  const state = readState();
  const settingKey = args.at(-1);
  const current = {
    statement_timeout: process.env.FAKE_CURRENT_STATEMENT_MS,
    lock_timeout: process.env.FAKE_CURRENT_LOCK_MS,
    idle_in_transaction_session_timeout: process.env.FAKE_CURRENT_IDLE_MS,
  };
  const observed = state.settingApplyCount > 0 && settingKey === process.env.FAKE_SETTING_KEY
    ? process.env.FAKE_OBSERVED_TARGET_MS
    : current[settingKey];
  if (observed === undefined || process.env.FAKE_SETTING_READ_FAIL === "1") process.exit(1);
  process.stdout.write(observed + "\\n");
} else if (args[0] === "compose") {
  const state = readState();
  state.composeCount += 1;
  writeState(state);
} else if (args[0] === "inspect") {
  const state = readState();
  const failFirst = process.env.FAKE_FAIL_FIRST_HEALTH === "1" && state.composeCount === 1;
  process.stdout.write(failFirst ? "unhealthy\\n" : "healthy\\n");
}
if (record.stdinHasSetting) {
  const state = readState();
  state.settingApplyCount += 1;
  writeState(state);
}
if (record.stdinHasSuccess && process.env.FAKE_FAIL_SUCCESS_WRITE === "1") process.exit(1);
`);
  chmodSync(fakeDocker, 0o700);
  symlinkSync(fakeDocker, path.join(fakeBin, "docker"));

  const fakeOpenSsl = path.join(fakeBin, "openssl");
  writeFileSync(fakeOpenSsl, "#!/usr/bin/env node\nprocess.stdout.write(process.env.FAKE_NEW_PASSWORD);\n", { mode: 0o700 });
  const fakeCurl = path.join(fakeBin, "curl");
  writeFileSync(fakeCurl, "#!/usr/bin/env node\nprocess.exit(0);\n", { mode: 0o700 });

  const env = {
    ...process.env,
    PATH: `${fakeBin}:${process.env.PATH}`,
    WORKSPACE_SQL_SETTINGS_EXECUTE: "1",
    WORKSPACE_DEV_POSTGRESQL_COMPOSE_ROOT: composeRoot,
    WORKSPACE_SQL_SETTINGS_HEALTH_ATTEMPTS: "1",
    FAKE_CAPTURE_FILE: captureFile,
    FAKE_STATE_FILE: stateFile,
    FAKE_REQUEST_KEY: "postgresqlOperationRequest:contract_1",
    FAKE_REQUEST_JSON: JSON.stringify(request),
    FAKE_OLD_PASSWORD: oldPassword,
    FAKE_NEW_PASSWORD: newPassword,
    FAKE_FAIL_FIRST_HEALTH: options.failFirstHealth ? "1" : "0",
    FAKE_FAIL_SUCCESS_WRITE: options.failSuccessWrite ? "1" : "0",
    FAKE_SETTING_READ_FAIL: options.settingReadFail ? "1" : "0",
    FAKE_SETTING_KEY: request.settingKey || "-",
    FAKE_CURRENT_STATEMENT_MS: String(options.currentStatementMs ?? 120000),
    FAKE_CURRENT_LOCK_MS: String(options.currentLockMs ?? 10000),
    FAKE_CURRENT_IDLE_MS: String(options.currentIdleMs ?? 60000),
    FAKE_OBSERVED_TARGET_MS: String(options.observedTargetMs ?? ({
      "1s": 1000,
      "5s": 5000,
      "10s": 10000,
      "30s": 30000,
      "60s": 60000,
      "120s": 120000,
      "300s": 300000,
    }[request.requestedValue] ?? 0)),
  };
  return {
    temporary,
    composeRoot,
    captureFile,
    stateFile,
    oldPassword,
    newPassword,
    worker,
    env,
    run: () => spawnSync("bash", [worker], { encoding: "utf8", env }),
    cleanup: () => rmSync(temporary, { recursive: true, force: true }),
  };
}

test("worker contract is explicit, development-only, atomic, and secret-free", () => {
  const service = read("sql-settings-worker.service");
  const timer = read("sql-settings-worker.timer");
  assert.match(workerSource, /WORKSPACE_SQL_SETTINGS_EXECUTE:-0/);
  assert.match(workerSource, /EXPECTED_COMPOSE_ROOT="\/home\/ubuntu\/workspace-dev\/postgresql-security"/);
  assert.match(workerSource, /DOCKER_SOCKET="\/run\/docker\.sock"/);
  assert.match(workerSource, /DATABASE_CONTAINER="workspace-dev-db"/);
  assert.match(workerSource, /REQUEST_PREFIX="postgresqlOperationRequest:"/);
  assert.match(workerSource, /FOR UPDATE SKIP LOCKED/);
  assert.match(workerSource, /AND \("value"::jsonb ->> 'status'\) = 'pending'/);
  assert.match(workerSource, /set-runtime-setting/);
  assert.match(workerSource, /rotate-runtime-password/);
  for (const key of [
    "statement_timeout",
    "lock_timeout",
    "idle_in_transaction_session_timeout",
  ]) assert.match(workerSource, new RegExp(`\\b${key}\\b`));
  assert.doesNotMatch(workerSource, /\\bidle_session_timeout\\b/);
  assert.match(workerSource, /expectedCurrentValueMs/);
  assert.match(workerSource, /requestedValue/);
  assert.match(workerSource, /createdAt/);
  assert.match(workerSource, /STALE_SETTING/);
  assert.match(workerSource, /INVALID_TIMEOUT_RELATION/);
  assert.match(workerSource, /SETTING_VERIFY_FAILED/);
  assert.match(workerSource, /openssl rand -hex 32/);
  assert.match(workerSource, /--force-recreate app/);
  assert.match(workerSource, /reconciliation_required/);
  assert.match(workerSource, /password-rotation\.json/);
  assert.match(workerSource, /chown root:root/);
  assert.match(workerSource, /"value"::jsonb - 'errorCode' - 'message' - 'completedAt'/);
  assert.doesNotMatch(workerSource, /- 'requestedValue'/);
  assert.doesNotMatch(workerSource, /printf[^\n]*new_password/);
  assert.match(service, /Environment=WORKSPACE_SQL_SETTINGS_EXECUTE=1/);
  assert.match(service, /WorkingDirectory=\/home\/ubuntu\/workspace-dev\/postgresql-security/);
  assert.match(service, /User=root/);
  assert.match(service, /ReadWritePaths=.*\/secrets .*\/runtime\/sql-settings-worker .*\/run\/docker\.sock/);
  assert.match(timer, /OnUnitActiveSec=1min/);
  assert.match(timer, /Persistent=true/);
});

test("fake worker atomically applies one allowlisted runtime setting", () => {
  const harness = createHarness(settingRequest());
  try {
    const result = harness.run();
    assert.equal(result.status, 0, result.stderr);
    const records = readFileSync(harness.captureFile, "utf8").trim().split("\n").map(JSON.parse);
    assert.ok(records.some((record) => record.args.some((value) => value.includes("FOR UPDATE SKIP LOCKED"))));
    assert.ok(records.some((record) => record.stdinHasSetting));
    assert.ok(records.some((record) => record.stdinHasSuccess));
    assert.equal(records.some((record) => record.args[0] === "compose"), false);
    assert.doesNotMatch(result.stdout + result.stderr, /workspace_dev_runtime_password/);
  } finally {
    harness.cleanup();
  }
});

test("fake worker rejects a non-allowlisted setting and seals it failed", () => {
  const harness = createHarness(settingRequest({ settingKey: "search_path", requestedValue: "public" }));
  try {
    const result = harness.run();
    assert.notEqual(result.status, 0);
    const records = readFileSync(harness.captureFile, "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(records.some((record) => record.stdinHasSetting), false);
    assert.ok(records.some((record) => record.stdinHasFailed));
  } finally {
    harness.cleanup();
  }
});

test("fake worker refuses a stale expected value without applying the setting", () => {
  const harness = createHarness(settingRequest({ expectedCurrentValueMs: 30000 }));
  try {
    const result = harness.run();
    assert.notEqual(result.status, 0);
    const records = readFileSync(harness.captureFile, "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(records.some((record) => record.stdinHasSetting), false);
    assert.ok(records.some((record) => record.errorCode === "STALE_SETTING"));
  } finally {
    harness.cleanup();
  }
});

test("fake worker enforces lock_timeout lower than the effective statement_timeout", () => {
  const request = settingRequest({
    settingKey: "lock_timeout",
    requestedValue: "30s",
    expectedCurrentValueMs: 10000,
  });
  const harness = createHarness(request, { currentStatementMs: 30000 });
  try {
    const result = harness.run();
    assert.notEqual(result.status, 0);
    const records = readFileSync(harness.captureFile, "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(records.some((record) => record.stdinHasSetting), false);
    assert.ok(records.some((record) => record.errorCode === "INVALID_TIMEOUT_RELATION"));
  } finally {
    harness.cleanup();
  }
});

test("fake worker fails closed when the post-apply observed value differs", () => {
  const harness = createHarness(settingRequest(), { observedTargetMs: 30000 });
  try {
    const result = harness.run();
    assert.notEqual(result.status, 0);
    const records = readFileSync(harness.captureFile, "utf8").trim().split("\n").map(JSON.parse);
    assert.ok(records.some((record) => record.stdinHasSetting));
    assert.ok(records.some((record) => record.errorCode === "SETTING_VERIFY_FAILED"));
    assert.equal(records.some((record) => record.stdinHasSuccess), false);
  } finally {
    harness.cleanup();
  }
});

test("fake password rotation restores the old role and file after health failure without logging either secret", () => {
  const harness = createHarness(passwordRequest(), { failFirstHealth: true });
  try {
    const result = harness.run();
    assert.notEqual(result.status, 0);
    const capture = readFileSync(harness.captureFile, "utf8");
    const records = capture.trim().split("\n").map(JSON.parse);
    assert.equal(
      readFileSync(path.join(harness.composeRoot, "secrets", "workspace_dev_runtime_password"), "utf8"),
      harness.oldPassword,
    );
    assert.ok(records.some((record) => record.stdinHasNewPassword));
    assert.ok(records.some((record) => record.stdinHasOldPassword));
    assert.equal(records.filter((record) => record.args[0] === "compose").length, 2);
    assert.ok(records.some((record) => record.stdinHasFailed));
    const journalPath = path.join(harness.composeRoot, "runtime", "sql-settings-worker", "password-rotation.json");
    const journal = JSON.parse(readFileSync(journalPath, "utf8"));
    assert.equal(journal.status, "failed");
    assert.equal(journal.phase, "rolled-back");
    assert.equal(statSync(journalPath).mode & 0o777, 0o600);
    assert.doesNotMatch(capture + result.stdout + result.stderr, new RegExp(harness.oldPassword));
    assert.doesNotMatch(capture + result.stdout + result.stderr, new RegExp(harness.newPassword));
  } finally {
    harness.cleanup();
  }
});

test("a result-write interruption never retries or rolls back and leaves reconciliation_required", () => {
  const harness = createHarness(passwordRequest(), { failSuccessWrite: true });
  try {
    const result = harness.run();
    assert.notEqual(result.status, 0);
    const capture = readFileSync(harness.captureFile, "utf8");
    const records = capture.trim().split("\n").map(JSON.parse);
    assert.equal(
      readFileSync(path.join(harness.composeRoot, "secrets", "workspace_dev_runtime_password"), "utf8"),
      harness.newPassword,
    );
    assert.ok(records.some((record) => record.stdinHasNewPassword));
    assert.equal(records.some((record) => record.stdinHasOldPassword), false);
    assert.ok(records.some((record) => record.stdinHasReconciliation));
    assert.ok(records.some((record) => record.args[0] === "stop"));
    const journal = JSON.parse(readFileSync(
      path.join(harness.composeRoot, "runtime", "sql-settings-worker", "password-rotation.json"),
      "utf8",
    ));
    assert.equal(journal.status, "reconciliation_required");
    assert.doesNotMatch(capture + result.stdout + result.stderr, new RegExp(harness.oldPassword));
    assert.doesNotMatch(capture + result.stdout + result.stderr, new RegExp(harness.newPassword));
  } finally {
    harness.cleanup();
  }
});
