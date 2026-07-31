import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_CACHE_POLICY_FILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../cache-policy.json",
);

const REQUIRED_CLASSES = [
  "validation-receipt",
  "compiler-cache",
  "failed-diagnostics",
  "runtime-temporary",
  "deployed-artifact",
  "undeployed-artifact",
];

const PRIVATE_OVERRIDES = [
  { env: "CACHE_POLICY_TOTAL_MAX_BYTES", path: ["totalMaxBytes"] },
  { env: "CACHE_POLICY_DISK_HIGH_WATERMARK_PERCENT", path: ["diskHighWatermarkPercent"] },
  { env: "CACHE_POLICY_DISK_STOP_BUILD_PERCENT", path: ["diskStopBuildPercent"] },
  { env: "CACHE_POLICY_VALIDATION_RECEIPT_RETENTION_DAYS", path: ["classes", "validation-receipt", "retentionDays"] },
  { env: "CACHE_POLICY_COMPILER_CACHE_RETENTION_DAYS", path: ["classes", "compiler-cache", "retentionDays"] },
  { env: "CACHE_POLICY_FAILED_DIAGNOSTICS_RETENTION_HOURS", path: ["classes", "failed-diagnostics", "retentionHours"] },
  { env: "CACHE_POLICY_RUNTIME_TEMPORARY_RETENTION_HOURS", path: ["classes", "runtime-temporary", "retentionHours"] },
  { env: "CACHE_POLICY_UNDEPLOYED_ARTIFACT_RETENTION_HOURS", path: ["classes", "undeployed-artifact", "retentionHours"] },
];

function assertPositiveNumber(value, label) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be a positive number`);
}

function assertRoot(root, label) {
  if (typeof root !== "string" || root.length === 0 || path.isAbsolute(root)) {
    throw new Error(`${label} must be a repository-relative path`);
  }
  const normalized = path.posix.normalize(root.replaceAll("\\", "/"));
  if (normalized === ".." || normalized.startsWith("../") || normalized === ".") {
    throw new Error(`${label} escapes the repository`);
  }
}

export function validateCachePolicy(policy) {
  if (policy?.schemaVersion !== 1) throw new Error("cache policy schemaVersion must be 1");
  assertPositiveNumber(policy.totalMaxBytes, "totalMaxBytes");
  assertPositiveNumber(policy.diskHighWatermarkPercent, "diskHighWatermarkPercent");
  assertPositiveNumber(policy.diskStopBuildPercent, "diskStopBuildPercent");
  if (policy.diskHighWatermarkPercent >= policy.diskStopBuildPercent || policy.diskStopBuildPercent >= 100) {
    throw new Error("cache disk watermarks must satisfy high < stop-build < 100");
  }
  for (const className of REQUIRED_CLASSES) {
    const entry = policy.classes?.[className];
    if (!entry || !Array.isArray(entry.roots) || entry.roots.length === 0) {
      throw new Error(`cache policy class ${className} must declare roots`);
    }
    for (const root of entry.roots) assertRoot(root, `${className}.roots`);
  }
  for (const className of ["validation-receipt", "compiler-cache"]) {
    assertPositiveNumber(policy.classes[className].retentionDays, `${className}.retentionDays`);
  }
  for (const className of ["failed-diagnostics", "runtime-temporary", "undeployed-artifact"]) {
    assertPositiveNumber(policy.classes[className].retentionHours, `${className}.retentionHours`);
  }
  if (policy.classes["validation-receipt"].scope !== "task-input") {
    throw new Error("validation receipts must remain task-input scoped");
  }
  if (policy.classes["deployed-artifact"].pin !== "production-and-rollback") {
    throw new Error("deployed artifacts must pin production-and-rollback");
  }
  return policy;
}

function valueAt(target, segments) {
  return segments.reduce((value, key) => value[key], target);
}

function setAt(target, segments, value) {
  let cursor = target;
  for (const key of segments.slice(0, -1)) cursor = cursor[key];
  cursor[segments.at(-1)] = value;
}

export function applyPrivateCachePolicyOverrides(policy, env = process.env) {
  const resolved = structuredClone(policy);
  for (const override of PRIVATE_OVERRIDES) {
    const raw = env[override.env]?.trim();
    if (!raw) continue;
    const requested = Number(raw);
    assertPositiveNumber(requested, override.env);
    const governed = valueAt(policy, override.path);
    if (requested > governed) {
      throw new Error(`${override.env} may only tighten the governed value ${governed}`);
    }
    setAt(resolved, override.path, requested);
  }
  return validateCachePolicy(resolved);
}

export function loadCachePolicy({ policyFile = DEFAULT_CACHE_POLICY_FILE, env = process.env } = {}) {
  const policy = JSON.parse(fs.readFileSync(policyFile, "utf8"));
  validateCachePolicy(policy);
  return applyPrivateCachePolicyOverrides(policy, env);
}

export function retentionMilliseconds(entry) {
  if (Number.isFinite(entry.retentionHours)) return entry.retentionHours * 60 * 60 * 1000;
  if (Number.isFinite(entry.retentionDays)) return entry.retentionDays * 24 * 60 * 60 * 1000;
  return Number.POSITIVE_INFINITY;
}
