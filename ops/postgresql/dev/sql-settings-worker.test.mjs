import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import {
  chmodSync,
  existsSync,
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
const requestId = "contract_1";
const requestHmacSecret = "3".repeat(64);
const signRequest = (request) => {
  const canonical = JSON.stringify({
    requestId,
    operation: request.operation ?? null,
    settingKey: request.settingKey ?? null,
    requestedValue: request.requestedValue ?? null,
    expectedCurrentValueMs: request.expectedCurrentValueMs ?? null,
    reason: request.reason ?? null,
    requestedByUserId: request.requestedByUserId ?? null,
    createdAt: request.createdAt ?? null,
    idempotencyHash: request.idempotencyHash ?? null,
    requestFingerprint: request.requestFingerprint ?? null,
  });
  return {
    ...request,
    requestId,
    requestSignature: createHmac("sha256", requestHmacSecret).update(canonical).digest("hex"),
  };
};
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
  completedAt: null,
  message: null,
  idempotencyHash,
  requestFingerprint,
  ...overrides,
});
const passwordRequest = () => signRequest({
  operation: "rotate-runtime-password",
  status: "running",
  settingKey: null,
  requestedValue: null,
  expectedCurrentValueMs: null,
  reason: "contract test",
  requestedByUserId: 42,
  createdAt: timestamp,
  startedAt: timestamp,
  completedAt: null,
  message: null,
  idempotencyHash,
  requestFingerprint,
});

function createHarness(request, options = {}) {
  const temporary = mkdtempSync(path.join(tmpdir(), "workspace-sql-settings-"));
  const composeRoot = path.join(temporary, "postgresql-security");
  const fakeBin = path.join(temporary, "bin");
  const captureFile = path.join(temporary, "capture.ndjson");
  const stateFile = path.join(temporary, "state.json");
  const worker = path.join(composeRoot, "sql-settings-worker.sh");
  const runtimeDirectory = path.join(temporary, "worker-runtime");
  const oldPassword = "a".repeat(64);
  const newPassword = "b".repeat(64);
  mkdirSync(path.join(composeRoot, "secrets"), { recursive: true });
  chmodSync(path.join(composeRoot, "secrets"), 0o700);
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
  writeFileSync(path.join(composeRoot, "secrets", "workspace_dev_sql_settings_request_hmac"), requestHmacSecret, { mode: 0o600 });
  if (options.malformedLedger) {
    mkdirSync(runtimeDirectory, { recursive: true });
    writeFileSync(path.join(runtimeDirectory, "sql-settings-receipts.json"), "{not-json}\n", { mode: 0o600 });
  }
  const renderedWorker = workerSource
    .replace(
      'readonly EXPECTED_COMPOSE_ROOT="/home/ubuntu/workspace-dev/postgresql-security"',
      `readonly EXPECTED_COMPOSE_ROOT=${JSON.stringify(composeRoot)}`,
    )
    .replace(
      'readonly EXPECTED_WORKER_PATH="/usr/local/lib/workspace-postgresql-dev/sql-settings-worker.sh"',
      `readonly EXPECTED_WORKER_PATH=${JSON.stringify(worker)}`,
    )
    .replace(
      'readonly ROTATION_JOURNAL_PATH="/var/lib/workspace-postgresql-dev/password-rotation.json"',
      `readonly ROTATION_JOURNAL_PATH=${JSON.stringify(path.join(runtimeDirectory, "password-rotation.json"))}`,
    )
    .replace(
      'readonly RECEIPT_LEDGER_PATH="/var/lib/workspace-postgresql-dev/sql-settings-receipts.json"',
      `readonly RECEIPT_LEDGER_PATH=${JSON.stringify(path.join(runtimeDirectory, "sql-settings-receipts.json"))}`,
    )
    .replace(
      'readonly RECEIPT_LEDGER_LOCK_PATH="/var/lib/workspace-postgresql-dev/sql-settings-receipts.lock"',
      `readonly RECEIPT_LEDGER_LOCK_PATH=${JSON.stringify(path.join(runtimeDirectory, "sql-settings-receipts.lock"))}`,
    )
    .replace(
      'readonly WORKER_LOCK_PATH="/var/lib/workspace-postgresql-dev/sql-settings-worker.lock"',
      `readonly WORKER_LOCK_PATH=${JSON.stringify(path.join(runtimeDirectory, "sql-settings-worker.lock"))}`,
    )
    .replace(
      '[ "$(id -u)" -eq 0 ] || fail "the SQL settings worker must run as root"',
      ': # fake contract test runs without root',
    )
    .replace(
      '[ "$(stat -c %u:%g "$worker_path")" = 0:0 ] \\\n+  && [ "$(stat -c %a "$worker_path")" = 700 ] \\\n+  || fail "the governed worker must be root:root mode 0700"',
      ': # governed worker ownership is covered by the static contract',
    )
    .replace(
      '[ "$(stat -c %u:%g "$worker_directory")" = 0:0 ] \\\n+  && [ $((8#$(stat -c %a "$worker_directory") & 8#022)) -eq 0 ] \\\n+  || fail "the governed worker directory must be root-owned and not writable by group or others"',
      ': # governed worker directory ownership is covered by the static contract',
    )
    .replace(
      '[ -S "$DOCKER_SOCKET" ] || fail "the governed Docker socket is unavailable"',
      ': # fake contract test uses a fake docker command',
    )
    .replace(
      '[ -d "$secrets_directory" ] && [ ! -L "$secrets_directory" ] \\\n+  && [ "$(stat -c %u:%g "$secrets_directory")" = 0:0 ] \\\n+  && [ "$(stat -c %a "$secrets_directory")" = 700 ] \\\n+  || fail "the governed secrets directory must be root:root mode 0700"',
      ': # fake secret directory ownership is covered by the static contract',
    )
    .replace(
      '[ -f "$request_hmac_secret_file" ] && [ ! -L "$request_hmac_secret_file" ] \\\n+  && [ "$(stat -c %u:%g "$request_hmac_secret_file")" = 0:0 ] \\\n+  && [ "$(stat -c %a "$request_hmac_secret_file")" = 600 ] \\\n+  || fail "the request-signing secret must be a root:root mode 0600 regular file"',
      ': # fake request-signing secret ownership is covered by the static contract',
    )
    .replaceAll('= 0:0 ]', `= ${process.getuid()}:${process.getgid()} ]`)
    .replace(
      '|| fail "the governed worker must be root:root mode 0700"',
      '|| : # fake ownership check',
    )
    .replace(
      '|| fail "the governed worker directory must be root-owned and not writable by group or others"',
      '|| : # fake directory ownership check',
    )
    .replace(
      '|| fail "the governed secrets directory must be root:root mode 0700"',
      '|| : # fake secrets ownership check',
    )
    .replace(
      '|| fail "the request-signing secret must be a root:root mode 0600 regular file"',
      '|| : # fake signing-secret ownership check',
    )
    .replace(
      '|| fail "the request-signing secret must be owned by the fixed application uid/gid 1000:1000 with mode 0600"',
      '|| : # fake signing-secret ownership check',
    )
    .replace(
      '|| fail "the governed development runtime root must be root:root mode 0700"',
      '|| : # fake runtime-root ownership check',
    )
    .replace(
      '|| fail "the governed Compose input $governed_compose_file must be root-owned and immutable to non-root users"',
      '|| : # fake governed Compose ownership check',
    )
    .replace(
      '|| fail "the SQL settings worker lock must be root:root mode 0600"',
      '|| : # fake worker-lock ownership check',
    )
    .replaceAll('install -d -o root -g root', 'install -d')
    .replaceAll('install -o root -g root', 'install')
    .replace('install -d -o root -g root -m 0700 "$journal_directory"', 'install -d -m 0700 "$journal_directory"')
    .replaceAll('[ "$(stat -c %u "$journal_directory")" = 0 ]', '[ "$(stat -c %u "$journal_directory")" -ge 0 ]')
    .replaceAll('[ "$(stat -c %u "$journal_path")" = 0 ]', '[ "$(stat -c %u "$journal_path")" -ge 0 ]')
    .replaceAll('chown root:root "$temporary"', 'chmod 0600 "$temporary"');
  writeFileSync(worker, renderedWorker, { mode: 0o700 });

  const fakeDocker = path.join(fakeBin, "docker.mjs");
  writeFileSync(fakeDocker, `#!/usr/bin/env node
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
const args = process.argv.slice(2);
const stdin = readFileSync(0, "utf8");
const readState = () => existsSync(process.env.FAKE_STATE_FILE)
  ? JSON.parse(readFileSync(process.env.FAKE_STATE_FILE, "utf8"))
  : { recreateCount: 0, settingApplyCount: 0 };
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
  const request = JSON.parse(process.env.FAKE_REQUEST_JSON);
  const approved = (args.find((value) => value.startsWith("approved_password_request=")) || "")
    .slice("approved_password_request=".length);
  if (request.operation !== "rotate-runtime-password" || approved === process.env.FAKE_REQUEST_KEY) {
    const encoded = Buffer.from(process.env.FAKE_REQUEST_JSON, "utf8").toString("base64");
    process.stdout.write(process.env.FAKE_REQUEST_KEY + "|" + encoded + "\\n");
  }
} else if (args[0] === "exec" && args.includes("/bin/bash")
  && new Set(["statement_timeout", "lock_timeout", "idle_in_transaction_session_timeout"]).has(args.at(-1))) {
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
} else if (args[0] === "exec" && args.includes("/bin/bash")) {
  // Application-side database connection verification succeeds in the fake harness.
} else if (args[0] === "compose") {
  const state = readState();
  state.recreateCount += 1;
  writeState(state);
} else if (args[0] === "inspect") {
  const state = readState();
  const failFirst = process.env.FAKE_FAIL_FIRST_HEALTH === "1" && state.recreateCount === 1;
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

  const signedRequest = signRequest(request);
  if (options.tamperSignature) {
    const replacement = signedRequest.requestSignature.endsWith("0") ? "1" : "0";
    signedRequest.requestSignature = `${signedRequest.requestSignature.slice(0, -1)}${replacement}`;
  }
  const env = {
    ...process.env,
    PATH: `${fakeBin}:${process.env.PATH}`,
    WORKSPACE_SQL_SETTINGS_EXECUTE: "1",
    WORKSPACE_DEV_POSTGRESQL_COMPOSE_ROOT: composeRoot,
    WORKSPACE_SQL_SETTINGS_HEALTH_ATTEMPTS: "1",
    FAKE_CAPTURE_FILE: captureFile,
    FAKE_STATE_FILE: stateFile,
    FAKE_REQUEST_KEY: "postgresqlOperationRequest:contract_1",
    FAKE_REQUEST_JSON: JSON.stringify(signedRequest),
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
      "15s": 15000,
      "30s": 30000,
      "60s": 60000,
      "120s": 120000,
      "300s": 300000,
      "900s": 900000,
    }[request.requestedValue] ?? 0)),
    WORKSPACE_SQL_SETTINGS_APPROVE_PASSWORD_REQUEST: request.operation === "rotate-runtime-password" && options.approvePassword !== false
      ? "postgresqlOperationRequest:contract_1"
      : "",
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
  const installer = read("install.sh");
  const workerInstaller = read("install-sql-settings-worker.sh");
  const backupService = read("systemd/workspace-dev-postgresql-backup.service");
  assert.match(workerSource, /WORKSPACE_SQL_SETTINGS_EXECUTE:-0/);
  assert.match(workerSource, /EXPECTED_COMPOSE_ROOT="\/home\/ubuntu\/workspace-dev\/postgresql-security"/);
  assert.match(workerSource, /DOCKER_SOCKET="\/run\/docker\.sock"/);
  assert.match(workerSource, /EXPECTED_WORKER_PATH="\/usr\/local\/lib\/workspace-postgresql-dev\/sql-settings-worker\.sh"/);
  assert.match(workerSource, /WORKSPACE_SQL_SETTINGS_APPROVE_PASSWORD_REQUEST/);
  assert.match(workerSource, /requestSignature/);
  assert.match(workerSource, /SQL_SETTINGS_RECOVERY_SCAN/);
  assert.match(workerSource, /interval '15 minutes'/);
  assert.match(workerSource, /another SQL settings worker is already active/);
  assert.match(workerSource, /sql-settings-receipts\.json/);
  assert.match(workerSource, /validate_receipt_ledger \|\| fail/);
  assert.match(workerSource, /host: "db"/);
  assert.match(workerSource, /servername: "db"/);
  assert.match(workerSource, /DATABASE_CONTAINER="workspace-dev-db"/);
  assert.match(workerSource, /REQUEST_PREFIX="postgresqlOperationRequest:"/);
  assert.match(workerSource, /FOR UPDATE SKIP LOCKED/);
  assert.match(workerSource, /WHERE \(payload ->> 'status'\) = 'pending'/);
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
  assert.match(workerSource, /governed Compose input/);
  assert.match(workerSource, /verify_app_database_connection/);
  assert.match(workerSource, /reconciliation_required/);
  assert.match(workerSource, /password-rotation\.json/);
  assert.match(workerSource, /chown root:root/);
  assert.match(workerSource, /"value"::jsonb - 'errorCode' - 'message' - 'completedAt'/);
  assert.doesNotMatch(workerSource, /- 'requestedValue'/);
  assert.doesNotMatch(workerSource, /printf[^\n]*new_password/);
  assert.match(service, /Environment=WORKSPACE_SQL_SETTINGS_EXECUTE=1/);
  assert.match(service, /WorkingDirectory=\/usr\/local\/lib\/workspace-postgresql-dev/);
  assert.match(service, /ExecStart=\/usr\/local\/lib\/workspace-postgresql-dev\/sql-settings-worker\.sh/);
  assert.match(service, /User=root/);
  assert.match(service, /ReadWritePaths=.*\/secrets .*\/var\/lib\/workspace-postgresql-dev .*\/run\/docker\.sock/);
  assert.match(timer, /OnUnitActiveSec=1min/);
  assert.match(timer, /Persistent=true/);
  assert.match(installer, /sql-settings-worker\.service/);
  assert.match(installer, /sql-settings-worker\.timer/);
  assert.match(installer, /sql-settings-worker\.sh/);
  assert.match(installer, /install-sql-settings-worker\.sh/);
  assert.match(workerInstaller, /WORKER_INSTALL_ROOT="\/usr\/local\/lib\/workspace-postgresql-dev"/);
  assert.match(workerInstaller, /chown root:root .*compose\.yaml.*\.env.*app\.env/);
  assert.match(workerInstaller, /chmod 0644 "\$runtime_root\/app\.env"/);
  assert.match(workerInstaller, /chown root:root "\$secrets_directory"/);
  assert.match(workerInstaller, /chown 1000:1000 "\$secret_path"/);
  assert.match(workerInstaller, /systemd-analyze verify/);
  assert.match(backupService, /User=root/);
  assert.match(backupService, /Group=root/);
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

test("fake worker rejects a tampered signed request before applying SQL", () => {
  const harness = createHarness(settingRequest(), { tamperSignature: true });
  try {
    const result = harness.run();
    assert.notEqual(result.status, 0);
    const records = readFileSync(harness.captureFile, "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(records.some((record) => record.stdinHasSetting), false);
    assert.match(result.stderr, /failed validation/);
  } finally {
    harness.cleanup();
  }
});

test("fake worker skips password rotation without one exact approved request key", () => {
  const harness = createHarness(passwordRequest(), { approvePassword: false });
  try {
    const result = harness.run();
    assert.equal(result.status, 0, result.stderr);
    const records = readFileSync(harness.captureFile, "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(records.some((record) => record.stdinHasNewPassword), false);
    assert.equal(records.some((record) => record.args[0] === "compose"), false);
  } finally {
    harness.cleanup();
  }
});

test("fake worker rejects a malformed receipt ledger before claiming a request", () => {
  const harness = createHarness(settingRequest(), { malformedLedger: true });
  try {
    const result = harness.run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /receipt ledger is invalid or unavailable/);
    assert.equal(existsSync(harness.captureFile), false);
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
    const journalPath = path.join(harness.temporary, "worker-runtime", "password-rotation.json");
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

test("a result-write interruption leaves a succeeded journal for result-only recovery", () => {
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
    assert.equal(records.some((record) => record.stdinHasReconciliation), false);
    assert.equal(records.some((record) => record.args[0] === "stop"), false);
    const journal = JSON.parse(readFileSync(
      path.join(harness.temporary, "worker-runtime", "password-rotation.json"),
      "utf8",
    ));
    assert.equal(journal.status, "succeeded");
    assert.equal(journal.phase, "completed");
    assert.doesNotMatch(capture + result.stdout + result.stderr, new RegExp(harness.oldPassword));
    assert.doesNotMatch(capture + result.stdout + result.stderr, new RegExp(harness.newPassword));
  } finally {
    harness.cleanup();
  }
});
