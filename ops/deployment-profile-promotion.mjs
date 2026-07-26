#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { normalizeDeploymentProfileRelease } from "./deploy-profile-release.mjs";
import { canonicalJson, sha256 } from "./deploy-unit-provenance.mjs";
import { readDeployUnitState } from "./deploy-unit-release.mjs";

function fail(message) { throw new Error(message); }

function readJson(file, label) {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch (error) {
    fail(`${label} cannot be read: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function artifactIdentity(value, label) {
  if (!value?.sha256 || !value?.manifestSha256) fail(`${label} artifact identity is missing`);
  return { sha256: value.sha256, manifestSha256: value.manifestSha256 };
}

function assertSameArtifact(actual, expected, label) {
  if (canonicalJson(artifactIdentity(actual, label)) !== canonicalJson(artifactIdentity(expected, label))) {
    fail(`${label} artifact does not match the exact profile release set`);
  }
}

export function createDeploymentProfilePromotion({
  graph,
  profile,
  release,
  rollout,
  observationResult,
  currentRouteMap = null,
  proposedStates,
  proposedStateFiles,
  promotedAt = new Date().toISOString(),
}) {
  const profileBody = Object.fromEntries(Object.entries(profile ?? {}).filter(([key]) => key !== "profileSha256"));
  if (profile?.profileSha256 !== sha256(canonicalJson(profileBody))) fail("deployment profile digest drifted");
  if (profile.graphSha256 !== sha256(canonicalJson(graph))) fail("deployment profile graph digest drifted");
  const normalizedRelease = normalizeDeploymentProfileRelease(release);
  if (profile?.profileSha256 !== normalizedRelease.profile.sha256 || rollout?.profile?.sha256 !== profile.profileSha256) {
    fail("profile promotion inputs refer to different profiles");
  }
  const rolloutBody = Object.fromEntries(Object.entries(rollout).filter(([key]) => key !== "rolloutSha256"));
  if (rollout.rolloutSha256 !== sha256(canonicalJson(rolloutBody))) fail("profile rollout digest drifted");
  if (observationResult?.status !== "passed"
    || observationResult.releaseSetSha256 !== normalizedRelease.releaseSetSha256) {
    fail("profile promotion requires passed SLO/DR evidence for the exact release set");
  }
  const targetIds = [...rollout.targetUnitIds].sort();
  if (targetIds.length === 0) fail("profile promotion has no target units");
  const releaseByUnit = new Map(normalizedRelease.units.map((unit) => [unit.unitId, unit]));
  const currentByUnit = new Map((currentRouteMap?.activeUnits ?? []).map((activation) => [activation.unitId, activation]));
  const stateByUnit = new Map(proposedStates.map((state) => [state.unitId, state]));
  if (stateByUnit.size !== proposedStates.length) fail("profile promotion repeats proposed unit state");
  if (canonicalJson([...stateByUnit.keys()].sort()) !== canonicalJson(targetIds)) {
    fail("profile promotion proposed state set must exactly match rollout targets");
  }

  for (const unitId of profile.unitIds) {
    const expected = releaseByUnit.get(unitId);
    if (!expected) fail(`${unitId} is missing from the profile release set`);
    if (stateByUnit.has(unitId)) {
      assertSameArtifact(stateByUnit.get(unitId).active?.artifact, expected.artifact, `${unitId} proposed`);
    } else {
      const current = currentByUnit.get(unitId);
      if (!current) fail(`${unitId} has no current activation for the exact profile release set`);
      assertSameArtifact(current.artifact, expected.artifact, `${unitId} current`);
    }
  }
  const extraCurrentUnits = [...currentByUnit.keys()].filter((unitId) => !profile.unitIds.includes(unitId));
  if (extraCurrentUnits.length > 0) fail(`current Gateway contains units outside the profile: ${extraCurrentUnits.join(", ")}`);
  const body = {
    schemaVersion: 1,
    kind: "workspace-deployment-profile-promotion",
    profile: normalizedRelease.profile,
    releaseSetSha256: normalizedRelease.releaseSetSha256,
    rolloutSha256: rollout.rolloutSha256,
    observationResultSha256: observationResult.resultSha256,
    graphSha256: profile.graphSha256,
    previousGenerationId: currentRouteMap?.generationId ?? null,
    targetUnitIds: targetIds,
    stateOverrides: targetIds.map((unitId) => ({ unitId, file: proposedStateFiles[unitId] })),
    promotedAt,
  };
  return { ...body, promotionSha256: sha256(canonicalJson(body)) };
}

export function normalizeDeploymentProfilePromotion(value) {
  if (value?.schemaVersion !== 1 || value.kind !== "workspace-deployment-profile-promotion") {
    fail("deployment profile promotion is invalid");
  }
  const body = Object.fromEntries(Object.entries(value).filter(([key]) => key !== "promotionSha256"));
  if (value.promotionSha256 !== sha256(canonicalJson(body))) fail("deployment profile promotion digest drifted");
  return value;
}

export function createDeploymentProfilePromotionReceipt(promotion, generationId, activatedAt = new Date().toISOString()) {
  const normalized = normalizeDeploymentProfilePromotion(promotion);
  if (!/^[0-9a-f]{64}$/.test(generationId ?? "")) fail("Gateway generation id is invalid");
  const body = {
    schemaVersion: 1,
    kind: "workspace-deployment-profile-promotion-receipt",
    profile: normalized.profile,
    releaseSetSha256: normalized.releaseSetSha256,
    promotionSha256: normalized.promotionSha256,
    previousGenerationId: normalized.previousGenerationId,
    generationId,
    targetUnitIds: normalized.targetUnitIds,
    activatedAt,
  };
  return { ...body, receiptSha256: sha256(canonicalJson(body)) };
}

export function normalizeDeploymentProfilePromotionReceipt(value) {
  if (value?.schemaVersion !== 1 || value.kind !== "workspace-deployment-profile-promotion-receipt") {
    fail("deployment profile promotion receipt is invalid");
  }
  const body = Object.fromEntries(Object.entries(value).filter(([key]) => key !== "receiptSha256"));
  if (value.receiptSha256 !== sha256(canonicalJson(body))) fail("deployment profile promotion receipt digest drifted");
  return value;
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
  if (command === "write") {
    const profile = readJson(options.profile, "deployment profile");
    const rollout = readJson(options.rollout, "deployment profile rollout");
    const currentRouteMap = options.current_gateway
      ? readJson(path.join(options.current_gateway, "route-map.json"), "current Gateway route map")
      : null;
    const proposedStateFiles = Object.fromEntries(rollout.targetUnitIds.map((unitId) => [
      unitId,
      path.join(options.proposed_state_root, `${unitId}.json`),
    ]));
    const promotion = createDeploymentProfilePromotion({
      graph: readJson(options.graph, "deploy graph"),
      profile,
      release: readJson(options.release, "deployment profile release"),
      rollout,
      observationResult: readJson(options.observation_result, "fleet observation result"),
      currentRouteMap,
      proposedStates: rollout.targetUnitIds.map((unitId) => readDeployUnitState(proposedStateFiles[unitId])),
      proposedStateFiles,
    });
    writeFileSync(options.output, `${JSON.stringify(promotion, null, 2)}\n`, { mode: 0o600 });
    return promotion;
  }
  if (command === "receipt-write") {
    const receipt = createDeploymentProfilePromotionReceipt(
      readJson(options.promotion, "deployment profile promotion"),
      options.generation_id,
    );
    writeFileSync(options.output, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
    return receipt;
  }
  if (command === "receipt-assert") {
    normalizeDeploymentProfilePromotionReceipt(readJson(options.receipt, "deployment profile promotion receipt"));
    process.stdout.write("MATCH\n");
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
