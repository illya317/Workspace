#!/usr/bin/env node

import { createHash } from "node:crypto";
import { appendFileSync, chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const UNIT_PATTERN = /^[a-z][a-z0-9-]*$/;
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const PACKAGE_PATTERN = /^(?:unknown|[0-9A-Za-z][0-9A-Za-z.+-]*)$/;

function fail(message) { throw new Error(message); }

function readJson(file, label) {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch (error) {
    fail(`${label} cannot be read: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) fail(`${label} is required`);
  return value;
}

function requireUnit(value, label = "deploy unit") {
  if (!UNIT_PATTERN.test(value ?? "")) fail(`${label} is invalid`);
  return value;
}

function requireSha(value, label) {
  if (!SHA_PATTERN.test(value ?? "")) fail(`${label} must be a full lowercase Git SHA`);
  return value;
}

function requireBuild(value) {
  if (value === "mixed") return value;
  return requireSha(value, "deploy source SHA");
}

function requireDigest(value, label) {
  if (!DIGEST_PATTERN.test(value ?? "")) fail(`${label} must be a lowercase SHA-256 digest`);
  return value;
}

function normalizeTextList(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    fail(`${label} must be a string array`);
  }
  return [...new Set(value.map((item) => item.trim()))].sort();
}

function normalizePackageVersion(value) {
  const normalized = value || "unknown";
  if (!PACKAGE_PATTERN.test(normalized)) fail("deploy package version is invalid");
  return normalized;
}

function normalizeDuration(value) {
  const duration = Number(value ?? 0);
  if (!Number.isSafeInteger(duration) || duration < 0) fail("deploy duration must be a non-negative integer");
  return duration;
}

function normalizeTiming(value, durationSeconds) {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("deploy timing is invalid");
  const releaseProcessSeconds = normalizeDuration(value.releaseProcessSeconds);
  const releaseAttemptCount = Number(value.releaseAttemptCount);
  if (!Number.isSafeInteger(releaseAttemptCount) || releaseAttemptCount < 1) fail("release attempt count is invalid");
  const releaseProcessStartedAt = timestamp(value.releaseProcessStartedAt);
  const stages = Array.isArray(value.stages) ? value.stages.map((stage) => {
    if (!stage || typeof stage !== "object" || Array.isArray(stage)) fail("deploy timing stage is invalid");
    return {
      scope: requireString(stage.scope, "timing stage scope"),
      stage: requireString(stage.stage, "timing stage name"),
      status: requireString(stage.status, "timing stage status"),
      durationMs: normalizeDuration(stage.durationMs),
    };
  }) : [];
  const slowestStage = stages.reduce((slowest, stage) => !slowest || stage.durationMs > slowest.durationMs ? stage : slowest, null);
  const opsTotalSeconds = releaseProcessSeconds + durationSeconds;
  return {
    schemaVersion: 1,
    totalSeconds: durationSeconds,
    opsTotalSeconds,
    local: { releaseProcessSeconds, releaseAttemptCount, releaseProcessStartedAt },
    stages,
    slowestStage: slowestStage ? {
      ...slowestStage,
      percentOfTotal: opsTotalSeconds === 0 ? 0 : Math.round((slowestStage.durationMs / (opsTotalSeconds * 1000)) * 100),
    } : null,
  };
}

function timestamp(value = new Date().toISOString()) {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) fail("deploy completion time is invalid");
  return date.toISOString();
}

function unitDescriptor(unitId, moduleKeys, moduleLabels) {
  return {
    unitId: requireUnit(unitId),
    moduleKeys: normalizeTextList(moduleKeys, `${unitId} module keys`),
    moduleLabels: normalizeTextList(moduleLabels, `${unitId} module labels`),
  };
}

function eventBase({ id, action, deploymentKind, deploymentMode, packageVersion, build, release, durationSeconds, modules, finishedAt, timing }) {
  if (!new Set(["deploy", "rollback"]).has(action)) fail("deploy notification action is invalid");
  if (!new Set(["unit", "profile"]).has(deploymentKind)) fail("deploy notification kind is invalid");
  if (!new Set(["shadow", "activate", "rollback"]).has(deploymentMode)) fail("deploy notification mode is invalid");
  if (!Array.isArray(modules) || modules.length === 0) fail("deploy notification has no modules");
  const normalizedDuration = normalizeDuration(durationSeconds);
  const normalizedTiming = normalizeTiming(timing, normalizedDuration);
  const event = {
    schemaVersion: 2,
    kind: "workspace-deploy-event",
    id: requireString(id, "deploy event id"),
    transport: "cnb-unit",
    deploymentKind,
    deploymentMode,
    action,
    package: normalizePackageVersion(packageVersion),
    build: requireBuild(build),
    release: requireString(release, "deploy release"),
    durationSeconds: normalizedDuration,
    modules,
    finishedAt: timestamp(finishedAt),
  };
  if (normalizedTiming) {
    event.opsDurationSeconds = normalizedTiming.opsTotalSeconds;
    event.timing = normalizedTiming;
  }
  return event;
}

export function createUnitDeployEvent({
  contract,
  manifest,
  action = "deploy",
  deploymentMode = "activate",
  releaseId,
  gatewayGeneration,
  packageVersion = "unknown",
  durationSeconds = 0,
  timing,
  finishedAt,
}) {
  if (contract?.kind !== "workspace-deploy-unit-contract") fail("deploy unit contract is invalid");
  const unitId = requireUnit(contract.id);
  if (manifest?.kind !== "workspace-deploy-unit-artifact" || manifest.unit?.id !== unitId) {
    fail("deploy unit manifest identity is invalid");
  }
  const generation = deploymentMode === "shadow" ? null : requireDigest(gatewayGeneration, "Gateway generation");
  const build = requireSha(manifest.source?.commitSha, `${unitId} source SHA`);
  const event = {
    ...eventBase({
      id: `unit:${deploymentMode}:${action}:${unitId}:${build}:${generation ?? releaseId}`,
      action,
      deploymentKind: "unit",
      deploymentMode,
      packageVersion,
      build,
      release: releaseId,
      durationSeconds,
      modules: [unitDescriptor(unitId, contract.moduleKeys ?? [], contract.moduleLabels ?? [])],
      finishedAt,
      timing,
    }),
  };
  if (generation) event.gatewayGeneration = generation;
  return event;
}

export function createProfileDeployEvent({
  profile,
  release,
  receipt,
  action = "deploy",
  packageVersion = "unknown",
  durationSeconds = 0,
  finishedAt,
}) {
  if (profile?.kind !== "workspace-deployment-profile") fail("deployment profile is invalid");
  if (release?.kind !== "workspace-deployment-profile-release") fail("deployment profile release is invalid");
  if (receipt?.kind !== "workspace-deployment-profile-promotion-receipt") fail("profile promotion receipt is invalid");
  if (profile.id !== release.profile?.id || profile.id !== receipt.profile?.id) fail("profile identities differ");
  const targetIds = normalizeTextList(receipt.targetUnitIds, "profile target units").map((unitId) => requireUnit(unitId));
  if (targetIds.length === 0) fail("profile deploy notification has no target units");
  const unitById = new Map(profile.units?.map((unit) => [unit.id, unit]) ?? []);
  const releaseById = new Map(release.units?.map((unit) => [unit.unitId, unit]) ?? []);
  const modules = targetIds.map((unitId) => {
    const unit = unitById.get(unitId);
    if (!unit) fail(`profile is missing target unit ${unitId}`);
    return unitDescriptor(unitId, unit.moduleKeys ?? [], unit.moduleLabels ?? []);
  });
  const builds = targetIds.map((unitId) => ({
    unitId,
    commitSha: requireSha(releaseById.get(unitId)?.source?.commitSha, `${unitId} source SHA`),
  }));
  const uniqueBuilds = [...new Set(builds.map((item) => item.commitSha))];
  const generation = requireDigest(receipt.generationId, "Gateway generation");
  const promotion = requireDigest(receipt.promotionSha256, "profile promotion");
  return {
    ...eventBase({
      id: `profile:${action}:${profile.id}:${promotion}`,
      action,
      deploymentKind: "profile",
      deploymentMode: action === "rollback" ? "rollback" : "activate",
      packageVersion,
      build: uniqueBuilds.length === 1 ? uniqueBuilds[0] : "mixed",
      release: release.releaseSetSha256,
      durationSeconds,
      modules,
      finishedAt,
    }),
    profile: { id: profile.id, label: requireString(profile.label, "profile label") },
    builds,
    gatewayGeneration: generation,
  };
}

function writePrivateJson(file, event) {
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(event, null, 2)}\n`, { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, file);
  chmodSync(file, 0o600);
}

export function writeDeployEvent(file, event, { historyDir } = {}) {
  writePrivateJson(file, event);
  if (!historyDir) return;
  mkdirSync(historyDir, { recursive: true, mode: 0o700 });
  chmodSync(historyDir, 0o700);
  const eventDigest = createHash("sha256").update(event.id).digest("hex").slice(0, 16);
  const stamp = event.finishedAt.replaceAll(/[^0-9]/g, "").slice(0, 14);
  writePrivateJson(`${historyDir}/${stamp}-${eventDigest}.json`, event);
  writePrivateJson(`${historyDir}/latest.json`, event);
  const historyLog = `${historyDir}/deployments.ndjson`;
  appendFileSync(historyLog, `${JSON.stringify(event)}\n`, { mode: 0o600 });
  chmodSync(historyLog, 0o600);
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) fail(`invalid argument: ${key ?? "<missing>"}`);
    options[key.slice(2).replaceAll("-", "_")] = value;
  }
  return options;
}

function required(options, key) { return requireString(options[key], `--${key.replaceAll("_", "-")}`); }

export function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  const options = parseArguments(rest);
  const common = {
    action: options.action ?? "deploy",
    deploymentMode: options.deployment_mode ?? "activate",
    packageVersion: options.package_version ?? "unknown",
    durationSeconds: options.duration_seconds ?? "0",
  };
  const timing = options.release_process_seconds === undefined ? undefined : {
    releaseProcessSeconds: options.release_process_seconds,
    releaseAttemptCount: options.release_attempt_count,
    releaseProcessStartedAt: options.release_process_started_at,
    stages: options.stages_base64
      ? JSON.parse(Buffer.from(options.stages_base64, "base64").toString("utf8"))
      : [],
  };
  if (command === "unit-write") {
    writeDeployEvent(required(options, "event_file"), createUnitDeployEvent({
      ...common,
      contract: readJson(required(options, "contract"), "deploy unit contract"),
      manifest: readJson(required(options, "manifest"), "deploy unit manifest"),
      releaseId: required(options, "release_id"),
      gatewayGeneration: options.gateway_generation,
      timing,
    }), { historyDir: options.history_dir });
    return;
  }
  if (command === "profile-write") {
    writeDeployEvent(required(options, "event_file"), createProfileDeployEvent({
      ...common,
      profile: readJson(required(options, "profile"), "deployment profile"),
      release: readJson(required(options, "release"), "deployment profile release"),
      receipt: readJson(required(options, "receipt"), "profile promotion receipt"),
    }), { historyDir: options.history_dir });
    return;
  }
  fail(`unknown command: ${command ?? "<missing>"}`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try { main(); } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
