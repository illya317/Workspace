#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

export const CONTROLLER_QUALIFICATION_SCHEMA_VERSION = 1;
export const CONTROLLER_QUALIFICATION_KIND = "workspace-controller-qualification";
export const CONTROLLER_OPS_ARGS = Object.freeze([
  "scripts/check/with-check-lock.js",
  "--",
  "node",
  "scripts/testing/run-node-tests.mjs",
  "shard",
  "ops",
]);
export const CONTROLLER_OPS_COMMAND = ["node", ...CONTROLLER_OPS_ARGS].join(" ");

const SHA256 = /^[0-9a-f]{64}$/;

function assertSha256(value, field) {
  if (!SHA256.test(value ?? "")) throw new Error(`${field} must be SHA-256`);
  return value;
}

function assertExactKeys(value, keys, field) {
  const actual = Object.keys(value ?? {}).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${field} fields are invalid`);
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeRuntimeIdentity(runtimeIdentity) {
  const normalized = {
    nodeVersion: runtimeIdentity?.nodeVersion,
    platform: runtimeIdentity?.platform,
    arch: runtimeIdentity?.arch,
    executable: runtimeIdentity?.executable,
  };
  for (const [field, value] of Object.entries(normalized)) {
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`runtimeIdentity.${field} is required`);
    }
  }
  return normalized;
}

export function qualificationIdentity({
  controlDigest,
  command = CONTROLLER_OPS_COMMAND,
  runtimeIdentity,
} = {}) {
  assertSha256(controlDigest, "controlDigest");
  if (command !== CONTROLLER_OPS_COMMAND) {
    throw new Error("controller qualification command is not governed");
  }
  const runtime = normalizeRuntimeIdentity(runtimeIdentity);
  return {
    controlDigest,
    command,
    commandDigest: sha256(command),
    runtime,
    runtimeDigest: sha256(canonicalJson(runtime)),
  };
}

export function qualificationReceiptPath(cacheRoot, expected) {
  if (!path.isAbsolute(cacheRoot ?? "")) throw new Error("cacheRoot must be absolute");
  const identity = qualificationIdentity(expected);
  return path.join(
    cacheRoot,
    "controller-qualifications",
    identity.controlDigest,
    `${identity.commandDigest}-${identity.runtimeDigest}.json`,
  );
}

export function createQualificationReceipt({
  controlDigest,
  command = CONTROLLER_OPS_COMMAND,
  runtimeIdentity,
  outputDigest,
  completedAt = new Date().toISOString(),
} = {}) {
  const identity = qualificationIdentity({ controlDigest, command, runtimeIdentity });
  assertSha256(outputDigest, "outputDigest");
  if (typeof completedAt !== "string" || Number.isNaN(Date.parse(completedAt))) {
    throw new Error("completedAt must be an ISO timestamp");
  }
  const unsigned = {
    schemaVersion: CONTROLLER_QUALIFICATION_SCHEMA_VERSION,
    kind: CONTROLLER_QUALIFICATION_KIND,
    status: "passed",
    ...identity,
    evidence: {
      exitCode: 0,
      outputDigest,
    },
    completedAt,
  };
  return { ...unsigned, receiptDigest: sha256(canonicalJson(unsigned)) };
}

export function validateQualificationReceipt(receipt, expected) {
  const identity = qualificationIdentity(expected);
  if (!receipt || typeof receipt !== "object") throw new Error("controller qualification is missing");
  assertExactKeys(receipt, [
    "schemaVersion",
    "kind",
    "status",
    "controlDigest",
    "command",
    "commandDigest",
    "runtime",
    "runtimeDigest",
    "evidence",
    "completedAt",
    "receiptDigest",
  ], "controller qualification");
  if (receipt.schemaVersion !== CONTROLLER_QUALIFICATION_SCHEMA_VERSION) {
    throw new Error("controller qualification schema is invalid");
  }
  if (receipt.kind !== CONTROLLER_QUALIFICATION_KIND || receipt.status !== "passed") {
    throw new Error("controller qualification is not passed evidence");
  }
  for (const field of ["controlDigest", "command", "commandDigest", "runtimeDigest"]) {
    if (receipt[field] !== identity[field]) {
      throw new Error(`controller qualification ${field} does not match`);
    }
  }
  if (canonicalJson(receipt.runtime) !== canonicalJson(identity.runtime)) {
    throw new Error("controller qualification runtime does not match");
  }
  assertExactKeys(receipt.evidence, ["exitCode", "outputDigest"], "controller qualification evidence");
  if (receipt.evidence?.exitCode !== 0) throw new Error("controller qualification exit code is not zero");
  assertSha256(receipt.evidence?.outputDigest, "controller qualification outputDigest");
  if (typeof receipt.completedAt !== "string" || Number.isNaN(Date.parse(receipt.completedAt))) {
    throw new Error("controller qualification completedAt is invalid");
  }
  const { receiptDigest, ...unsigned } = receipt;
  assertSha256(receiptDigest, "controller qualification receiptDigest");
  if (sha256(canonicalJson(unsigned)) !== receiptDigest) {
    throw new Error("controller qualification receipt digest does not match");
  }
  return receipt;
}

export function readReusableQualification(cacheRoot, expected) {
  const file = qualificationReceiptPath(cacheRoot, expected);
  if (!existsSync(file)) return null;
  if (!lstatSync(file).isFile()) throw new Error("controller qualification cache entry is not a regular file");
  const receipt = JSON.parse(readFileSync(file, "utf8"));
  return { file, receipt: validateQualificationReceipt(receipt, expected) };
}

export function writeQualificationOnce(cacheRoot, receipt) {
  const expected = {
    controlDigest: receipt?.controlDigest,
    command: receipt?.command,
    runtimeIdentity: receipt?.runtime,
  };
  validateQualificationReceipt(receipt, expected);
  const file = qualificationReceiptPath(cacheRoot, expected);
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  try {
    linkSync(temporary, file);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    if (!readReusableQualification(cacheRoot, expected)) {
      throw new Error("controller qualification cache entry disappeared during write");
    }
  } finally {
    unlinkSync(temporary);
  }
  return file;
}
