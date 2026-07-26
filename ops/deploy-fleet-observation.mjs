#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { canonicalJson, sha256 } from "./deploy-unit-provenance.mjs";
import { normalizeDeploymentProfileRelease } from "./deploy-profile-release.mjs";

function fail(message) {
  throw new Error(message);
}

function readJson(file, label) {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch (error) {
    fail(`${label} cannot be read: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function finite(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`${label} must be finite`);
  return value;
}

function minutesBetween(start, end) {
  const duration = (Date.parse(end) - Date.parse(start)) / 60_000;
  if (!Number.isFinite(duration) || duration <= 0) fail("observation window is invalid");
  return duration;
}

export function evaluateFleetObservation({ profile, release, observation }) {
  const normalizedRelease = normalizeDeploymentProfileRelease(release);
  if (profile?.kind !== "workspace-deployment-profile" || profile.profileSha256 !== normalizedRelease.profile.sha256) {
    fail("fleet observation profile does not match the release set");
  }
  if (observation?.schemaVersion !== 1 || observation.kind !== "workspace-deployment-profile-observation") {
    fail("fleet observation is invalid");
  }
  if (observation.releaseSetSha256 !== normalizedRelease.releaseSetSha256) {
    fail("fleet observation belongs to another release set");
  }
  if (!Array.isArray(observation.units)) fail("fleet observation units are missing");
  const expectedIds = [...profile.unitIds].sort();
  const actualIds = observation.units.map((unit) => unit?.unitId).sort();
  if (canonicalJson(expectedIds) !== canonicalJson(actualIds)) fail("fleet observation unit set is not exact");
  const unitContractById = new Map(profile.units.map((unit) => [unit.id, unit]));
  const windowMinutes = minutesBetween(observation.windowStartedAt, observation.windowEndedAt);
  const violations = [];

  for (const metric of observation.units) {
    const unit = unitContractById.get(metric.unitId);
    if (!unit) fail(`fleet observation references unknown unit: ${metric.unitId}`);
    const slo = unit.runtime.slo;
    if (metric.health !== "passing") violations.push(`${metric.unitId}:health`);
    if (finite(metric.availabilityPercent, `${metric.unitId} availability`) < slo.availabilityPercent) {
      violations.push(`${metric.unitId}:availability`);
    }
    if (finite(metric.p95LatencyMs, `${metric.unitId} p95 latency`) > slo.p95LatencyMs) {
      violations.push(`${metric.unitId}:p95-latency`);
    }
    if (finite(metric.errorRatePercent, `${metric.unitId} error rate`) > slo.maximumErrorRatePercent) {
      violations.push(`${metric.unitId}:error-rate`);
    }
    if (windowMinutes < slo.canaryObservationMinutes) violations.push(`${metric.unitId}:observation-window`);
  }

  const minimumRpo = Math.min(...profile.units.map((unit) => unit.runtime.slo.recoveryPointObjectiveMinutes));
  const dr = observation.disasterRecovery;
  if (!dr || dr.controlPlaneReceiptReplicated !== true || dr.tenantConfigReplicated !== true) {
    violations.push("fleet:control-plane-replication");
  }
  if (!dr || finite(dr.latestRecoverableBackupAgeMinutes, "recoverable backup age") > minimumRpo) {
    violations.push("fleet:rpo");
  }
  if (!dr || !Number.isInteger(dr.restoreDrillAgeDays) || dr.restoreDrillAgeDays < 0 || dr.restoreDrillAgeDays > 90) {
    violations.push("fleet:restore-drill-stale");
  }

  const body = {
    schemaVersion: 1,
    kind: "workspace-deployment-profile-observation-result",
    profile: normalizedRelease.profile,
    releaseSetSha256: normalizedRelease.releaseSetSha256,
    window: { startedAt: observation.windowStartedAt, endedAt: observation.windowEndedAt, minutes: windowMinutes },
    status: violations.length === 0 ? "passed" : "failed",
    violations: [...new Set(violations)].sort(),
    evaluatedAt: observation.evaluatedAt,
  };
  return { ...body, resultSha256: sha256(canonicalJson(body)) };
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

export function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  const options = parseArguments(rest);
  const profile = readJson(options.profile, "deployment profile");
  const release = readJson(options.release, "deployment profile release");
  const observation = readJson(options.observation, "fleet observation");
  const result = evaluateFleetObservation({ profile, release, observation });
  if (options.output) writeFileSync(options.output, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  else process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (command === "assert" && result.status !== "passed") fail(`fleet SLO/DR gate failed: ${result.violations.join(", ")}`);
  if (command !== "assert" && command !== "evaluate") fail(`unknown command: ${command ?? "<missing>"}`);
  return result;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try { main(); } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
