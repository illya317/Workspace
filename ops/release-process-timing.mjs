#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const SCHEMA_VERSION = 2;
const KIND = "workspace.release-process-timing";
const SHA_PATTERN = /^[0-9a-f]{40}$/;

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    if (!key?.startsWith("--") || value === undefined) fail(`invalid argument: ${key ?? ""}`);
    options[key.slice(2)] = value;
  }
  return { command, options };
}

function requireAbsoluteFile(value) {
  if (!value || !path.isAbsolute(value)) fail("--file must be an absolute path");
  return value;
}

function requireEpoch(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) fail(`${label} must be a positive epoch second`);
  return parsed;
}

function requireNonNegativeInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) fail(`${label} must be a non-negative integer`);
  return parsed;
}

function nowEpoch(options) {
  return options.now === undefined ? Math.floor(Date.now() / 1000) : requireEpoch(options.now, "--now");
}

function atomicWrite(file, value) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, file);
}

function validateState(state) {
  const keys = Object.keys(state).sort().join(",");
  const expected = "accumulatedOpsSeconds,attemptCount,excludedSeconds,kind,lastSourceSha,lastTransitionAtEpochSeconds,phase,schemaVersion,sourceShas,startedAt,startedAtEpochSeconds";
  if (!state || typeof state !== "object" || Array.isArray(state) || keys !== expected) fail("release timing state shape is invalid");
  if (state.schemaVersion !== SCHEMA_VERSION || state.kind !== KIND) fail("release timing state contract is invalid");
  requireEpoch(state.startedAtEpochSeconds, "startedAtEpochSeconds");
  requireEpoch(state.lastTransitionAtEpochSeconds, "lastTransitionAtEpochSeconds");
  if (state.lastTransitionAtEpochSeconds < state.startedAtEpochSeconds) fail("last timing transition precedes session start");
  if (typeof state.startedAt !== "string" || Number.isNaN(Date.parse(state.startedAt))) fail("startedAt is invalid");
  if (state.phase !== "ops" && state.phase !== "main") fail("release timing phase is invalid");
  requireNonNegativeInteger(state.accumulatedOpsSeconds, "accumulatedOpsSeconds");
  requireNonNegativeInteger(state.excludedSeconds, "excludedSeconds");
  if (!Number.isSafeInteger(state.attemptCount) || state.attemptCount < 1) fail("attemptCount is invalid");
  if (!SHA_PATTERN.test(state.lastSourceSha)) fail("lastSourceSha is invalid");
  if (!Array.isArray(state.sourceShas) || state.sourceShas.length === 0 || state.sourceShas.some((sha) => !SHA_PATTERN.test(sha))) {
    fail("sourceShas is invalid");
  }
  return state;
}

function loadState(file) {
  if (!existsSync(file)) return null;
  return validateState(JSON.parse(readFileSync(file, "utf8")));
}

function newState(sourceSha, now) {
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: KIND,
    startedAtEpochSeconds: now,
    startedAt: new Date(now * 1000).toISOString(),
    lastTransitionAtEpochSeconds: now,
    phase: "ops",
    accumulatedOpsSeconds: 0,
    excludedSeconds: 0,
    attemptCount: 1,
    lastSourceSha: sourceSha,
    sourceShas: [sourceSha],
  };
}

function begin(file, options) {
  const repositoryRoot = options["repository-root"];
  const sourceSha = options["source-sha"];
  if (!repositoryRoot || !path.isAbsolute(repositoryRoot)) fail("--repository-root must be absolute");
  if (!SHA_PATTERN.test(sourceSha ?? "")) fail("--source-sha must be a 40-character commit SHA");
  const now = nowEpoch(options);
  const current = loadState(file);
  let state;
  if (!current) {
    state = newState(sourceSha, now);
  } else {
    state = {
      ...current,
      attemptCount: current.attemptCount + 1,
      lastSourceSha: sourceSha,
      sourceShas: current.sourceShas.includes(sourceSha) ? current.sourceShas : [...current.sourceShas, sourceSha],
    };
  }
  atomicWrite(file, state);
  return { ...snapshotValue(state, now), resetReason: current ? null : "new-release-session" };
}

function snapshotValue(state, now) {
  const activeSeconds = state.phase === "ops" ? now - state.lastTransitionAtEpochSeconds : 0;
  const releaseProcessSeconds = state.accumulatedOpsSeconds + activeSeconds - state.excludedSeconds;
  if (releaseProcessSeconds < 0) fail("excluded time exceeds release session wall clock");
  return {
    releaseProcessSeconds,
    releaseAttemptCount: state.attemptCount,
    releaseProcessStartedAt: state.startedAt,
    releaseProcessPhase: state.phase,
  };
}

function transition(file, phase, options) {
  const state = loadState(file);
  if (!state) fail("release timing session does not exist");
  const now = nowEpoch(options);
  if (now < state.lastTransitionAtEpochSeconds) fail("release timing transition goes backwards");
  if (state.phase !== phase) {
    if (state.phase === "ops") state.accumulatedOpsSeconds += now - state.lastTransitionAtEpochSeconds;
    state.phase = phase;
    state.lastTransitionAtEpochSeconds = now;
    atomicWrite(file, state);
  }
  return snapshotValue(state, now);
}

function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  const file = requireAbsoluteFile(options.file);
  if (command === "begin") {
    process.stdout.write(`${JSON.stringify(begin(file, options))}\n`);
    return;
  }
  if (command === "exclude") {
    const state = loadState(file);
    if (!state) fail("release timing session does not exist");
    state.excludedSeconds += requireNonNegativeInteger(options.seconds, "--seconds");
    atomicWrite(file, state);
    process.stdout.write(`${JSON.stringify(snapshotValue(state, nowEpoch(options)))}\n`);
    return;
  }
  if (command === "pause") {
    process.stdout.write(`${JSON.stringify(transition(file, "main", options))}\n`);
    return;
  }
  if (command === "resume") {
    process.stdout.write(`${JSON.stringify(transition(file, "ops", options))}\n`);
    return;
  }
  if (command === "snapshot") {
    const state = loadState(file);
    if (!state) fail("release timing session does not exist");
    process.stdout.write(`${JSON.stringify(snapshotValue(state, nowEpoch(options)))}\n`);
    return;
  }
  if (command === "complete") {
    const state = loadState(file);
    if (!state) fail("release timing session does not exist");
    const value = snapshotValue(state, nowEpoch(options));
    rmSync(file);
    process.stdout.write(`${JSON.stringify(value)}\n`);
    return;
  }
  fail("usage: release-process-timing.mjs begin|pause|resume|exclude|snapshot|complete --file FILE [options]");
}

main();
