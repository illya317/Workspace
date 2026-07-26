import { createHash } from "node:crypto";

import { resolveDeployGraph, type DeployGraph } from "./deploy-graph";
import { deploymentProfileSpecs, type DeploymentProfileSpec } from "./deployment-profile-spec";
import { canonicalJson } from "./deploy-unit-contract";

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function unique(values: readonly string[], label: string) {
  if (new Set(values).size !== values.length) throw new Error(`${label} contains duplicate deploy units`);
}

export function resolveDeploymentProfile(
  profileId: string,
  options: { graph?: DeployGraph; specs?: readonly DeploymentProfileSpec[] } = {},
) {
  const graph = options.graph ?? resolveDeployGraph();
  const specs = options.specs ?? deploymentProfileSpecs;
  const spec = specs.find((candidate) => candidate.id === profileId);
  if (!spec) throw new Error(`Unknown deployment profile: ${profileId}`);
  if (!/^[a-z][a-z0-9-]*$/.test(spec.id) || !Number.isInteger(spec.version) || spec.version <= 0) {
    throw new Error(`Deployment profile ${profileId} identity is invalid`);
  }
  unique(spec.unitIds, `Deployment profile ${profileId}`);
  const unitById = new Map(graph.units.map((unit) => [unit.id, unit]));
  const selected = new Set(spec.unitIds);
  const unknown = spec.unitIds.filter((unitId) => !unitById.has(unitId));
  if (unknown.length > 0) throw new Error(`${profileId} references unknown deploy units: ${unknown.join(", ")}`);
  const shells = spec.unitIds.filter((unitId) => unitById.get(unitId)?.kind === "workspace-shell");
  if (shells.length !== 1) throw new Error(`${profileId} must contain exactly one workspace-shell`);

  const missingRequiredDependencies = spec.unitIds.flatMap((unitId) => {
    const unit = unitById.get(unitId)!;
    return unit.runtimeDependencies
      .filter((dependency) => dependency.requirement === "required" && !selected.has(dependency.unitId))
      .map((dependency) => `${unitId}->${dependency.unitId}`);
  });
  if (missingRequiredDependencies.length > 0) {
    throw new Error(`${profileId} omits required runtime dependencies: ${missingRequiredDependencies.join(", ")}`);
  }
  const unavailable = spec.unitIds.filter((unitId) => {
    const unit = unitById.get(unitId)!;
    return unit.maturity === "planned" || unit.coordination !== "available";
  });
  if (unavailable.length > 0) throw new Error(`${profileId} contains unavailable deploy units: ${unavailable.join(", ")}`);

  const units = spec.unitIds.map((unitId) => unitById.get(unitId)!);
  const optionalRuntimeCapabilities = units.flatMap((unit) => unit.runtimeDependencies
    .filter((dependency) => dependency.requirement === "optional")
    .map((dependency) => ({
      sourceUnitId: unit.id,
      targetUnitId: dependency.unitId,
      available: selected.has(dependency.unitId),
      protocol: dependency.protocol,
      reason: dependency.reason,
    })));
  const applicationConnections = units.reduce((total, unit) => (
    total + (unit.runtime.capacity.databasePoolMax ?? 0) * unit.runtime.capacity.blueGreenReplicaMultiplier
  ), 0);
  if (applicationConnections > graph.lifecycle.connectionBudget.maximumApplicationConnections) {
    throw new Error(`${profileId} exceeds the application database connection budget`);
  }

  const body = {
    schemaVersion: 1 as const,
    kind: "workspace-deployment-profile" as const,
    id: spec.id,
    version: spec.version,
    label: spec.label,
    graphSha256: sha256(canonicalJson(graph)),
    unitIds: [...spec.unitIds],
    moduleKeys: [...new Set(units.flatMap((unit) => unit.moduleKeys))].sort(),
    runtimeDependencies: units.flatMap((unit) => unit.runtimeDependencies.map((dependency) => ({
      sourceUnitId: unit.id,
      ...dependency,
    }))),
    optionalRuntimeCapabilities,
    capacity: {
      memoryMiB: units.reduce((total, unit) => total + (unit.runtime.capacity.memoryMiB ?? 0), 0),
      blueGreenApplicationConnections: applicationConnections,
      reservedControlPlaneConnections: graph.lifecycle.connectionBudget.reservedControlPlaneConnections,
    },
    rollout: spec.rollout,
    units: units.map((unit) => ({
      id: unit.id,
      moduleKeys: unit.moduleKeys,
      moduleLabels: unit.moduleLabels,
      kind: unit.kind,
      maturity: unit.maturity,
      runtime: unit.runtime,
      runtimeDependencies: unit.runtimeDependencies,
      pageRoutes: unit.pageRoutes,
      apiPrefixes: unit.apiPrefixes,
    })),
  };
  return { ...body, profileSha256: sha256(canonicalJson(body)) };
}

export function listDeploymentProfiles() {
  return deploymentProfileSpecs.map((profile) => ({ id: profile.id, version: profile.version, label: profile.label }));
}
