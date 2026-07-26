const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawn, spawnSync } = require("node:child_process");

const {
  captureWorkspaceSnapshot,
  resolveWorkspaceSnapshot,
  workspaceSnapshotMatches,
} = require("./workspace-snapshot");

const runnerSource = path.join(__dirname, "with-check-lock.js");
const snapshotSource = path.join(__dirname, "workspace-snapshot.js");

function run(cwd, command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    ...options,
  });
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")} failed:\n${result.stderr || result.stdout}`,
  );
  return result;
}

function git(cwd, args) {
  return run(cwd, "git", args).stdout.trim();
}

function createRepository(t, { runner = false } = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-snapshot-test-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  git(cwd, ["init", "--quiet"]);
  git(cwd, ["config", "user.email", "workspace-snapshot@example.com"]);
  git(cwd, ["config", "user.name", "Workspace Snapshot Test"]);
  fs.writeFileSync(path.join(cwd, ".gitignore"), ".cache/\n.env*\n");
  fs.writeFileSync(path.join(cwd, "tracked.txt"), "base\n");
  if (runner) {
    const checkDirectory = path.join(cwd, "scripts/check");
    fs.mkdirSync(checkDirectory, { recursive: true });
    fs.copyFileSync(runnerSource, path.join(checkDirectory, "with-check-lock.js"));
    fs.copyFileSync(snapshotSource, path.join(checkDirectory, "workspace-snapshot.js"));
  }
  git(cwd, ["add", "."]);
  git(cwd, ["commit", "--quiet", "-m", "fixture"]);
  return cwd;
}

function snapshot(cwd, env = {}) {
  return captureWorkspaceSnapshot({ cwd, env, coreUiRequestPath: null });
}

function cleanCheckEnvironment(overrides = {}) {
  const env = { ...process.env };
  for (const key of [
    "CHECK_CACHE_PENDING_DIR",
    "CHECK_LOCK",
    "CHECK_RESULT_CACHE",
    "CHECK_WORKSPACE_SNAPSHOT_KEY",
  ]) {
    delete env[key];
  }
  return { ...env, ...overrides };
}

function wrapperArguments(cwd, commandArgs) {
  return [path.join(cwd, "scripts/check/with-check-lock.js"), "--", ...commandArgs];
}

function runWrapper(cwd, commandArgs, options = {}) {
  return spawnSync(process.execPath, wrapperArguments(cwd, commandArgs), {
    cwd,
    encoding: "utf8",
    env: cleanCheckEnvironment(options.env),
    timeout: options.timeout ?? 10_000,
  });
}

async function waitForFile(file, child, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(file)) return;
    if (child.exitCode !== null) throw new Error(`child exited before creating ${file}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for ${file}`);
}

async function waitForProcessExit(pid, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (error?.code === "ESRCH") return;
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for process ${pid} to exit`);
}

function waitForClose(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
}

test("snapshot keeps HEAD, index, unstaged, and untracked state separate", (t) => {
  const cwd = createRepository(t);
  const base = snapshot(cwd);

  fs.writeFileSync(path.join(cwd, "tracked.txt"), "staged\n");
  git(cwd, ["add", "tracked.txt"]);
  const staged = snapshot(cwd);
  assert.equal(staged.parts.head, base.parts.head);
  assert.notEqual(staged.parts.index, base.parts.index);
  assert.equal(staged.parts.unstaged, base.parts.unstaged);
  assert.equal(staged.parts.untracked, base.parts.untracked);

  fs.writeFileSync(path.join(cwd, "tracked.txt"), "staged plus unstaged\n");
  const unstaged = snapshot(cwd);
  assert.equal(unstaged.parts.head, staged.parts.head);
  assert.equal(unstaged.parts.index, staged.parts.index);
  assert.notEqual(unstaged.parts.unstaged, staged.parts.unstaged);
  assert.equal(unstaged.parts.untracked, staged.parts.untracked);

  fs.writeFileSync(path.join(cwd, "untracked.txt"), "untracked\n");
  const untracked = snapshot(cwd);
  assert.equal(untracked.parts.index, unstaged.parts.index);
  assert.equal(untracked.parts.unstaged, unstaged.parts.unstaged);
  assert.notEqual(untracked.parts.untracked, unstaged.parts.untracked);

  fs.mkdirSync(path.join(cwd, ".cache"));
  fs.writeFileSync(path.join(cwd, ".cache/generated.txt"), "ignored\n");
  const generated = snapshot(cwd);
  assert.equal(generated.key, untracked.key);
  const committedBefore = snapshot(cwd, { CHECK_WORKSPACE_SNAPSHOT_SCOPE: "committed" });
  fs.writeFileSync(path.join(cwd, "another-agent.txt"), "changed again\n");
  const committedAfter = snapshot(cwd, { CHECK_WORKSPACE_SNAPSHOT_SCOPE: "committed" });
  assert.equal(committedAfter.key, committedBefore.key);
});

test("pre-commit scope accepts concurrent worktree drift and reuses the passed cache", async (t) => {
  const cwd = createRepository(t, { runner: true });
  const marker = path.join(cwd, ".cache/check-started");
  fs.writeFileSync(path.join(cwd, "scripts/check/check-api-response-format.js"), [
    "const fs = require('node:fs');",
    "fs.mkdirSync('.cache', { recursive: true });",
    "fs.writeFileSync('.cache/check-started', '');",
    "setTimeout(() => {}, 400);",
    "",
  ].join("\n"));
  git(cwd, ["add", "scripts/check/check-api-response-format.js"]);
  git(cwd, ["commit", "--quiet", "-m", "add delayed check"]);

  const child = spawn(process.execPath, wrapperArguments(cwd, ["node", "scripts/check/check-api-response-format.js"]), {
    cwd,
    env: cleanCheckEnvironment({ CHECK_WORKSPACE_SNAPSHOT_SCOPE: "committed" }),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  await waitForFile(marker, child);
  fs.writeFileSync(path.join(cwd, "another-agent.txt"), "concurrent work\n");
  const result = await waitForClose(child);

  assert.equal(result.code, 0);
  assert.equal(stderr, "");
  const resultDirectory = path.join(cwd, ".cache/check-results");
  const receipts = fs.existsSync(resultDirectory)
    ? fs.readdirSync(resultDirectory).filter((file) => file.endsWith(".json"))
    : [];
  assert.equal(receipts.length, 1);
  const reused = runWrapper(cwd, ["node", "scripts/check/check-api-response-format.js"], {
    env: { CHECK_WORKSPACE_SNAPSHOT_SCOPE: "committed" },
  });
  assert.equal(reused.status, 0, reused.stderr);
  assert.match(reused.stdout, /Reusing cached gate check result/);
});

test("changed-check base/head and CI environment participate in the key", (t) => {
  const cwd = createRepository(t);
  const base = snapshot(cwd, {
    CI: "",
    WORKSPACE_DIFF_BASE: "a".repeat(40),
    WORKSPACE_DIFF_HEAD: "b".repeat(40),
  });
  const differentHead = snapshot(cwd, {
    CI: "",
    WORKSPACE_DIFF_BASE: "a".repeat(40),
    WORKSPACE_DIFF_HEAD: "c".repeat(40),
  });
  const ci = snapshot(cwd, {
    CI: "1",
    WORKSPACE_DIFF_BASE: "a".repeat(40),
    WORKSPACE_DIFF_HEAD: "b".repeat(40),
  });
  const differentPath = snapshot(cwd, {
    CI: "",
    PATH: "/different/bin",
    WORKSPACE_DIFF_BASE: "a".repeat(40),
    WORKSPACE_DIFF_HEAD: "b".repeat(40),
  });

  assert.notEqual(differentHead.parts.environment, base.parts.environment);
  assert.notEqual(differentHead.key, base.key);
  assert.notEqual(ci.parts.environment, base.parts.environment);
  assert.notEqual(ci.key, base.key);
  assert.notEqual(differentPath.key, base.key);
});

test("ignored dotenv inputs participate in the snapshot without exposing their contents", (t) => {
  const cwd = createRepository(t);
  const base = snapshot(cwd);
  fs.writeFileSync(path.join(cwd, ".env"), "DATABASE_URL=postgresql://first-secret\n");
  const first = snapshot(cwd);
  fs.writeFileSync(path.join(cwd, ".env"), "DATABASE_URL=postgresql://second-secret\n");
  const second = snapshot(cwd);

  assert.notEqual(first.key, base.key);
  assert.notEqual(second.key, first.key);
  assert.doesNotMatch(JSON.stringify(second), /second-secret/);
});

test("nested wrappers accept a validated inherited key without reading Git", (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-snapshot-inherited-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const checkDirectory = path.join(cwd, "scripts/check");
  fs.mkdirSync(checkDirectory, { recursive: true });
  fs.copyFileSync(runnerSource, path.join(checkDirectory, "with-check-lock.js"));
  fs.copyFileSync(snapshotSource, path.join(checkDirectory, "workspace-snapshot.js"));
  const inheritedKey = "d".repeat(64);

  const resolved = resolveWorkspaceSnapshot({
    cwd: path.join(cwd, "missing-git-worktree"),
    env: { CHECK_LOCK: "0", CHECK_WORKSPACE_SNAPSHOT_KEY: inheritedKey },
  });
  assert.deepEqual(resolved, { key: inheritedKey, inherited: true, parts: null });
  assert.throws(
    () => resolveWorkspaceSnapshot({
      cwd,
      env: { CHECK_LOCK: "0", CHECK_WORKSPACE_SNAPSHOT_KEY: "not-a-digest" },
    }),
    /lowercase SHA-256 digest/,
  );

  const result = runWrapper(cwd, [process.execPath, "-e", "process.stdout.write('nested-ok')"], {
    env: { CHECK_LOCK: "0", CHECK_WORKSPACE_SNAPSHOT_KEY: inheritedKey },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "nested-ok");
});

test("outer wrapper passes one workspace snapshot key to its child tree", (t) => {
  const cwd = createRepository(t, { runner: true });
  const result = runWrapper(cwd, [
    process.execPath,
    "-e",
    "process.stdout.write(JSON.stringify({ key: process.env.CHECK_WORKSPACE_SNAPSHOT_KEY, lock: process.env.CHECK_LOCK }))",
  ]);
  assert.equal(result.status, 0, result.stderr);
  const inherited = JSON.parse(result.stdout);
  assert.match(inherited.key, /^[0-9a-f]{64}$/);
  assert.equal(inherited.lock, "0");
});

test("terminal hangup terminates the child process group and releases the lock", {
  skip: process.platform === "win32",
}, async (t) => {
  const cwd = createRepository(t, { runner: true });
  const marker = path.join(cwd, ".cache/hangup-child-pid");
  fs.writeFileSync(
    path.join(cwd, "scripts/check/wait-for-hangup.js"),
    [
      "const fs = require('node:fs');",
      "process.on('SIGHUP', () => {});",
      "fs.mkdirSync('.cache', { recursive: true });",
      "fs.writeFileSync('.cache/hangup-child-pid', String(process.pid));",
      "setInterval(() => {}, 1000);",
      "",
    ].join("\n"),
  );
  git(cwd, ["add", "scripts/check/wait-for-hangup.js"]);
  git(cwd, ["commit", "--quiet", "-m", "add hangup fixture"]);

  const wrapper = spawn(
    process.execPath,
    wrapperArguments(cwd, ["node", "scripts/check/wait-for-hangup.js"]),
    {
      cwd,
      env: cleanCheckEnvironment({ CHECK_CHILD_TERMINATE_GRACE_MS: "100" }),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  await waitForFile(marker, wrapper);
  const childPid = Number(fs.readFileSync(marker, "utf8"));
  assert.equal(Number.isInteger(childPid), true);
  process.kill(wrapper.pid, "SIGHUP");
  const result = await waitForClose(wrapper);

  assert.equal(result.signal, "SIGHUP");
  await waitForProcessExit(childPid);
  assert.equal(fs.existsSync(path.join(cwd, ".cache/check.lock")), false);
});

test("a fresh lock directory without metadata cannot be stolen during lock initialization", (t) => {
  const cwd = createRepository(t, { runner: true });
  const lockDirectory = path.join(cwd, ".cache/check.lock");
  fs.mkdirSync(lockDirectory, { recursive: true });

  const result = runWrapper(cwd, [process.execPath, "-e", "process.exit(0)"], {
    env: { CHECK_LOCK_TIMEOUT_MS: "0", CHECK_LOCK_INCOMPLETE_GRACE_MS: "30000" },
  });

  assert.equal(result.status, 75);
  assert.match(result.stderr, /Another check is already running/);
  assert.equal(fs.existsSync(lockDirectory), true);
});

test("cache receipts include timing and old successful receipts remain readable", (t) => {
  const cwd = createRepository(t, { runner: true });
  fs.writeFileSync(
    path.join(cwd, "scripts/check/check-api-response-format.js"),
    "process.exit(0);\n",
  );
  git(cwd, ["add", "scripts/check/check-api-response-format.js"]);
  git(cwd, ["commit", "--quiet", "-m", "add fake check"]);

  const first = runWrapper(cwd, ["node", "scripts/check/check-api-response-format.js"]);
  assert.equal(first.status, 0, first.stderr);
  const resultDirectory = path.join(cwd, ".cache/check-results");
  const receiptFiles = fs.readdirSync(resultDirectory).filter((file) => file.endsWith(".json"));
  assert.equal(receiptFiles.length, 1);
  const receiptPath = path.join(resultDirectory, receiptFiles[0]);
  const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  assert.equal(receipt.status, "passed");
  assert.ok(Number.isFinite(receipt.durationMs));
  assert.ok(Number.isFinite(receipt.waitMs));

  delete receipt.durationMs;
  delete receipt.waitMs;
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  const reused = runWrapper(cwd, ["node", "scripts/check/check-api-response-format.js"]);
  assert.equal(reused.status, 0, reused.stderr);
  assert.match(reused.stdout, /Reusing cached gate check result/);
});

test("outer wrapper promotes nested receipts only after the shared snapshot passes", (t) => {
  const cwd = createRepository(t, { runner: true });
  fs.writeFileSync(
    path.join(cwd, "scripts/check/check-api-response-format.js"),
    "process.exit(0);\n",
  );
  git(cwd, ["add", "scripts/check/check-api-response-format.js"]);
  git(cwd, ["commit", "--quiet", "-m", "add nested fake check"]);

  const nestedCommand = [
    process.execPath,
    "scripts/check/with-check-lock.js",
    "--",
    "node",
    "scripts/check/check-api-response-format.js",
  ];
  const first = runWrapper(cwd, nestedCommand);
  assert.equal(first.status, 0, first.stderr);
  const resultDirectory = path.join(cwd, ".cache/check-results");
  assert.equal(fs.readdirSync(resultDirectory).filter((file) => file.endsWith(".json")).length, 1);

  const reused = runWrapper(cwd, nestedCommand);
  assert.equal(reused.status, 0, reused.stderr);
  assert.match(reused.stdout, /Reusing cached gate check result/);
});

test("outer wrapper promotes staged structure reports only after snapshot verification", (t) => {
  const cwd = createRepository(t, { runner: true });
  const writer = path.join(cwd, "scripts/check/write-structure-report.js");
  fs.writeFileSync(writer, [
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "const key = process.env.CHECK_WORKSPACE_SNAPSHOT_KEY;",
    "const directory = path.join(process.env.CHECK_CACHE_PENDING_DIR, 'structure-reports');",
    "fs.mkdirSync(directory, { recursive: true });",
    "fs.writeFileSync(path.join(directory, key + '.json'), JSON.stringify({ schemaVersion: 1, snapshotKey: key, report: { kind: 'structure' } }));",
    "",
  ].join("\n"));
  git(cwd, ["add", "scripts/check/write-structure-report.js"]);
  git(cwd, ["commit", "--quiet", "-m", "add structure report writer"]);

  const result = runWrapper(cwd, ["node", "scripts/check/write-structure-report.js"]);
  assert.equal(result.status, 0, result.stderr);
  const reports = fs.readdirSync(path.join(cwd, ".cache/check-results/structure-reports"));
  assert.equal(reports.length, 1);
  assert.match(reports[0], /^[0-9a-f]{64}\.json$/);
});

test("an outer wrapper rejects drift even when its nested check was a cache hit", async (t) => {
  const cwd = createRepository(t, { runner: true });
  const marker = path.join(cwd, ".cache/cached-check-finished");
  fs.writeFileSync(
    path.join(cwd, "scripts/check/check-api-response-format.js"),
    "process.exit(0);\n",
  );
  fs.writeFileSync(
    path.join(cwd, "scripts/check/cached-then-wait.js"),
    [
      "const fs = require('node:fs');",
      "const { spawnSync } = require('node:child_process');",
      "const nested = spawnSync(process.execPath, [",
      "  'scripts/check/with-check-lock.js', '--',",
      "  'node', 'scripts/check/check-api-response-format.js',",
      "], { cwd: process.cwd(), env: process.env, stdio: 'inherit' });",
      "if (nested.status !== 0) process.exit(nested.status ?? 1);",
      "fs.mkdirSync('.cache', { recursive: true });",
      "fs.writeFileSync('.cache/cached-check-finished', '');",
      "setTimeout(() => {}, 400);",
      "",
    ].join("\n"),
  );
  git(cwd, ["add", "scripts/check/check-api-response-format.js", "scripts/check/cached-then-wait.js"]);
  git(cwd, ["commit", "--quiet", "-m", "add cached wait suite"]);

  const seed = runWrapper(cwd, ["node", "scripts/check/check-api-response-format.js"]);
  assert.equal(seed.status, 0, seed.stderr);
  const child = spawn(
    process.execPath,
    wrapperArguments(cwd, ["node", "scripts/check/cached-then-wait.js"]),
    { cwd, env: cleanCheckEnvironment(), stdio: ["ignore", "pipe", "pipe"] },
  );
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  await waitForFile(marker, child);
  fs.writeFileSync(path.join(cwd, "cached-drift.txt"), "changed after cache hit\n");
  const result = await waitForClose(child);

  assert.equal(result.code, 1);
  assert.match(stderr, /Workspace snapshot changed while the check was running/);
});

test("outer wrapper preserves successful nested receipts before a later stable failure", (t) => {
  const cwd = createRepository(t, { runner: true });
  fs.writeFileSync(
    path.join(cwd, "scripts/check/check-api-response-format.js"),
    "process.exit(0);\n",
  );
  fs.writeFileSync(
    path.join(cwd, "scripts/check/failing-suite.js"),
    [
      "const { spawnSync } = require('node:child_process');",
      "const nested = spawnSync(process.execPath, [",
      "  'scripts/check/with-check-lock.js', '--',",
      "  'node', 'scripts/check/check-api-response-format.js',",
      "], { cwd: process.cwd(), env: process.env, stdio: 'inherit' });",
      "if (nested.status !== 0) process.exit(nested.status ?? 1);",
      "process.exit(9);",
      "",
    ].join("\n"),
  );
  git(cwd, ["add", "scripts/check/check-api-response-format.js", "scripts/check/failing-suite.js"]);
  git(cwd, ["commit", "--quiet", "-m", "add partially failing suite"]);

  const failed = runWrapper(cwd, ["node", "scripts/check/failing-suite.js"]);
  assert.equal(failed.status, 9, failed.stderr);
  assert.match(failed.stderr, /Preserved successful partial check results/);

  const reused = runWrapper(cwd, ["node", "scripts/check/check-api-response-format.js"]);
  assert.equal(reused.status, 0, reused.stderr);
  assert.match(reused.stdout, /Reusing cached gate check result/);
});

test("snapshot drift rejects success and discards pending cache receipts", async (t) => {
  const cwd = createRepository(t, { runner: true });
  const marker = path.join(cwd, ".cache/check-started");
  fs.writeFileSync(
    path.join(cwd, "scripts/check/check-api-response-format.js"),
    [
      "const fs = require('node:fs');",
      "fs.mkdirSync('.cache', { recursive: true });",
      "fs.writeFileSync('.cache/check-started', '');",
      "setTimeout(() => {}, 400);",
      "",
    ].join("\n"),
  );
  git(cwd, ["add", "scripts/check/check-api-response-format.js"]);
  git(cwd, ["commit", "--quiet", "-m", "add delayed check"]);

  const child = spawn(
    process.execPath,
    wrapperArguments(cwd, [
      process.execPath,
      "scripts/check/with-check-lock.js",
      "--",
      "node",
      "scripts/check/check-api-response-format.js",
    ]),
    {
      cwd,
      env: cleanCheckEnvironment(),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  await waitForFile(marker, child);
  fs.writeFileSync(path.join(cwd, "drift.txt"), "changed while checking\n");
  const result = await waitForClose(child);

  assert.equal(result.code, 1);
  assert.match(stderr, /Workspace snapshot changed while the check was running/);
  const resultDirectory = path.join(cwd, ".cache/check-results");
  const receipts = fs.existsSync(resultDirectory)
    ? fs.readdirSync(resultDirectory).filter((file) => file.endsWith(".json"))
    : [];
  assert.deepEqual(receipts, []);
  assert.equal(fs.existsSync(path.join(cwd, ".cache/check.lock")), false);
});
