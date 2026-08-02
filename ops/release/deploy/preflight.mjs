#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, open, readFile, stat, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

export const DEPLOY_PREFLIGHT_ATTEMPT_SCHEMA = "workspace.deploy-preflight-attempt/v1";
export const DEPLOY_PREFLIGHT_READY_SCHEMA = "workspace.deploy-preflight-ready/v1";
export const SAFE_CHILD_ENVIRONMENT_KEYS = Object.freeze(["LANG", "LC_ALL", "PATH", "TMPDIR", "TZ"]);

const HEX_SHA256 = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;
const SENSITIVE_KEY = /(?:password|passwd|secret|credential|private[_-]?key|api[_-]?key|key[_-]?content|database[_-]?url|env[_-]?content)/i;
const EXTERNAL_CHECK_KEYS = ["commandId", "dependencies", "exitCode", "inputDigest", "key", "log", "status"];

export class DeployPreflightContractError extends Error {
  constructor(message) {
    super(message);
    this.name = "DeployPreflightContractError";
  }
}

function assert(condition, message) {
  if (!condition) throw new DeployPreflightContractError(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function assertIdentifier(value, label) {
  assert(typeof value === "string" && IDENTIFIER.test(value), `${label} must be a stable identifier`);
}

function assertSafeSummary(value, label, seen = new Set()) {
  if (value === null || typeof value === "boolean" || Number.isSafeInteger(value)) return;
  if (typeof value === "string") {
    assert(value.length <= 1024 && !/[\0\r\n]/.test(value), `${label} contains an unsafe string`);
    return;
  }
  assert(value && typeof value === "object" && !seen.has(value), `${label} must contain acyclic JSON-safe values`);
  seen.add(value);
  if (Array.isArray(value)) {
    assert(value.length <= 256, `${label} contains too many items`);
    value.forEach((item, index) => assertSafeSummary(item, `${label}[${index}]`, seen));
  } else {
    const keys = Object.keys(value);
    assert(Object.getPrototypeOf(value) === Object.prototype, `${label} must be a plain object`);
    assert(keys.length > 0 && keys.length <= 256, `${label} must be a non-empty bounded object`);
    for (const key of keys) {
      assert(!SENSITIVE_KEY.test(key), `${label} contains forbidden sensitive key ${key}`);
      assertSafeSummary(value[key], `${label}.${key}`, seen);
    }
  }
  seen.delete(value);
}

export function createDeployPreflightBindings({ candidate, controller, deployInput, productionSnapshot }) {
  const summaries = { candidate, controller, deployInput, productionSnapshot };
  for (const [name, summary] of Object.entries(summaries)) {
    assertSafeSummary(summary, `${name} summary`);
    assert(canonicalJson(summary).length <= 32_768, `${name} summary is too large`);
  }
  return Object.fromEntries(Object.entries(summaries).map(([name, summary]) => [name, {
    summary, digest: sha256(canonicalJson(summary)),
  }]));
}

export function verifyDeployPreflightBindings(bindings) {
  assert(bindings && typeof bindings === "object", "deploy preflight bindings are required");
  for (const name of ["candidate", "controller", "deployInput", "productionSnapshot"]) {
    const binding = bindings[name];
    assert(binding && typeof binding === "object", `${name} binding is required`);
    assertSafeSummary(binding.summary, `${name} summary`);
    assert(HEX_SHA256.test(binding.digest ?? ""), `${name} digest must be SHA-256`);
    assert(binding.digest === sha256(canonicalJson(binding.summary)), `${name} binding digest mismatch`);
  }
  return bindings;
}

async function ensurePrivateDirectory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  await chmod(path, 0o700);
}

async function writeImmutableJson(path, value) {
  await ensurePrivateDirectory(dirname(path));
  const handle = await open(path, "wx", 0o444);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`);
    await handle.sync();
  } catch (error) {
    await handle.close();
    await unlink(path).catch(() => {});
    throw error;
  }
  await handle.close();
  await chmod(path, 0o444);
}

function safeRelativePath(root, path) {
  const rel = relative(resolve(root), resolve(path));
  assert(rel && rel !== ".." && !rel.startsWith(`..${sep}`), "deploy preflight evidence escaped its root");
  return rel.split(sep).join("/");
}

function validateGraph(checks) {
  assert(Array.isArray(checks) && checks.length > 0, "at least one deploy preflight check is required");
  const keys = new Set();
  for (const check of checks) {
    assertIdentifier(check?.key, "check key");
    assert(!keys.has(check.key), `duplicate deploy preflight check ${check.key}`);
    keys.add(check.key);
    assertIdentifier(check.commandId, `check ${check.key} command id`);
    assert(HEX_SHA256.test(check.inputDigest ?? ""), `check ${check.key} input digest must be SHA-256`);
    assert(Array.isArray(check.dependencies ?? []), `check ${check.key} dependencies are invalid`);
  }
  for (const check of checks) {
    for (const dependency of check.dependencies ?? []) {
      assertIdentifier(dependency, `check ${check.key} dependency`);
      assert(keys.has(dependency) && dependency !== check.key, `check ${check.key} has invalid dependency ${dependency}`);
    }
  }
  const visiting = new Set();
  const visited = new Set();
  const byKey = new Map(checks.map((check) => [check.key, check]));
  function visit(key) {
    if (visited.has(key)) return;
    assert(!visiting.has(key), `deploy preflight check dependency cycle includes ${key}`);
    visiting.add(key);
    for (const dependency of byKey.get(key).dependencies ?? []) visit(dependency);
    visiting.delete(key);
    visited.add(key);
  }
  for (const key of keys) visit(key);
}

function validateRunnableChecks(checks) {
  validateGraph(checks);
  for (const check of checks) {
    assert(typeof check.file === "string" && check.file.length > 0, `check ${check.key} executable is required`);
    assert(Array.isArray(check.args ?? []) && (check.args ?? []).every((value) => typeof value === "string"), `check ${check.key} arguments are invalid`);
    assert(check.environment == null || (Object.getPrototypeOf(check.environment) === Object.prototype
      && Object.values(check.environment).every((value) => typeof value === "string")), `check ${check.key} environment is invalid`);
    assert(Number.isSafeInteger(check.timeoutMs ?? 60_000) && (check.timeoutMs ?? 60_000) > 0, `check ${check.key} timeout is invalid`);
  }
}

function validateExternalChecks(checks) {
  validateGraph(checks);
  const byKey = new Map(checks.map((check) => [check.key, check]));
  for (const check of checks) {
    assert(canonicalJson(Object.keys(check).sort()) === canonicalJson(EXTERNAL_CHECK_KEYS), `external check ${check.key} contains unsupported fields`);
    assert(["passed", "failed", "blocked"].includes(check.status), `external check ${check.key} status is invalid`);
    assert(typeof check.log === "string" && isAbsolute(check.log), `external check ${check.key} log must be absolute`);
    if (check.status === "passed") assert(check.exitCode === 0, `passed external check ${check.key} requires exit code 0`);
    if (check.status === "failed") assert(Number.isInteger(check.exitCode) && check.exitCode !== 0, `failed external check ${check.key} requires nonzero exit code`);
    if (check.status === "blocked") assert(check.exitCode === null, `blocked external check ${check.key} requires null exit code`);
    const failedDependencies = check.dependencies.filter((key) => byKey.get(key).status !== "passed");
    assert((check.status === "blocked") === (failedDependencies.length > 0), `external check ${check.key} dependency status is inconsistent`);
  }
}

function commandDigestForCheck(check, executor = "spawn") {
  const identity = { executor, commandId: check.commandId, inputDigest: check.inputDigest };
  if (executor === "spawn") Object.assign(identity, {
    file: basename(check.file), args: check.args ?? [], environmentKeys: Object.keys(check.environment ?? {}).sort(),
  });
  return sha256(canonicalJson(identity));
}

function childEnvironment(overrides = {}) {
  const environment = {};
  for (const key of SAFE_CHILD_ENVIRONMENT_KEYS) {
    if (typeof process.env[key] === "string") environment[key] = process.env[key];
  }
  return { ...environment, ...overrides };
}

async function inspectLog(evidenceRoot, logPath) {
  assert(isAbsolute(logPath), "deploy preflight log path must be absolute");
  const path = resolve(logPath);
  const relativePath = safeRelativePath(evidenceRoot, path);
  const metadata = await stat(path);
  assert(metadata.isFile(), `deploy preflight log is not a file: ${relativePath}`);
  assert((metadata.mode & 0o777) === 0o600, `deploy preflight log mode is not 0600: ${relativePath}`);
  return { path: relativePath, sha256: sha256(await readFile(path)), sizeBytes: metadata.size, mode: "0600" };
}

async function writeBlockedLog(path, dependencies) {
  await ensurePrivateDirectory(dirname(path));
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(`BLOCKED: prerequisite check did not pass: ${dependencies.join(", ")}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmod(path, 0o600);
}

async function executeCheck(check, logPath, evidenceRoot) {
  await ensurePrivateDirectory(dirname(logPath));
  const log = await open(logPath, "wx", 0o600);
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  let timedOut = false;
  let exitCode = null;
  let signal = null;
  let executionError = null;
  try {
    const child = spawn(check.file, check.args ?? [], {
      cwd: check.cwd, env: childEnvironment(check.environment), stdio: ["ignore", log.fd, log.fd],
    });
    const result = await new Promise((done) => {
      let settled = false;
      const settle = (value) => { if (!settled) { settled = true; done(value); } };
      child.once("error", (error) => settle({ error }));
      child.once("close", (code, childSignal) => settle({ code, signal: childSignal }));
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 1_000).unref();
      }, check.timeoutMs ?? 60_000);
      timer.unref();
      child.once("close", () => clearTimeout(timer));
      child.once("error", () => clearTimeout(timer));
    });
    exitCode = result.code ?? (result.error ? 127 : 1);
    signal = result.signal ?? null;
    if (result.error) executionError = `EXECUTION ERROR: ${result.error.name}: ${result.error.message}`;
    if (timedOut) await log.appendFile(`\nTIMEOUT after ${check.timeoutMs ?? 60_000}ms\n`);
  } finally {
    if (executionError) await log.appendFile(`\n${executionError}\n`);
    await log.sync();
    await log.close();
    await chmod(logPath, 0o600);
  }
  const completedAt = new Date().toISOString();
  return {
    key: check.key, status: exitCode === 0 && !timedOut ? "passed" : "failed",
    dependencies: [...(check.dependencies ?? [])], commandId: check.commandId, inputDigest: check.inputDigest,
    commandDigest: commandDigestForCheck(check), startedAt, completedAt,
    durationMs: Math.max(0, Date.now() - startedMs), exitCode, signal, timedOut,
    log: await inspectLog(evidenceRoot, logPath),
  };
}

async function mapLimit(items, limit, callback) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await callback(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

function finalizeReceipt(receipt) {
  return { ...receipt, receiptDigest: sha256(canonicalJson({ ...receipt, receiptDigest: null })) };
}

async function persistReceipts({ evidenceRoot, attemptId, bindings, checks, startedAt, completedAt }) {
  const exactBindings = JSON.parse(canonicalJson(bindings));
  const allPassed = checks.every((check) => check.status === "passed");
  const attempt = finalizeReceipt({
    schema: DEPLOY_PREFLIGHT_ATTEMPT_SCHEMA, attemptId, status: allPassed ? "passed" : "failed",
    startedAt, completedAt, durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)),
    bindings: exactBindings, checks,
    summary: Object.fromEntries(["passed", "failed", "blocked"].map((status) => [
      status, checks.filter((check) => check.status === status).map((check) => check.key),
    ])),
    receiptDigest: null,
  });
  const attemptFile = resolve(evidenceRoot, "attempts", `${attemptId}.json`);
  await writeImmutableJson(attemptFile, attempt);
  let ready = null;
  let readyFile = null;
  if (allPassed) {
    ready = finalizeReceipt({
      schema: DEPLOY_PREFLIGHT_READY_SCHEMA, status: "ready", attemptId, issuedAt: completedAt,
      bindings: exactBindings,
      attemptReceipt: { path: safeRelativePath(evidenceRoot, attemptFile), digest: attempt.receiptDigest },
      checkReceipts: checks.map(({ key, inputDigest, commandDigest, log }) => ({
        key, inputDigest, commandDigest, logDigest: log.sha256,
      })),
      receiptDigest: null,
    });
    readyFile = resolve(evidenceRoot, "ready", `${attemptId}.json`);
    await writeImmutableJson(readyFile, ready);
  }
  return { attempt, attemptFile, ready, readyFile };
}

function validateInvocation({ root, attemptId, bindings }) {
  assert(typeof root === "string" && isAbsolute(root), "deploy preflight evidence root must be absolute");
  assertIdentifier(attemptId, "deploy preflight attempt id");
  verifyDeployPreflightBindings(bindings);
  return JSON.parse(canonicalJson(bindings));
}

export async function runDeployPreflight({ root, attemptId, bindings, checks, concurrency = 4 }) {
  const exactBindings = validateInvocation({ root, attemptId, bindings });
  assert(Number.isSafeInteger(concurrency) && concurrency > 0 && concurrency <= 16, "deploy preflight concurrency must be between 1 and 16");
  validateRunnableChecks(checks);
  const exactChecks = checks.map((check) => ({
    ...check, args: [...(check.args ?? [])], dependencies: [...(check.dependencies ?? [])],
    environment: check.environment == null ? undefined : { ...check.environment },
  }));
  const evidenceRoot = resolve(root);
  const logsRoot = resolve(evidenceRoot, "logs", attemptId);
  await ensurePrivateDirectory(resolve(evidenceRoot, "logs"));
  await mkdir(logsRoot, { mode: 0o700 });
  await chmod(logsRoot, 0o700);
  const startedAt = new Date().toISOString();
  const results = new Map();
  const pending = new Map(exactChecks.map((check) => [check.key, check]));
  while (pending.size > 0) {
    const runnable = [...pending.values()].filter((check) => check.dependencies.every((key) => results.has(key)));
    assert(runnable.length > 0, "deploy preflight scheduler made no progress");
    const executable = [];
    for (const check of runnable) {
      const blockedBy = check.dependencies.filter((key) => results.get(key).status !== "passed");
      if (blockedBy.length === 0) executable.push(check);
      else {
        const logPath = resolve(logsRoot, `${check.key}.log`);
        await writeBlockedLog(logPath, blockedBy);
        results.set(check.key, {
          key: check.key, status: "blocked", dependencies: check.dependencies, blockedBy,
          commandId: check.commandId, inputDigest: check.inputDigest, commandDigest: commandDigestForCheck(check),
          startedAt: null, completedAt: new Date().toISOString(), durationMs: null,
          exitCode: null, signal: null, timedOut: false, log: await inspectLog(evidenceRoot, logPath),
        });
        pending.delete(check.key);
      }
    }
    for (const result of await mapLimit(executable, concurrency, (check) => (
      executeCheck(check, resolve(logsRoot, `${check.key}.log`), evidenceRoot)
    ))) {
      results.set(result.key, result);
      pending.delete(result.key);
    }
  }
  return persistReceipts({
    evidenceRoot, attemptId, bindings: exactBindings, checks: exactChecks.map((check) => results.get(check.key)),
    startedAt, completedAt: new Date().toISOString(),
  });
}

export async function recordDeployPreflightEvidence(input) {
  assert(canonicalJson(Object.keys(input ?? {}).sort()) === canonicalJson(["attemptId", "bindings", "checks", "root"]), "external deploy preflight input contains unsupported fields");
  const { root, attemptId, bindings, checks } = input;
  const exactBindings = validateInvocation({ root, attemptId, bindings });
  validateExternalChecks(checks);
  const exactChecks = JSON.parse(canonicalJson(checks));
  const evidenceRoot = resolve(root);
  const recordedAt = new Date().toISOString();
  const results = [];
  for (const check of exactChecks) {
    const blockedBy = check.dependencies.filter((key) => exactChecks.find((item) => item.key === key).status !== "passed");
    results.push({
      key: check.key, status: check.status, dependencies: [...check.dependencies], ...(blockedBy.length ? { blockedBy } : {}),
      commandId: check.commandId, inputDigest: check.inputDigest,
      commandDigest: commandDigestForCheck(check, "external-evidence"),
      startedAt: null, completedAt: recordedAt, durationMs: null, exitCode: check.exitCode,
      signal: null, timedOut: false, log: await inspectLog(evidenceRoot, check.log),
    });
  }
  return persistReceipts({
    evidenceRoot, attemptId, bindings: exactBindings, checks: results, startedAt: recordedAt, completedAt: recordedAt,
  });
}

function verifyFinalReceipt(receipt, schema) {
  assert(receipt?.schema === schema, `unsupported ${schema} receipt`);
  assert(HEX_SHA256.test(receipt.receiptDigest ?? ""), "deploy preflight receipt digest is invalid");
  assert(receipt.receiptDigest === sha256(canonicalJson({ ...receipt, receiptDigest: null })), "deploy preflight receipt digest mismatch");
  verifyDeployPreflightBindings(receipt.bindings);
  return receipt;
}

export async function verifyDeployPreflightReady({ file, attemptFile }) {
  const ready = verifyFinalReceipt(JSON.parse(await readFile(file, "utf8")), DEPLOY_PREFLIGHT_READY_SCHEMA);
  assert(ready.status === "ready", "deploy preflight Ready status is invalid");
  const evidenceRoot = dirname(dirname(resolve(file)));
  const declaredAttemptFile = resolve(evidenceRoot, ready.attemptReceipt.path);
  assert(ready.attemptReceipt.path === safeRelativePath(evidenceRoot, declaredAttemptFile), "deploy preflight attempt receipt path must be canonical and relative");
  assert(declaredAttemptFile === resolve(attemptFile), "deploy preflight attempt receipt path mismatch");
  const attempt = verifyFinalReceipt(JSON.parse(await readFile(attemptFile, "utf8")), DEPLOY_PREFLIGHT_ATTEMPT_SCHEMA);
  assert(attempt.status === "passed" && attempt.checks.every((check) => check.status === "passed"), "deploy preflight attempt did not pass");
  assert(attempt.attemptId === ready.attemptId && attempt.receiptDigest === ready.attemptReceipt.digest, "deploy preflight attempt identity mismatch");
  assert(canonicalJson(attempt.bindings) === canonicalJson(ready.bindings), "deploy preflight Ready bindings drifted");
  const expectedChecks = attempt.checks.map(({ key, inputDigest, commandDigest, log }) => {
    assert(HEX_SHA256.test(inputDigest ?? "") && HEX_SHA256.test(commandDigest ?? "") && HEX_SHA256.test(log?.sha256 ?? ""), `deploy preflight check digest is invalid for ${key}`);
    return { key, inputDigest, commandDigest, logDigest: log.sha256 };
  });
  assert(canonicalJson(ready.checkReceipts) === canonicalJson(expectedChecks), "deploy preflight Ready check receipts drifted");
  assert(((await stat(file)).mode & 0o777) === 0o444 && ((await stat(attemptFile)).mode & 0o777) === 0o444, "deploy preflight receipt mode is not immutable");
  for (const check of attempt.checks) {
    const log = await inspectLog(evidenceRoot, resolve(evidenceRoot, check.log.path));
    assert(log.sha256 === check.log.sha256, `deploy preflight log digest mismatch for ${check.key}`);
  }
  return ready;
}

async function main(argv = process.argv.slice(2)) {
  assert(argv.length === 3 && argv[0] === "record-evidence" && argv[1] === "--input", "usage: preflight.mjs record-evidence --input FILE");
  const input = JSON.parse(await readFile(resolve(argv[2]), "utf8"));
  const result = await recordDeployPreflightEvidence(input);
  process.stdout.write(`${JSON.stringify({
    attemptFile: result.attemptFile,
    readyFile: result.readyFile,
    receiptDigest: result.ready?.receiptDigest ?? result.attempt.receiptDigest,
  })}\n`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
