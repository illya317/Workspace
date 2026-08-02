#!/usr/bin/env node

import { closeSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

function fail(message) {
  throw new Error(message);
}

function parseInstant(value, label) {
  if (typeof value !== "string" || !value.trim() || Number.isNaN(Date.parse(value))) fail(`${label} is invalid`);
  return value.trim();
}

function parseEpoch(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) fail(`${label} is invalid`);
  return parsed;
}

function readState(file) {
  const state = JSON.parse(readFileSync(file, "utf8"));
  if (state.schemaVersion !== 1 || state.kind !== "workspace-deploy-timing-state") fail("deploy timing state contract is invalid");
  parseInstant(state.deployRequestedAt, "deployRequestedAt");
  parseEpoch(state.deployRequestedAtEpochSeconds, "deployRequestedAtEpochSeconds");
  if (state.mutationStartedAt !== null) parseInstant(state.mutationStartedAt, "mutationStartedAt");
  if (state.mutationStartedAtEpochSeconds !== null) parseEpoch(state.mutationStartedAtEpochSeconds, "mutationStartedAtEpochSeconds");
  return state;
}

function atomicWrite(file, value) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.tmp-${process.pid}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`);
  } finally {
    closeSync(descriptor);
  }
  renameSync(temporary, file);
}

const [command, ...args] = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index < 0 ? "" : args[index + 1] ?? "";
};
const file = option("--file");
if (!file || !path.isAbsolute(file)) fail("--file must be absolute");

if (command === "initialize") {
  const state = {
    schemaVersion: 1,
    kind: "workspace-deploy-timing-state",
    deployRequestedAt: parseInstant(option("--requested-at"), "deployRequestedAt"),
    deployRequestedAtEpochSeconds: parseEpoch(option("--requested-epoch"), "deployRequestedAtEpochSeconds"),
    mutationStartedAt: null,
    mutationStartedAtEpochSeconds: null,
    currentPhase: "deploy-entry-preflight",
  };
  atomicWrite(file, state);
} else if (command === "phase") {
  const state = readState(file);
  const phase = option("--value").trim();
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(phase)) fail("phase is invalid");
  state.currentPhase = phase;
  atomicWrite(file, state);
} else if (command === "mutation-start") {
  const state = readState(file);
  if (state.mutationStartedAt === null) {
    const now = new Date();
    state.mutationStartedAt = now.toISOString();
    state.mutationStartedAtEpochSeconds = Math.floor(now.getTime() / 1000);
  }
  state.currentPhase = option("--phase").trim() || "production-mutation";
  atomicWrite(file, state);
} else if (command === "lines") {
  const state = readState(file);
  process.stdout.write([
    state.deployRequestedAtEpochSeconds,
    state.deployRequestedAt,
    state.mutationStartedAtEpochSeconds ?? "",
    state.mutationStartedAt ?? "",
    state.currentPhase,
  ].join("\n") + "\n");
} else {
  fail("usage: deploy-timing-state.mjs initialize|phase|mutation-start|lines --file FILE");
}
