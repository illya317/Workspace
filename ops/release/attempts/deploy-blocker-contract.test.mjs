import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const sourceRoot = path.dirname(fileURLToPath(import.meta.url));
const supportSource = `
import { createHash } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import path from "node:path";
export function assert(value, message) { if (!value) throw new Error(message); }
export function assertDigest(value, label) { assert(typeof value === "string" && /^[a-f0-9]{64}$/.test(value), label + " must be SHA-256"); }
export function assertIdentifier(value, label) { assert(typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value), label + " is invalid"); }
function ordered(value) {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, ordered(value[key])]));
  return value;
}
export function canonicalJson(value) { return JSON.stringify(ordered(value)); }
export function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
export function normalizeLaneLog(value) { return value.trim().replace(/\\s+/g, " "); }
export function failureFingerprint(value) { return sha256(canonicalJson(value)); }
export function nowIso() { return new Date().toISOString(); }
export function safeRepositoryPath(repository, candidate) {
  const root = path.resolve(repository);
  const absolute = path.isAbsolute(candidate) ? path.resolve(candidate) : path.resolve(root, candidate);
  const relative = path.relative(root, absolute);
  assert(relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative), "path escapes repository");
  return { absolute, relative: relative.split(path.sep).join("/") };
}
export async function digestEvidence(repository, specs) {
  const evidence = [];
  for (const spec of specs) {
    const separator = spec.indexOf(":");
    const label = spec.slice(0, separator);
    const safe = safeRepositoryPath(repository, spec.slice(separator + 1));
    const body = await readFile(safe.absolute);
    evidence.push({ label, path: safe.relative, sha256: sha256(body), sizeBytes: body.length });
  }
  return evidence;
}
export async function writeFinal(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const handle = await open(file, "wx", 0o600);
  try { await handle.writeFile(JSON.stringify(value, null, 2) + "\\n"); } finally { await handle.close(); }
}
`;

function git(repository, ...args) {
  return execFileSync("git", ["-C", repository, ...args], { encoding: "utf8" }).trim();
}

async function harness(context) {
  const root = mkdtempSync(path.join(os.tmpdir(), "workspace-deploy-blocker-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const moduleRoot = path.join(root, "modules");
  const repository = path.join(root, "repository");
  const ledger = path.join(repository, ".cache", "release-deploy-attempts");
  mkdirSync(moduleRoot, { recursive: true });
  mkdirSync(repository, { recursive: true });
  copyFileSync(path.join(sourceRoot, "deploy-blocker-contract.mjs"), path.join(moduleRoot, "deploy-blocker-contract.mjs"));
  copyFileSync(path.join(sourceRoot, "patrol.mjs"), path.join(moduleRoot, "patrol.mjs"));
  writeFileSync(path.join(moduleRoot, "ci-attempt-contract.mjs"), supportSource);
  writeFileSync(path.join(moduleRoot, "ci-attempt.mjs"), "export async function patrolAttempts() { return { checked: 0 }; }\n");
  git(repository, "init", "-q");
  git(repository, "config", "user.name", "Deploy Blocker Test");
  git(repository, "config", "user.email", "deploy-blocker@example.invalid");
  writeFileSync(path.join(repository, "README.md"), "fixture\n");
  git(repository, "add", "README.md");
  git(repository, "commit", "-qm", "fixture: base");
  const contract = await import(`${pathToFileURL(path.join(moduleRoot, "deploy-blocker-contract.mjs")).href}?${Date.now()}-${Math.random()}`);
  const patrol = await import(`${pathToFileURL(path.join(moduleRoot, "patrol.mjs")).href}?${Date.now()}-${Math.random()}`);
  return { root, moduleRoot, repository, ledger, contract, patrol };
}

function identity(repository, contentDigest = "a".repeat(64)) {
  const commit = git(repository, "rev-parse", "HEAD");
  return {
    source: { commit, tree: git(repository, "rev-parse", "HEAD^{tree}"), contentDigest },
    controller: { commit, tree: git(repository, "rev-parse", "HEAD^{tree}"), digest: "c".repeat(64) },
  };
}

async function failedAttempt(h, options) {
  const attemptId = options.attemptId;
  const log = path.join(h.repository, ".cache", "logs", `${options.logId ?? attemptId}.log`);
  mkdirSync(path.dirname(log), { recursive: true });
  writeFileSync(log, `${options.message}\n`);
  const current = identity(h.repository, options.contentDigest);
  return h.contract.recordDeployAttempt({
    root: h.ledger,
    repository: h.repository,
    attemptId,
    target: "monolith",
    targetMode: "activate",
    ...current,
    commandId: "deploy-production-v1",
    startedAt: options.startedAt ?? "2026-08-01T00:00:00.000Z",
    completedAt: options.completedAt ?? "2026-08-01T00:01:00.000Z",
    status: "failed",
    exitCode: 1,
    log,
  });
}

test("attempts are immutable and every failure requires classification", async (context) => {
  const h = await harness(context);
  const receipt = await failedAttempt(h, { attemptId: "attempt-one", logId: "first", message: "candidate failure", contentDigest: "a".repeat(64) });
  assert.equal(receipt.source.tree.length, 40, "Git tree ids must remain 40-character object ids");
  const receiptFile = path.join(h.ledger, "attempts", "attempt-one.json");
  const immutable = readFileSync(receiptFile, "utf8");
  await assert.rejects(
    failedAttempt(h, { attemptId: "attempt-one", logId: "collision", message: "different", contentDigest: "a".repeat(64) }),
    /exist/i,
  );
  assert.equal(readFileSync(receiptFile, "utf8"), immutable);

  const current = identity(h.repository, "a".repeat(64));
  await assert.rejects(
    h.contract.assertDeployRetry({ root: h.ledger, repository: h.repository, target: "monolith", targetMode: "activate", sourceContentDigest: current.source.contentDigest, sourceCommit: current.source.commit, controllerCommit: current.controller.commit }),
    (error) => error.exitCode === 43 && error.blockers[0].reason === "unclassified",
  );
});

test("candidate-specific blockers bind content rather than commit identity", async (context) => {
  const h = await harness(context);
  const attempt = await failedAttempt(h, { attemptId: "candidate-one", message: "candidate failure", contentDigest: "a".repeat(64) });
  await h.contract.classifyDeployBlocker({
    root: h.ledger,
    fingerprint: attempt.failure.fingerprint,
    classification: "candidate-specific",
    reasonCode: "candidate-input",
    decisionId: "decision-one",
    clock: () => "2026-08-01T00:02:00.000Z",
  });
  git(h.repository, "commit", "--allow-empty", "-qm", "fixture: same content new commit");
  const sameContent = identity(h.repository, "a".repeat(64));
  await assert.rejects(
    h.contract.assertDeployRetry({ root: h.ledger, repository: h.repository, target: "monolith", targetMode: "activate", sourceContentDigest: sameContent.source.contentDigest, sourceCommit: sameContent.source.commit, controllerCommit: sameContent.controller.commit }),
    (error) => error.exitCode === 43 && error.blockers[0].reason === "same-candidate-retry",
  );
  const changedContent = identity(h.repository, "b".repeat(64));
  assert.equal((await h.contract.assertDeployRetry({ root: h.ledger, repository: h.repository, target: "monolith", targetMode: "activate", sourceContentDigest: changedContent.source.contentDigest, sourceCommit: changedContent.source.commit, controllerCommit: changedContent.controller.commit })).checked, 1);
});

test("systemic resolution requires a fixing commit, tracked fixture, and gate receipt; recurrence is P1", async (context) => {
  const h = await harness(context);
  const attempt = await failedAttempt(h, { attemptId: "systemic-one", message: "systemic failure", contentDigest: "d".repeat(64) });
  await h.contract.classifyDeployBlocker({
    root: h.ledger,
    fingerprint: attempt.failure.fingerprint,
    classification: "systemic",
    reasonCode: "deploy-tool-defect",
    decisionId: "decision-systemic",
    clock: () => "2026-08-01T00:02:00.000Z",
  });
  const fixture = "ops/release/attempts/systemic.fixture";
  mkdirSync(path.dirname(path.join(h.repository, fixture)), { recursive: true });
  writeFileSync(path.join(h.repository, fixture), "fixture\n");
  const gateReceipt = path.join(h.repository, ".cache", "gates", "application-ready.json");
  mkdirSync(path.dirname(gateReceipt), { recursive: true });
  writeFileSync(gateReceipt, "{\"status\":\"passed\"}\n");
  const baseCommit = git(h.repository, "rev-parse", "HEAD");
  await assert.rejects(
    h.contract.resolveSystemicDeployBlocker({ root: h.ledger, repository: h.repository, fingerprint: attempt.failure.fingerprint, resolutionId: "resolution-untracked", fixingCommit: baseCommit, gate: "application-ready", fixturePath: fixture, gateReceipt }),
    /tracked file/,
  );
  git(h.repository, "add", fixture);
  git(h.repository, "commit", "-qm", "fix: systemic blocker");
  const fixingCommit = git(h.repository, "rev-parse", "HEAD");
  await assert.rejects(
    h.contract.resolveSystemicDeployBlocker({ root: h.ledger, repository: h.repository, fingerprint: attempt.failure.fingerprint, resolutionId: "resolution-no-gate", fixingCommit, gate: "application-ready", fixturePath: fixture, gateReceipt: `${gateReceipt}.missing` }),
    /missing|ENOENT|no such file/i,
  );
  await assert.rejects(
    h.contract.resolveSystemicDeployBlocker({ root: h.ledger, repository: h.repository, fingerprint: attempt.failure.fingerprint, resolutionId: "resolution-fake-gate", fixingCommit, gate: "application-ready", fixturePath: fixture, gateReceipt }),
    /gate receipt contract is invalid/,
  );
  writeFileSync(gateReceipt, `${JSON.stringify({
    schemaVersion: 1,
    kind: "workspace-ready-artifact",
    status: "ready",
    command: "ops/publish.sh ci",
    source: { commitSha: fixingCommit },
  })}\n`);
  const resolution = await h.contract.resolveSystemicDeployBlocker({
    root: h.ledger,
    repository: h.repository,
    fingerprint: attempt.failure.fingerprint,
    resolutionId: "resolution-valid",
    fixingCommit,
    gate: "application-ready",
    fixturePath: fixture,
    gateReceipt,
    clock: () => "2026-08-01T00:10:00.000Z",
  });
  assert.equal(resolution.fixture, fixture);
  assert.equal(resolution.gateEvidence.label, "application-ready-receipt");
  const current = identity(h.repository, "d".repeat(64));
  assert.equal((await h.contract.assertDeployRetry({ root: h.ledger, repository: h.repository, target: "monolith", targetMode: "activate", sourceContentDigest: current.source.contentDigest, sourceCommit: current.source.commit, controllerCommit: current.controller.commit })).checked, 1);

  await failedAttempt(h, { attemptId: "systemic-recurrence", message: "systemic failure", contentDigest: "d".repeat(64), startedAt: "2026-08-01T00:19:00.000Z", completedAt: "2026-08-01T00:20:00.000Z" });
  await assert.rejects(
    h.contract.assertDeployRetry({ root: h.ledger, repository: h.repository, target: "monolith", targetMode: "activate", sourceContentDigest: current.source.contentDigest, sourceCommit: current.source.commit, controllerCommit: current.controller.commit }),
    (error) => error.exitCode === 42 && error.blockers[0].reason === "resolved-systemic-blocker-recurred",
  );
});

test("patrol always audits both CI and deploy and preserves P1 priority", async (context) => {
  const h = await harness(context);
  const calls = [];
  await assert.rejects(
    h.patrol.main(["--ci-root", "ci", "--deploy-root", "deploy"], {
      silent: true,
      patrolAttempts: async () => { calls.push("ci"); const error = new Error("CI blocker"); error.exitCode = 43; throw error; },
      patrolDeployBlockers: async () => { calls.push("deploy"); const error = new Error("deploy recurrence"); error.exitCode = 42; throw error; },
    }),
    (error) => error.exitCode === 42 && error.failures.length === 2,
  );
  assert.deepEqual(calls, ["ci", "deploy"]);
  const result = await h.patrol.main(["--ci-root", "ci", "--deploy-root", "deploy"], {
    silent: true,
    patrolAttempts: async () => ({ checked: 1 }),
    patrolDeployBlockers: async () => ({ checked: 2 }),
  });
  assert.deepEqual(result, { ci: { checked: 1 }, deploy: { checked: 2 } });
});

test("shell attempt wrapper seals logs and restores the caller errexit state", () => {
  const source = readFileSync(path.join(sourceRoot, "deploy-attempt-shell.sh"), "utf8");
  assert.match(source, /set -o noclobber/);
  assert.match(source, /wait "\$tee_pid"/);
  assert.match(source, /had_errexit/);
  assert.match(source, /chmod 400 "\$log_file"/);
  assert.match(source, /failed to persist immutable deploy attempt/);
});
