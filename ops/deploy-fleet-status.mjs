#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function fail(message) { throw new Error(message); }

function readJson(file, label) {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch (error) {
    fail(`${label} cannot be read: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function resolveFleetStatus({ profile, routeMap }) {
  if (profile?.kind !== "workspace-deployment-profile" || !Array.isArray(profile.unitIds)) {
    fail("deployment profile is invalid");
  }
  if (routeMap?.kind !== "workspace-gateway-route-map" || !Array.isArray(routeMap.activeUnits)) {
    fail("Gateway route map is invalid");
  }
  const expected = [...profile.unitIds].sort();
  const active = routeMap.activeUnits.map((unit) => unit.unitId).sort();
  const activeSet = new Set(active);
  const expectedSet = new Set(expected);
  const missingUnitIds = expected.filter((unitId) => !activeSet.has(unitId));
  const extraUnitIds = active.filter((unitId) => !expectedSet.has(unitId));
  return {
    schemaVersion: 1,
    kind: "workspace-deployment-fleet-status",
    profile: { id: profile.id, version: profile.version, sha256: profile.profileSha256 },
    generationId: routeMap.generationId,
    stateSetSha256: routeMap.stateSetSha256,
    status: missingUnitIds.length === 0 && extraUnitIds.length === 0 ? "converged" : "drifted",
    missingUnitIds,
    extraUnitIds,
    units: profile.units.map((unit) => {
      const activation = routeMap.activeUnits.find((candidate) => candidate.unitId === unit.id) ?? null;
      return {
        unitId: unit.id,
        deploymentId: activation?.deploymentId ?? null,
        releaseId: activation?.releaseId ?? null,
        slot: activation?.slot ?? null,
        port: activation?.port ?? null,
        slo: unit.runtime.slo,
      };
    }),
  };
}

function argument(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

export function main(argv = process.argv.slice(2)) {
  const command = argv[0];
  const profileFile = argument(argv, "--profile");
  const gateway = argument(argv, "--gateway");
  if (!profileFile || !gateway) fail("--profile and --gateway are required");
  const routeMapFile = gateway.endsWith(".json") ? gateway : path.join(gateway, "route-map.json");
  const status = resolveFleetStatus({
    profile: readJson(profileFile, "deployment profile"),
    routeMap: readJson(routeMapFile, "Gateway route map"),
  });
  process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
  if (command === "assert" && status.status !== "converged") {
    fail(`fleet profile drifted: missing=${status.missingUnitIds.join(",")}; extra=${status.extraUnitIds.join(",")}`);
  }
  if (command !== "inspect" && command !== "assert") fail(`unknown command: ${command ?? "<missing>"}`);
  return status;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try { main(); } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
