#!/usr/bin/env node

import { createHash } from "node:crypto";
import { chmod, mkdir, open, readFile, readdir, rename, stat, unlink } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

export const ATTEMPT_SCHEMA = "workspace.release-ci-attempt/v2";
export const RECURRENCE_EXIT_CODE = 42;
export const DEFAULT_LANES = Object.freeze([
  "candidate-freeze",
  "artifact-preflight",
  "database",
  "source",
  "artifact-build",
  "static-acceptance",
  "rehearsal",
  "application-ready",
]);

const FINAL_STATUSES = new Set(["passed", "failed", "blocked", "reused"]);
const PASSING_STATUSES = new Set(["passed", "reused"]);
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,159}$/;
const ERROR_CODE = /^[a-z0-9][a-z0-9._-]{0,95}$/;
const HEX_DIGEST = /^[a-f0-9]{7,128}$/;

export class AttemptContractError extends Error {
  constructor(message) {
    super(message);
    this.name = "AttemptContractError";
  }
}

export class RecurrenceError extends Error {
  constructor(recurrences) {
    super(`P1: ${recurrences.length} resolved CI blocker fingerprint(s) recurred`);
    this.name = "RecurrenceError";
    this.recurrences = recurrences;
    this.exitCode = RECURRENCE_EXIT_CODE;
  }
}

function assert(condition, message) {
  if (!condition) throw new AttemptContractError(message);
}

function assertIdentifier(value, label) {
  assert(typeof value === "string" && IDENTIFIER.test(value), `${label} must be a stable identifier`);
}

function assertDigest(value, label, { nullable = false } = {}) {
  if (nullable && value == null) return;
  assert(typeof value === "string" && HEX_DIGEST.test(value), `${label} must be a lowercase hexadecimal digest`);
}

function nowIso() {
  return new Date().toISOString();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeLaneLog(value) {
  return value
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\b(?:password|passwd|token|secret|api[_-]?key)(\s*[=:]\s*)[^\s]+/gi, (_, separator) => `credential${separator}<redacted>`)
    .replace(/\b\d{4}-\d{2}-\d{2}[T ][0-9:.+-]+Z?\b/g, "<timestamp>")
    .replace(/\b(?:pid|process)[=: ]+\d+\b/gi, "pid=<pid>")
    .replace(/\/tmp\/[A-Za-z0-9._/-]+/g, "<tmp-path>")
    .replace(/\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d{2,5}\b/g, "<host>:<port>")
    .replace(/\bport[=: ]+\d{2,5}\b/gi, "port=<port>")
    .replace(/\b[a-f0-9]{7,64}\b/gi, "<revision>")
    .replace(/\bci-\d{8}T\d{6}Z-[A-Za-z0-9-]+\b/g, "<run-id>")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function durationMs(startedAt, completedAt) {
  if (!startedAt || !completedAt) return null;
  return Math.max(0, Date.parse(completedAt) - Date.parse(startedAt));
}

function emptyLane() {
  return {
    status: "pending",
    startedAt: null,
    completedAt: null,
    durationMs: null,
    commandId: null,
    commandDigest: null,
    evidence: [],
    failure: null,
    receiptDigest: null,
  };
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function writeDraft(file, value) {
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await open(temporary, "wx", 0o600).then(async (handle) => {
    try {
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`);
      await handle.sync();
    } finally {
      await handle.close();
    }
  });
  await rename(temporary, file);
}

async function writeNewDraft(file, value) {
  await mkdir(dirname(file), { recursive: true });
  const handle = await open(file, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`);
    await handle.sync();
  } catch (error) {
    await handle.close();
    await unlink(file).catch(() => {});
    throw error;
  }
  await handle.close();
}

async function writeFinal(file, value) {
  await mkdir(dirname(file), { recursive: true });
  const handle = await open(file, "wx", 0o444);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`);
    await handle.sync();
  } catch (error) {
    await handle.close();
    await unlink(file).catch(() => {});
    throw error;
  }
  await handle.close();
  await chmod(file, 0o444);
}

function validateDraft(attempt) {
  assert(attempt?.schema === ATTEMPT_SCHEMA, "attempt receipt schema is unsupported");
  assert(attempt.finalizedAt == null, "attempt receipt is already finalized");
  assertIdentifier(attempt.runId, "run id");
  assertIdentifier(attempt.target, "target");
  assertIdentifier(attempt.targetMode, "target mode");
  assert(Array.isArray(attempt.requiredLanes) && attempt.requiredLanes.length > 0, "required lanes are missing");
  for (const lane of attempt.requiredLanes) {
    assertIdentifier(lane, "lane");
    assert(attempt.lanes?.[lane], `lane ${lane} is missing`);
  }
}

export async function beginAttempt({ draft, runId, target, targetMode, requiredLanes = DEFAULT_LANES, clock = nowIso }) {
  assertIdentifier(runId, "run id");
  assertIdentifier(target, "target");
  assertIdentifier(targetMode, "target mode");
  assert(Array.isArray(requiredLanes) && requiredLanes.length > 0, "at least one required lane is required");
  assert(new Set(requiredLanes).size === requiredLanes.length, "required lanes must be unique");
  requiredLanes.forEach((lane) => assertIdentifier(lane, "lane"));

  const startedAt = clock();
  const attempt = {
    schema: ATTEMPT_SCHEMA,
    runId,
    target,
    targetMode,
    startedAt,
    completedAt: null,
    durationMs: null,
    finalizedAt: null,
    source: { commit: null, tree: null, contentDigest: null },
    configurationDigest: null,
    requiredLanes: [...requiredLanes],
    lanes: Object.fromEntries(requiredLanes.map((lane) => [lane, emptyLane()])),
    resolutions: [],
    recurrentFingerprints: [],
    supersedesAttempts: [],
    overall: { status: "running", exitCode: null },
    receiptDigest: null,
  };
  await writeNewDraft(draft, attempt);
  return attempt;
}

export async function bindCandidate({ draft, commit, tree, contentDigest, configurationDigest }) {
  const attempt = await readJson(draft);
  validateDraft(attempt);
  assertDigest(commit, "source commit");
  assertDigest(tree, "source tree");
  assertDigest(contentDigest, "content digest");
  assertDigest(configurationDigest, "configuration digest");
  attempt.source = { commit, tree, contentDigest };
  attempt.configurationDigest = configurationDigest;
  await writeDraft(draft, attempt);
  return attempt;
}

export async function startLane({ draft, lane, commandId, clock = nowIso }) {
  const attempt = await readJson(draft);
  validateDraft(attempt);
  assert(attempt.lanes[lane], `unknown lane ${lane}`);
  assertIdentifier(commandId, "command id");
  assert(attempt.lanes[lane].status === "pending", `lane ${lane} is not pending`);
  attempt.lanes[lane] = {
    ...attempt.lanes[lane],
    status: "running",
    startedAt: clock(),
    commandId,
    commandDigest: sha256(commandId),
  };
  await writeDraft(draft, attempt);
  return attempt;
}

function safeRepositoryPath(repository, path) {
  assert(typeof path === "string" && path.length > 0 && path.length <= 512, "evidence path is invalid");
  assert(!path.includes("\0") && !path.includes("\n") && !path.includes("\r"), "evidence path contains control characters");
  const root = resolve(repository);
  const absolute = resolve(root, path);
  const rel = relative(root, absolute);
  assert(rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`), "evidence must be a file below the repository root");
  return { absolute, relative: rel.split(sep).join("/") };
}

async function digestEvidence(repository, specifications) {
  const evidence = [];
  for (const specification of specifications) {
    const separator = specification.indexOf(":");
    assert(separator > 0, "evidence must use kind:path syntax");
    const kind = specification.slice(0, separator);
    const path = specification.slice(separator + 1);
    assertIdentifier(kind, "evidence kind");
    const safe = safeRepositoryPath(repository, path);
    const fileStat = await stat(safe.absolute);
    assert(fileStat.isFile(), `evidence is not a file: ${safe.relative}`);
    evidence.push({
      kind,
      path: safe.relative,
      sha256: sha256(await readFile(safe.absolute)),
      sizeBytes: fileStat.size,
    });
  }
  return evidence.sort((left, right) => `${left.kind}:${left.path}`.localeCompare(`${right.kind}:${right.path}`));
}

function failureFingerprint({ lane, commandDigest, errorCode, exitCode, normalizedMessageDigest }) {
  return sha256([lane, commandDigest, errorCode, String(exitCode), normalizedMessageDigest].join("\0"));
}

export async function finishLane({
  draft,
  lane,
  status,
  repository,
  evidence = [],
  errorCode,
  exitCode,
  commandId,
  clock = nowIso,
}) {
  const attempt = await readJson(draft);
  validateDraft(attempt);
  const current = attempt.lanes[lane];
  assert(current, `unknown lane ${lane}`);
  assert(FINAL_STATUSES.has(status), `unsupported final lane status ${status}`);
  assert(current.status === "running" || (current.status === "pending" && status === "blocked"), `lane ${lane} cannot transition from ${current.status} to ${status}`);

  let effectiveCommandId = current.commandId;
  let effectiveCommandDigest = current.commandDigest;
  if (!effectiveCommandId) {
    assertIdentifier(commandId, "command id");
    effectiveCommandId = commandId;
    effectiveCommandDigest = sha256(commandId);
  }

  const completedAt = clock();
  let failure = null;
  if (status === "failed") {
    assert(typeof exitCode === "number" && Number.isInteger(exitCode) && exitCode !== 0, "failed lane requires a nonzero integer exit code");
    assert(typeof errorCode === "string" && ERROR_CODE.test(errorCode), "failed lane requires a stable error code");
    const laneLog = evidence.find((item) => item.startsWith("lane-log:"));
    assert(laneLog, "failed lane requires lane-log evidence");
    const logPath = laneLog.slice("lane-log:".length);
    const safeLog = safeRepositoryPath(repository, logPath);
    const normalizedMessageDigest = sha256(normalizeLaneLog(await readFile(safeLog.absolute, "utf8")));
    failure = {
      errorCode,
      exitCode,
      normalizedMessageDigest,
      fingerprint: failureFingerprint({ lane, commandDigest: effectiveCommandDigest, errorCode, exitCode, normalizedMessageDigest }),
    };
  } else {
    assert(errorCode == null && exitCode == null, `${status} lane cannot contain failure data`);
  }

  attempt.lanes[lane] = {
    status,
    startedAt: current.startedAt,
    completedAt,
    durationMs: durationMs(current.startedAt, completedAt),
    commandId: effectiveCommandId,
    commandDigest: effectiveCommandDigest,
    evidence: await digestEvidence(repository, evidence),
    failure,
    receiptDigest: null,
  };
  await writeDraft(draft, attempt);
  return attempt;
}

async function listReceiptFiles(root) {
  const files = [];
  async function walk(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && entry.name.endsWith(".json") && !entry.name.endsWith(".draft.json")) files.push(path);
    }
  }
  await walk(resolve(root));
  return files.sort();
}

async function readHistory(root) {
  const receipts = [];
  for (const file of await listReceiptFiles(root)) {
    let receipt;
    try {
      receipt = await readJson(file);
    } catch (error) {
      throw new AttemptContractError(`release attempt receipt is not valid JSON: ${file} (${error.name})`);
    }
    if (receipt?.schema !== ATTEMPT_SCHEMA) continue;
    assert(receipt.finalizedAt && receipt.receiptDigest, `release attempt receipt is incomplete: ${file}`);
    const expectedDigest = sha256(canonicalJson({ ...receipt, receiptDigest: null }));
    assert(receipt.receiptDigest === expectedDigest, `release attempt receipt digest mismatch: ${file}`);
    receipts.push(receipt);
  }
  return receipts.sort((left, right) => `${left.completedAt}:${left.runId}`.localeCompare(`${right.completedAt}:${right.runId}`));
}

function scopeKey(receipt, fingerprint) {
  return `${receipt.target}\0${receipt.targetMode}\0${fingerprint}`;
}

function collectPriorFailures(history, current) {
  const failures = new Map();
  const resolved = new Set();
  for (const receipt of history) {
    if (receipt.target !== current.target || receipt.targetMode !== current.targetMode) continue;
    for (const resolution of receipt.resolutions ?? []) resolved.add(scopeKey(receipt, resolution.fingerprint));
    for (const [lane, result] of Object.entries(receipt.lanes ?? {})) {
      if (result.status !== "failed" || !result.failure?.fingerprint) continue;
      const key = scopeKey(receipt, result.failure.fingerprint);
      failures.set(key, [...(failures.get(key) ?? []), {
        fingerprint: result.failure.fingerprint,
        failedRunId: receipt.runId,
        lane,
        commandDigest: result.commandDigest,
      }]);
    }
  }
  return { failures, resolved };
}

export async function finalizeAttempt({ draft, output, historyRoot, repository = historyRoot, exitCode, clock = nowIso }) {
  const attempt = await readJson(draft);
  validateDraft(attempt);
  assert(typeof exitCode === "number" && Number.isInteger(exitCode) && exitCode >= 0, "attempt exit code must be a nonnegative integer");
  const completedAt = clock();

  for (const [lane, result] of Object.entries(attempt.lanes)) {
    if (result.status === "running") {
      const effectiveExitCode = exitCode === 0 ? 1 : exitCode;
      const conventionalLog = resolve(dirname(output), `${attempt.runId}.${lane}.log`);
      let evidence = result.evidence;
      let normalizedMessageDigest = sha256("");
      try {
        const logStat = await stat(conventionalLog);
        if (logStat.isFile()) {
          evidence = await digestEvidence(repository, [`lane-log:${conventionalLog}`]);
          normalizedMessageDigest = sha256(normalizeLaneLog(await readFile(conventionalLog, "utf8")));
        }
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      attempt.lanes[lane] = {
        ...result,
        status: "failed",
        completedAt,
        durationMs: durationMs(result.startedAt, completedAt),
        evidence,
        failure: {
          errorCode: "unexpected-exit",
          exitCode: effectiveExitCode,
          normalizedMessageDigest,
          fingerprint: failureFingerprint({ lane, commandDigest: result.commandDigest, errorCode: "unexpected-exit", exitCode: effectiveExitCode, normalizedMessageDigest }),
        },
      };
    } else if (result.status === "pending") {
      attempt.lanes[lane] = {
        ...result,
        status: "blocked",
        completedAt,
      };
    }
  }

  for (const lane of Object.keys(attempt.lanes)) {
    const result = attempt.lanes[lane];
    attempt.lanes[lane] = {
      ...result,
      receiptDigest: sha256(canonicalJson({ ...result, receiptDigest: null })),
    };
  }

  const history = await readHistory(historyRoot);
  const { failures, resolved } = collectPriorFailures(history, attempt);
  const resolutions = [];
  for (const [lane, result] of Object.entries(attempt.lanes)) {
    if (!PASSING_STATUSES.has(result.status)) continue;
    for (const failureGroup of failures.values()) {
      const [failure] = failureGroup;
      if (failure.lane !== lane || failure.commandDigest !== result.commandDigest) continue;
      const key = scopeKey(attempt, failure.fingerprint);
      if (resolved.has(key)) continue;
      for (const failedAttempt of failureGroup) {
        resolutions.push({
          fingerprint: failedAttempt.fingerprint,
          failedRunId: failedAttempt.failedRunId,
          lane,
          fixedByRunId: attempt.runId,
          fixCommit: attempt.source.commit,
        });
      }
      resolved.add(key);
    }
  }

  const recurrentFingerprints = [];
  for (const [lane, result] of Object.entries(attempt.lanes)) {
    if (result.status !== "failed" || !result.failure?.fingerprint) continue;
    if (resolved.has(scopeKey(attempt, result.failure.fingerprint))) {
      recurrentFingerprints.push({ fingerprint: result.failure.fingerprint, lane });
    }
  }

  attempt.completedAt = completedAt;
  attempt.durationMs = durationMs(attempt.startedAt, completedAt);
  attempt.finalizedAt = completedAt;
  attempt.resolutions = resolutions.sort((a, b) => `${a.fingerprint}:${a.failedRunId}`.localeCompare(`${b.fingerprint}:${b.failedRunId}`));
  attempt.recurrentFingerprints = recurrentFingerprints.sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));
  attempt.supersedesAttempts = [...new Set(resolutions.map((item) => item.failedRunId))].sort();
  const allReady = attempt.requiredLanes.every((lane) => PASSING_STATUSES.has(attempt.lanes[lane].status));
  const effectiveExitCode = recurrentFingerprints.length > 0 ? RECURRENCE_EXIT_CODE : exitCode === 0 && !allReady ? 1 : exitCode;
  attempt.overall = { status: effectiveExitCode === 0 && allReady ? "passed" : "failed", exitCode: effectiveExitCode };
  attempt.receiptDigest = sha256(canonicalJson({ ...attempt, receiptDigest: null }));

  await writeFinal(output, attempt);
  await unlink(draft).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
  if (recurrentFingerprints.length > 0) throw new RecurrenceError(recurrentFingerprints);
  return attempt;
}

export async function patrolAttempts({ historyRoot }) {
  const history = await readHistory(historyRoot);
  const resolved = new Map();
  const recurrences = [];
  for (const receipt of history) {
    for (const resolution of receipt.resolutions ?? []) {
      resolved.set(scopeKey(receipt, resolution.fingerprint), {
        resolvedByRunId: receipt.runId,
        resolution,
      });
    }
    for (const [lane, result] of Object.entries(receipt.lanes ?? {})) {
      const fingerprint = result.failure?.fingerprint;
      if (result.status !== "failed" || !fingerprint) continue;
      const previous = resolved.get(scopeKey(receipt, fingerprint));
      if (previous && previous.resolvedByRunId !== receipt.runId) {
        recurrences.push({
          fingerprint,
          lane,
          runId: receipt.runId,
          resolvedByRunId: previous.resolvedByRunId,
        });
      }
    }
  }
  if (recurrences.length > 0) throw new RecurrenceError(recurrences);
  return { checkedAttempts: history.length, recurrences: [] };
}

function parseArgs(argv) {
  const [command, ...tokens] = argv;
  const values = new Map();
  const allowed = new Set([
    "draft", "run-id", "target", "target-mode", "required-lanes", "source-commit", "source-tree",
    "content-digest", "configuration-digest", "lane", "command-id", "status", "repository", "evidence",
    "error-code", "exit-code", "output", "history-root",
  ]);
  for (let index = 0; index < tokens.length; index += 2) {
    const flag = tokens[index];
    const value = tokens[index + 1];
    assert(flag?.startsWith("--") && value != null, `invalid argument near ${flag ?? "end of command"}`);
    const key = flag.slice(2);
    assert(allowed.has(key), `unsupported argument --${key}`);
    if (key === "evidence") values.set(key, [...(values.get(key) ?? []), value]);
    else {
      assert(!values.has(key), `argument --${key} was provided more than once`);
      values.set(key, value);
    }
  }
  return { command, values };
}

function required(values, key) {
  const value = values.get(key);
  assert(value != null, `--${key} is required`);
  return value;
}

function integer(values, key) {
  const value = Number(required(values, key));
  assert(Number.isInteger(value), `--${key} must be an integer`);
  return value;
}

async function main(argv) {
  const { command, values } = parseArgs(argv);
  if (command === "begin") {
    await beginAttempt({
      draft: required(values, "draft"),
      runId: required(values, "run-id"),
      target: required(values, "target"),
      targetMode: required(values, "target-mode"),
      requiredLanes: values.get("required-lanes")?.split(",").filter(Boolean) ?? DEFAULT_LANES,
    });
  } else if (command === "bind") {
    await bindCandidate({
      draft: required(values, "draft"),
      commit: required(values, "source-commit"),
      tree: required(values, "source-tree"),
      contentDigest: required(values, "content-digest"),
      configurationDigest: required(values, "configuration-digest"),
    });
  } else if (command === "lane-start") {
    await startLane({ draft: required(values, "draft"), lane: required(values, "lane"), commandId: required(values, "command-id") });
  } else if (command === "lane-finish") {
    await finishLane({
      draft: required(values, "draft"),
      lane: required(values, "lane"),
      status: required(values, "status"),
      repository: required(values, "repository"),
      evidence: values.get("evidence") ?? [],
      errorCode: values.get("error-code"),
      exitCode: values.has("exit-code") ? integer(values, "exit-code") : undefined,
      commandId: values.get("command-id"),
    });
  } else if (command === "finalize") {
    await finalizeAttempt({
      draft: required(values, "draft"),
      output: required(values, "output"),
      historyRoot: required(values, "history-root"),
      repository: required(values, "repository"),
      exitCode: integer(values, "exit-code"),
    });
  } else if (command === "patrol") {
    const result = await patrolAttempts({ historyRoot: required(values, "history-root") });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else {
    throw new AttemptContractError("command must be one of begin, bind, lane-start, lane-finish, finalize, patrol");
  }
}

const invokedAsProgram = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedAsProgram) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = error.exitCode ?? 2;
  });
}
