#!/usr/bin/env node

import { readFile, readdir, stat, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  ATTEMPT_SCHEMA, AttemptContractError, DEFAULT_LANES, ERROR_CODE, FINAL_STATUSES, PASSING_STATUSES,
  RECURRENCE_EXIT_CODE, RecurrenceError, assert, assertDigest, assertIdentifier,
  canonicalJson, digestEvidence, durationMs, emptyLane, failureFingerprint, normalizeLaneLog,
  nowIso, readJson, safeRepositoryPath, sha256, validateDraft, writeDraft, writeFinal, writeNewDraft,
} from "./ci-attempt-contract.mjs";

export {
  ATTEMPT_SCHEMA, AttemptContractError, DEFAULT_LANES, RECURRENCE_EXIT_CODE,
  RecurrenceError, normalizeLaneLog,
};

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
