#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const EVENT_KIND = "workspace.release-stage-timing";
const STATE_KIND = "workspace.release-stage-timing-state";
const EVENT_KEYS = [
  "durationMs",
  "exitCode",
  "finishedAt",
  "kind",
  "releaseId",
  "schemaVersion",
  "scope",
  "stage",
  "startedAt",
  "status",
];
const STATE_KEYS = [
  "kind",
  "releaseId",
  "schemaVersion",
  "scope",
  "stage",
  "startedAt",
  "startedAtEpochMs",
  "startedMonotonicNs",
];
const RELEASE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SEGMENTED_NAME_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const MONOTONIC_PATTERN = /^(?:0|[1-9][0-9]*)$/;
const STATUSES = new Set(["passed", "failed", "cancelled"]);
const DEFAULT_MAX_FUTURE_SKEW_MS = 60_000;

function requirePlainObject(value, location) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${location} must be an object`);
  }
  return value;
}

function requireExactKeys(value, expected, location) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${location} has unsupported or missing fields`);
  }
}

function requireReleaseId(value) {
  if (typeof value !== "string" || !RELEASE_ID_PATTERN.test(value)) {
    throw new Error("releaseId must be a safe 1-128 character identifier");
  }
  return value;
}

function requireSegmentedName(value, location) {
  if (typeof value !== "string" || value.length > 64 || !SEGMENTED_NAME_PATTERN.test(value)) {
    throw new Error(`${location} must be a lowercase segmented identifier`);
  }
  return value;
}

function requireStatus(value) {
  if (!STATUSES.has(value)) throw new Error("status must be passed, failed, or cancelled");
  return value;
}

function requireExitCode(value, status) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 255) {
    throw new Error("exitCode must be an integer from 0 to 255");
  }
  if (status === "passed" && value !== 0) throw new Error("passed status requires exitCode 0");
  if (status === "failed" && value === 0) throw new Error("failed status requires a non-zero exitCode");
  if (status === "cancelled" && (value < 129 || value > 192)) {
    throw new Error("cancelled status requires a signal-derived exitCode from 129 to 192");
  }
  return value;
}

function requireCanonicalTimestamp(value, location) {
  if (typeof value !== "string") throw new Error(`${location} must be an ISO timestamp`);
  const epochMs = Date.parse(value);
  if (!Number.isFinite(epochMs) || new Date(epochMs).toISOString() !== value) {
    throw new Error(`${location} must be a canonical ISO timestamp`);
  }
  return epochMs;
}

function requireEpochMs(value, location) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${location} must be a non-negative epoch millisecond`);
  return value;
}

function requireMonotonicNs(value, location) {
  if (typeof value !== "string" || !MONOTONIC_PATTERN.test(value)) {
    throw new Error(`${location} must be a non-negative monotonic nanosecond string`);
  }
  return BigInt(value);
}

function requireDurationMs(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("durationMs must be a non-negative integer");
  }
  return value;
}

export function validateTimingEvent(event, {
  nowEpochMs = Date.now(),
  maxFutureSkewMs = DEFAULT_MAX_FUTURE_SKEW_MS,
} = {}) {
  requirePlainObject(event, "timing event");
  requireExactKeys(event, EVENT_KEYS, "timing event");
  if (event.schemaVersion !== 1 || event.kind !== EVENT_KIND) {
    throw new Error("timing event schema contract is invalid");
  }
  requireReleaseId(event.releaseId);
  requireSegmentedName(event.scope, "scope");
  requireSegmentedName(event.stage, "stage");
  const status = requireStatus(event.status);
  const startedAtEpochMs = requireCanonicalTimestamp(event.startedAt, "startedAt");
  const finishedAtEpochMs = requireCanonicalTimestamp(event.finishedAt, "finishedAt");
  requireDurationMs(event.durationMs);
  requireExitCode(event.exitCode, status);
  requireEpochMs(nowEpochMs, "nowEpochMs");
  if (!Number.isFinite(maxFutureSkewMs) || maxFutureSkewMs < 0) {
    throw new Error("maxFutureSkewMs must be non-negative");
  }
  if (finishedAtEpochMs < startedAtEpochMs) {
    throw new Error("finishedAt must not precede startedAt");
  }
  if (startedAtEpochMs > nowEpochMs + maxFutureSkewMs || finishedAtEpochMs > nowEpochMs + maxFutureSkewMs) {
    throw new Error("timing event timestamp is in the future");
  }
  return event;
}

export function createTimingState({
  releaseId,
  scope,
  stage,
  nowEpochMs = Date.now(),
  monotonicNs = process.hrtime.bigint(),
} = {}) {
  requireReleaseId(releaseId);
  requireSegmentedName(scope, "scope");
  requireSegmentedName(stage, "stage");
  requireEpochMs(nowEpochMs, "nowEpochMs");
  const monotonic = typeof monotonicNs === "bigint"
    ? monotonicNs
    : requireMonotonicNs(monotonicNs, "monotonicNs");
  if (monotonic < 0n) throw new Error("monotonicNs must not be negative");
  return {
    schemaVersion: 1,
    kind: STATE_KIND,
    releaseId,
    scope,
    stage,
    startedAt: new Date(nowEpochMs).toISOString(),
    startedAtEpochMs: nowEpochMs,
    startedMonotonicNs: monotonic.toString(),
  };
}

export function validateTimingState(state) {
  requirePlainObject(state, "timing state");
  requireExactKeys(state, STATE_KEYS, "timing state");
  if (state.schemaVersion !== 1 || state.kind !== STATE_KIND) {
    throw new Error("timing state schema contract is invalid");
  }
  requireReleaseId(state.releaseId);
  requireSegmentedName(state.scope, "scope");
  requireSegmentedName(state.stage, "stage");
  const startedAtEpochMs = requireCanonicalTimestamp(state.startedAt, "startedAt");
  if (requireEpochMs(state.startedAtEpochMs, "startedAtEpochMs") !== startedAtEpochMs) {
    throw new Error("timing state wall-clock values are inconsistent");
  }
  requireMonotonicNs(state.startedMonotonicNs, "startedMonotonicNs");
  return state;
}

export function completeTimingState(state, {
  status,
  exitCode,
  nowEpochMs = Date.now(),
  monotonicNs = process.hrtime.bigint(),
} = {}) {
  validateTimingState(state);
  requireEpochMs(nowEpochMs, "nowEpochMs");
  const finishedMonotonicNs = typeof monotonicNs === "bigint"
    ? monotonicNs
    : requireMonotonicNs(monotonicNs, "monotonicNs");
  const startedMonotonicNs = BigInt(state.startedMonotonicNs);
  if (finishedMonotonicNs < startedMonotonicNs) {
    throw new Error("monotonic clock produced a negative duration");
  }
  const durationNs = finishedMonotonicNs - startedMonotonicNs;
  const durationMsBigInt = durationNs / 1_000_000n;
  if (durationMsBigInt > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("monotonic duration exceeds the supported range");
  }
  const event = {
    schemaVersion: 1,
    kind: EVENT_KIND,
    releaseId: state.releaseId,
    scope: state.scope,
    stage: state.stage,
    status: requireStatus(status),
    startedAt: state.startedAt,
    finishedAt: new Date(nowEpochMs).toISOString(),
    durationMs: Number(durationMsBigInt),
    exitCode,
  };
  return validateTimingEvent(event, { nowEpochMs });
}

export function parseTimingNdjson(text, options) {
  if (typeof text !== "string" || text.length === 0) throw new Error("timing log is empty");
  const lines = text.endsWith("\n") ? text.slice(0, -1).split("\n") : text.split("\n");
  if (lines.length === 0 || lines.some((line) => line.length === 0)) {
    throw new Error("timing log must contain one JSON object per non-empty line");
  }
  return lines.map((line, index) => {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      throw new Error(`timing log line ${index + 1} is not valid JSON`);
    }
    try {
      return validateTimingEvent(event, options);
    } catch (error) {
      throw new Error(`timing log line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

export function validateTimingSeries(events, {
  releaseId,
  scope,
  requiredStages,
} = {}) {
  if (!Array.isArray(events) || events.length === 0) {
    throw new Error("timing series requires at least one event");
  }
  const validated = events.map((event) => validateTimingEvent(event));
  if (releaseId !== undefined) {
    const expectedReleaseId = requireReleaseId(releaseId);
    if (validated.some((event) => event.releaseId !== expectedReleaseId)) {
      throw new Error(`timing series must belong to releaseId ${expectedReleaseId}`);
    }
  }
  if (scope !== undefined) {
    const expectedScope = requireSegmentedName(scope, "scope");
    if (validated.some((event) => event.scope !== expectedScope)) {
      throw new Error(`timing series must belong to scope ${expectedScope}`);
    }
  }
  if (requiredStages !== undefined) {
    if (!Array.isArray(requiredStages) || requiredStages.length === 0) {
      throw new Error("requiredStages must be a non-empty array");
    }
    const expectedStages = requiredStages.map((stage) => requireSegmentedName(stage, "requiredStages item"));
    if (new Set(expectedStages).size !== expectedStages.length) {
      throw new Error("requiredStages must not contain duplicates");
    }
    const actualStages = validated.map((event) => event.stage);
    if (JSON.stringify(actualStages) !== JSON.stringify(expectedStages)) {
      throw new Error(`timing series stages must be exactly: ${expectedStages.join(",")}`);
    }
  }
  return validated;
}

export function summarizeTimingEvents(events, { releaseId } = {}) {
  if (!Array.isArray(events) || events.length === 0) throw new Error("summary requires at least one timing event");
  const validated = events.map((event) => validateTimingEvent(event));
  const releaseIds = [...new Set(validated.map((event) => event.releaseId))].sort();
  const selectedReleaseId = releaseId === undefined
    ? releaseIds.length === 1 ? releaseIds[0] : null
    : requireReleaseId(releaseId);
  if (!selectedReleaseId) throw new Error("summary requires --release-id when the log contains multiple releases");
  const selected = validated.filter((event) => event.releaseId === selectedReleaseId);
  if (selected.length === 0) throw new Error(`timing log has no events for releaseId ${selectedReleaseId}`);
  const statusCounts = { passed: 0, failed: 0, cancelled: 0 };
  const scopes = new Map();
  let totalDurationMs = 0;
  for (const event of selected) {
    statusCounts[event.status] += 1;
    totalDurationMs += event.durationMs;
    if (!Number.isSafeInteger(totalDurationMs)) throw new Error("summary duration exceeds the supported range");
    const scope = scopes.get(event.scope) ?? {
      scope: event.scope,
      eventCount: 0,
      totalDurationMs: 0,
      statusCounts: { passed: 0, failed: 0, cancelled: 0 },
    };
    scope.eventCount += 1;
    scope.totalDurationMs += event.durationMs;
    scope.statusCounts[event.status] += 1;
    scopes.set(event.scope, scope);
  }
  return {
    schemaVersion: 1,
    kind: "workspace.release-timing-summary",
    releaseId: selectedReleaseId,
    eventCount: selected.length,
    totalDurationMs,
    statusCounts,
    scopes: [...scopes.values()].sort((left, right) => left.scope.localeCompare(right.scope)),
    stages: selected.map(({ scope, stage, status, durationMs, exitCode }) => ({
      scope,
      stage,
      status,
      durationMs,
      exitCode,
    })),
  };
}

function parseArguments(argv) {
  const [command, ...rest] = argv;
  const options = { command };
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index];
    if (!key?.startsWith("--")) throw new Error(`unknown argument: ${key ?? "<empty>"}`);
    const value = rest[++index];
    if (value === undefined || value.startsWith("--")) throw new Error(`missing value for ${key}`);
    const name = key.slice(2).replaceAll("-", "_");
    if (Object.hasOwn(options, name)) throw new Error(`duplicate argument: ${key}`);
    options[name] = value;
  }
  return options;
}

function requireOption(options, name) {
  if (!options[name]) throw new Error(`${options.command} requires --${name.replaceAll("_", "-")}`);
  return options[name];
}

function requireOnlyOptions(options, allowed) {
  const unsupported = Object.keys(options).filter((name) => name !== "command" && !allowed.includes(name));
  if (unsupported.length > 0) {
    throw new Error(`${options.command} does not support --${unsupported[0].replaceAll("_", "-")}`);
  }
}

function writePrivateJson(file, value) {
  fs.writeFileSync(path.resolve(file), `${JSON.stringify(value)}\n`, { mode: 0o600 });
}

function appendPrivateNdjson(file, event) {
  const target = path.resolve(file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const descriptor = fs.openSync(target, "a", 0o600);
  try {
    fs.writeSync(descriptor, `${JSON.stringify(event)}\n`);
  } finally {
    fs.closeSync(descriptor);
  }
}

function readTimingFile(file) {
  return parseTimingNdjson(fs.readFileSync(path.resolve(file), "utf8"));
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.command === "begin") {
    requireOnlyOptions(options, ["state", "release_id", "scope", "stage"]);
    const state = createTimingState({
      releaseId: requireOption(options, "release_id"),
      scope: requireOption(options, "scope"),
      stage: requireOption(options, "stage"),
    });
    writePrivateJson(requireOption(options, "state"), state);
    return;
  }
  if (options.command === "finish") {
    requireOnlyOptions(options, ["state", "output", "status", "exit_code"]);
    const stateFile = requireOption(options, "state");
    const state = JSON.parse(fs.readFileSync(path.resolve(stateFile), "utf8"));
    const event = completeTimingState(state, {
      status: requireOption(options, "status"),
      exitCode: Number(requireOption(options, "exit_code")),
    });
    appendPrivateNdjson(requireOption(options, "output"), event);
    process.stdout.write(`${JSON.stringify(event)}\n`);
    return;
  }
  if (options.command === "validate") {
    requireOnlyOptions(options, ["input", "release_id", "scope", "required_stages"]);
    const events = readTimingFile(requireOption(options, "input"));
    const requiredStages = options.required_stages?.split(",");
    validateTimingSeries(events, {
      releaseId: options.release_id,
      scope: options.scope,
      requiredStages,
    });
    const releaseIds = [...new Set(events.map((event) => event.releaseId))].sort();
    process.stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      kind: "workspace.release-timing-validation",
      valid: true,
      eventCount: events.length,
      releaseIds,
    })}\n`);
    return;
  }
  if (options.command === "summary") {
    requireOnlyOptions(options, ["input", "release_id"]);
    const events = readTimingFile(requireOption(options, "input"));
    const summary = summarizeTimingEvents(events, { releaseId: options.release_id });
    process.stdout.write(`${JSON.stringify(summary)}\n`);
    return;
  }
  throw new Error("usage: release-timing.mjs begin|finish|validate|summary [options]");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
