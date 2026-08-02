import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  DeployPreflightContractError,
  createDeployPreflightBindings,
  recordDeployPreflightEvidence,
  runDeployPreflight,
  verifyDeployPreflightReady,
} from "./preflight.mjs";

const PREFLIGHT_CLI = fileURLToPath(new URL("./preflight.mjs", import.meta.url));

const DIGESTS = Object.freeze({
  a: "a".repeat(64),
  b: "b".repeat(64),
  c: "c".repeat(64),
  d: "d".repeat(64),
  e: "e".repeat(64),
  f: "f".repeat(64),
});

function bindings() {
  return createDeployPreflightBindings({
    candidate: {
      runId: "ci-20260802T120000Z-example",
      readyReceiptDigest: DIGESTS.a,
      source: { commitSha: "1".repeat(40), treeId: "2".repeat(40), contentDigest: DIGESTS.b },
      configurationDigest: DIGESTS.c,
      target: { id: "monolith", mode: "activate" },
      artifact: { sha256: DIGESTS.d, manifestSha256: DIGESTS.e, buildId: "next-build", deploymentId: "deploy-1" },
    },
    controller: {
      sourceSha: "3".repeat(40),
      treeId: "4".repeat(40),
      controlDigest: DIGESTS.a,
      receiptDigest: DIGESTS.b,
      deployToolBundleDigest: DIGESTS.c,
    },
    deployInput: {
      tenantManifestDigest: DIGESTS.d,
      serverIdentityDigest: DIGESTS.e,
      remoteRootDigest: DIGESTS.f,
      executionMode: "combined",
    },
    productionSnapshot: {
      observedAt: "2026-08-02T12:00:00.000Z",
      semanticDigest: DIGESTS.a,
      deployedReceiptDigest: DIGESTS.b,
      migrationInventoryDigest: DIGESTS.c,
    },
  });
}

function nodeCheck(key, body, dependencies = [], inputDigest = DIGESTS.f) {
  return {
    key,
    commandId: `deploy-preflight.${key}.v1`,
    inputDigest,
    file: process.execPath,
    args: ["-e", body],
    dependencies,
    timeoutMs: 5_000,
  };
}

async function permission(path) {
  return (await stat(path)).mode & 0o777;
}

async function writeExternalLog(root, name, content = `${name}\n`) {
  const path = join(root, "external-logs", `${name}.log`);
  await mkdir(join(root, "external-logs"), { recursive: true, mode: 0o700 });
  await writeFile(path, content, { mode: 0o600 });
  await chmod(path, 0o600);
  return path;
}

test("aggregate executes independent checks, records failures, and blocks only dependants", async (context) => {
  const temporary = await mkdtemp(join(tmpdir(), "workspace-deploy-preflight-failed-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const evidenceRoot = join(temporary, "evidence");
  const failedMarker = join(temporary, "failed-ran");
  const independentMarker = join(temporary, "independent-ran");
  const blockedMarker = join(temporary, "blocked-must-not-run");
  const checks = [
    nodeCheck("candidate", `require('node:fs').writeFileSync(${JSON.stringify(failedMarker)}, 'yes'); console.error('candidate invalid'); process.exit(9)`),
    nodeCheck("artifact", `require('node:fs').writeFileSync(${JSON.stringify(independentMarker)}, 'yes'); console.log('artifact checked')`),
    nodeCheck("production", `require('node:fs').writeFileSync(${JSON.stringify(blockedMarker)}, 'bad')`, ["candidate"]),
  ];

  const result = await runDeployPreflight({
    root: evidenceRoot,
    attemptId: "deploy-attempt-failed",
    bindings: bindings(),
    checks,
    concurrency: 2,
  });

  assert.equal(await readFile(failedMarker, "utf8"), "yes");
  assert.equal(await readFile(independentMarker, "utf8"), "yes");
  await assert.rejects(readFile(blockedMarker, "utf8"), { code: "ENOENT" });
  assert.deepEqual(result.attempt.summary, {
    passed: ["artifact"],
    failed: ["candidate"],
    blocked: ["production"],
  });
  assert.equal(result.ready, null);
  assert.equal(result.readyFile, null);
  await assert.rejects(stat(join(evidenceRoot, "ready", "deploy-attempt-failed.json")), { code: "ENOENT" });
  assert.equal(await permission(result.attemptFile), 0o444);
  for (const check of result.attempt.checks) {
    assert.equal(await permission(join(evidenceRoot, check.log.path)), 0o600);
    assert.match(check.log.sha256, /^[a-f0-9]{64}$/);
  }
});

test("all passing checks sign an immutable Ready bound to the exact attempt and summaries", async (context) => {
  const temporary = await mkdtemp(join(tmpdir(), "workspace-deploy-preflight-ready-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const evidenceRoot = join(temporary, "evidence");
  const exactBindings = bindings();
  const inheritedEnvironmentKey = "WORKSPACE_PREFLIGHT_UNSAFE_PARENT_VALUE";
  process.env[inheritedEnvironmentKey] = "must-not-inherit";
  context.after(() => delete process.env[inheritedEnvironmentKey]);
  const checks = [
    nodeCheck("candidate", "console.log('candidate ok')"),
    nodeCheck("artifact", "console.log('artifact ok')"),
    {
      ...nodeCheck(
        "production",
        `if (process.env.${inheritedEnvironmentKey}) process.exit(7); if (process.env.EXPLICIT_PREFLIGHT_VALUE !== 'bound') process.exit(8); console.log('production ok')`,
        ["candidate", "artifact"],
      ),
      environment: { EXPLICIT_PREFLIGHT_VALUE: "bound" },
    },
  ];
  const result = await runDeployPreflight({
    root: evidenceRoot,
    attemptId: "deploy-attempt-ready",
    bindings: exactBindings,
    checks,
  });

  assert.equal(result.attempt.status, "passed");
  assert.equal(result.ready.status, "ready");
  assert.equal(await permission(result.attemptFile), 0o444);
  assert.equal(await permission(result.readyFile), 0o444);
  const verified = await verifyDeployPreflightReady({ file: result.readyFile, attemptFile: result.attemptFile });
  assert.equal(verified.receiptDigest, result.ready.receiptDigest);
  assert.equal(verified.attemptReceipt.digest, result.attempt.receiptDigest);
  await assert.rejects(
    verifyDeployPreflightReady({
      file: result.readyFile,
      attemptFile: join(evidenceRoot, "attempts", "another-attempt.json"),
    }),
    /attempt receipt path mismatch/,
  );

  const tampered = JSON.parse(await readFile(result.readyFile, "utf8"));
  tampered.bindings.productionSnapshot.summary.semanticDigest = DIGESTS.f;
  const tamperedFile = join(temporary, "tampered-ready.json");
  await writeFile(tamperedFile, `${JSON.stringify(tampered)}\n`, { mode: 0o600 });
  await assert.rejects(
    verifyDeployPreflightReady({ file: tamperedFile, attemptFile: result.attemptFile }),
    DeployPreflightContractError,
  );

  await assert.rejects(
    runDeployPreflight({
      root: evidenceRoot,
      attemptId: "deploy-attempt-ready",
      bindings: exactBindings,
      checks,
    }),
    { code: "EEXIST" },
  );
});

test("binding summaries reject secret-bearing fields", () => {
  assert.throws(() => createDeployPreflightBindings({
    candidate: { runId: "ci-safe" },
    controller: { receiptDigest: DIGESTS.a },
    deployInput: { databaseUrl: "postgresql://do-not-record" },
    productionSnapshot: { semanticDigest: DIGESTS.b },
  }), /forbidden sensitive key databaseUrl/);
});

test("checks require exact input digests and bind them into command identity", async (context) => {
  const temporary = await mkdtemp(join(tmpdir(), "workspace-deploy-preflight-input-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const common = {
    commandId: "deploy-preflight.same-command.v1",
    file: process.execPath,
    args: ["-e", "console.log('same command')"],
  };
  await assert.rejects(
    runDeployPreflight({
      root: join(temporary, "invalid"),
      attemptId: "missing-input-digest",
      bindings: bindings(),
      checks: [{ ...common, key: "missing" }],
    }),
    /input digest must be SHA-256/,
  );

  const result = await runDeployPreflight({
    root: join(temporary, "valid"),
    attemptId: "bound-input-digests",
    bindings: bindings(),
    checks: [
      { ...common, key: "first", inputDigest: DIGESTS.a },
      { ...common, key: "second", inputDigest: DIGESTS.b },
    ],
  });
  assert.notEqual(result.attempt.checks[0].commandDigest, result.attempt.checks[1].commandDigest);
  assert.deepEqual(result.ready.checkReceipts.map((check) => check.inputDigest), [DIGESTS.a, DIGESTS.b]);
});

test("spawn failures append exactly one execution error to the private check log", async (context) => {
  const temporary = await mkdtemp(join(tmpdir(), "workspace-deploy-preflight-spawn-error-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const result = await runDeployPreflight({
    root: join(temporary, "evidence"),
    attemptId: "spawn-error-once",
    bindings: bindings(),
    checks: [{
      key: "missing-executable",
      commandId: "deploy-preflight.missing-executable.v1",
      inputDigest: DIGESTS.a,
      file: join(temporary, "does-not-exist"),
      args: [],
      dependencies: [],
    }],
  });
  const output = await readFile(join(temporary, "evidence", result.attempt.checks[0].log.path), "utf8");
  assert.equal(output.match(/EXECUTION ERROR:/g)?.length, 1);
});

test("external evidence is re-digested, aggregated, and never trusts caller receipt fields", async (context) => {
  const temporary = await mkdtemp(join(tmpdir(), "workspace-deploy-preflight-external-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const evidenceRoot = join(temporary, "evidence");
  const candidateLog = await writeExternalLog(evidenceRoot, "candidate", "candidate ok\n");
  const artifactLog = await writeExternalLog(evidenceRoot, "artifact", "artifact failed\n");
  const productionLog = await writeExternalLog(evidenceRoot, "production", "blocked by artifact\n");
  const checks = [
    { key: "candidate", inputDigest: DIGESTS.a, commandId: "shell.candidate.v1", status: "passed", exitCode: 0, dependencies: [], log: candidateLog },
    { key: "artifact", inputDigest: DIGESTS.b, commandId: "shell.artifact.v1", status: "failed", exitCode: 9, dependencies: [], log: artifactLog },
    { key: "production", inputDigest: DIGESTS.c, commandId: "shell.production.v1", status: "blocked", exitCode: null, dependencies: ["artifact"], log: productionLog },
  ];
  await assert.rejects(
    recordDeployPreflightEvidence({
      root: evidenceRoot,
      attemptId: "caller-digest-rejected",
      bindings: bindings(),
      checks: checks.map((check, index) => index === 0 ? { ...check, durationMs: 1, logDigest: DIGESTS.f } : check),
    }),
    /contains unsupported fields/,
  );
  await chmod(candidateLog, 0o644);
  await assert.rejects(
    recordDeployPreflightEvidence({
      root: evidenceRoot,
      attemptId: "world-readable-log-rejected",
      bindings: bindings(),
      checks,
    }),
    /log mode is not 0600/,
  );
  await chmod(candidateLog, 0o600);

  const result = await recordDeployPreflightEvidence({
    root: evidenceRoot,
    attemptId: "external-failed",
    bindings: bindings(),
    checks,
  });
  assert.deepEqual(result.attempt.summary, {
    passed: ["candidate"],
    failed: ["artifact"],
    blocked: ["production"],
  });
  assert.equal(result.readyFile, null);
  assert.equal(result.attempt.checks[0].durationMs, null);
  assert.notEqual(result.attempt.checks[0].log.sha256, DIGESTS.a, "module must compute the log digest itself");
});

test("external evidence CLI signs Ready and prints machine-readable receipt locations", async (context) => {
  const temporary = await mkdtemp(join(tmpdir(), "workspace-deploy-preflight-cli-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const evidenceRoot = join(temporary, "evidence");
  const localLog = await writeExternalLog(evidenceRoot, "local", "local checks passed\n");
  const remoteLog = await writeExternalLog(evidenceRoot, "remote", "remote checks passed\n");
  const inputFile = join(temporary, "record-input.json");
  await writeFile(inputFile, `${JSON.stringify({
    root: evidenceRoot,
    attemptId: "external-cli-ready",
    bindings: bindings(),
    checks: [
      { key: "local", inputDigest: DIGESTS.d, commandId: "shell.local.v1", status: "passed", exitCode: 0, dependencies: [], log: localLog },
      { key: "remote", inputDigest: DIGESTS.e, commandId: "shell.remote.v1", status: "passed", exitCode: 0, dependencies: ["local"], log: remoteLog },
    ],
  })}\n`, { mode: 0o600 });

  const cli = spawnSync(process.execPath, [PREFLIGHT_CLI, "record-evidence", "--input", inputFile], {
    encoding: "utf8",
  });
  assert.equal(cli.status, 0, cli.stderr);
  const output = JSON.parse(cli.stdout);
  assert.match(output.receiptDigest, /^[a-f0-9]{64}$/);
  assert.equal(output.attemptFile, join(evidenceRoot, "attempts", "external-cli-ready.json"));
  assert.equal(output.readyFile, join(evidenceRoot, "ready", "external-cli-ready.json"));
  const ready = await verifyDeployPreflightReady({ file: output.readyFile, attemptFile: output.attemptFile });
  assert.equal(output.receiptDigest, ready.receiptDigest);
});
