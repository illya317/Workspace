#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { canonicalJson, sha256 } from "./deploy-unit-provenance.mjs";

function fail(message) { throw new Error(message); }

export function normalizeDeploymentProfileRollout(value) {
  if (value?.schemaVersion !== 1 || value.kind !== "workspace-deployment-profile-rollout") {
    fail("deployment profile rollout is invalid");
  }
  const body = Object.fromEntries(Object.entries(value).filter(([key]) => key !== "rolloutSha256"));
  if (value.rolloutSha256 !== sha256(canonicalJson(body))) fail("deployment profile rollout digest drifted");
  if (!/^[a-z][a-z0-9-]*$/.test(value.profile?.id ?? "") || !Number.isInteger(value.profile?.version)) {
    fail("deployment profile rollout identity is invalid");
  }
  if (!/^[0-9a-f]{64}$/.test(value.profile?.sha256 ?? "")) fail("deployment profile rollout profile digest is invalid");
  for (const key of ["targetUnitIds", "verificationUnitIds"]) {
    if (!Array.isArray(value[key])) fail(`deployment profile rollout ${key} is invalid`);
    if (new Set(value[key]).size !== value[key].length) fail(`deployment profile rollout ${key} repeats units`);
    if (value[key].some((unitId) => !/^[a-z][a-z0-9-]*$/.test(unitId))) {
      fail(`deployment profile rollout ${key} contains an invalid unit`);
    }
  }
  if (value.targetUnitIds.some((unitId) => !value.verificationUnitIds.includes(unitId))) {
    fail("deployment profile rollout verification set must include every target unit");
  }
  return value;
}

function main(argv = process.argv.slice(2)) {
  const [command, file] = argv;
  if (!file) fail("rollout file is required");
  const rollout = normalizeDeploymentProfileRollout(JSON.parse(readFileSync(file, "utf8")));
  if (command === "assert") {
    process.stdout.write("MATCH\n");
    return;
  }
  if (command === "targets") {
    process.stdout.write(rollout.targetUnitIds.map((unitId) => `${unitId}\n`).join(""));
    return;
  }
  if (command === "digest") {
    process.stdout.write(rollout.rolloutSha256);
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
