import { createHash } from "node:crypto";

import { resolveDeployUnitImpact } from "./deploy-unit-impact";
import { resolveDeployGraph } from "./deploy-graph";
import { resolveDeploymentProfile } from "./deployment-profile";
import { canonicalJson } from "./deploy-unit-contract";

export function resolveDeploymentProfileRollout(profileId: string, changedFiles: readonly string[]) {
  const profile = resolveDeploymentProfile(profileId);
  const impact = resolveDeployUnitImpact(changedFiles);
  const profileUnits = new Set(profile.unitIds);
  const initialTargetUnitIds = impact.buildableUnitIds.filter((unitId) => profileUnits.has(unitId));
  const signedRpcClosure = resolveSignedInternalRpcClosure(initialTargetUnitIds);
  const missingSignedRpcUnits = [...signedRpcClosure].filter((unitId) => !profileUnits.has(unitId)).sort();
  if (missingSignedRpcUnits.length > 0) {
    throw new Error(
      `Deployment profile ${profile.id} omits signed internal RPC rollout closure: ${missingSignedRpcUnits.join(", ")}; use a profile containing the complete closure`,
    );
  }
  const targetUnitIds = [...new Set([...initialTargetUnitIds, ...signedRpcClosure])].sort();
  const targetSet = new Set(targetUnitIds);
  const verificationUnitIds = profile.units
    .filter((unit) => targetSet.has(unit.id) || unit.runtimeDependencies.some((dependency) => targetSet.has(dependency.unitId)))
    .map((unit) => unit.id)
    .sort();
  const canaryObservationMinutes = profile.units
    .filter((unit) => verificationUnitIds.includes(unit.id))
    .reduce((maximum, unit) => Math.max(maximum, unit.runtime.slo.canaryObservationMinutes), 0);
  const body = {
    schemaVersion: 1 as const,
    kind: "workspace-deployment-profile-rollout" as const,
    profile: { id: profile.id, version: profile.version, sha256: profile.profileSha256 },
    changedFiles: [...new Set(changedFiles)].sort(),
    targetUnitIds,
    verificationUnitIds,
    fullProfileFanout: impact.fullTypecheckRequired,
    failClosed: impact.failClosed,
    canaryObservationMinutes,
    strategy: profile.rollout.strategy,
    steps: targetUnitIds.length === 0 ? [] : [
      { id: "control-plane-floor", unitIds: [], action: "assert-compatible-control-plane" },
      { id: "build", unitIds: targetUnitIds, action: "build-sign-and-attest" },
      { id: "release-set", unitIds: profile.unitIds, action: "assemble-exact-profile-release-set" },
      { id: "shadow", unitIds: targetUnitIds, action: "start-inactive-slots" },
      { id: "dependency-probes", unitIds: verificationUnitIds, action: "run-profile-contract-probes" },
      { id: "observe", unitIds: verificationUnitIds, action: "assert-slo-and-dr-evidence" },
      { id: "cutover", unitIds: targetUnitIds, action: "atomic-gateway-generation" },
      { id: "rollback-anchor", unitIds: targetUnitIds, action: "retain-previous-unit-states" },
    ],
  };
  return { ...body, rolloutSha256: createHash("sha256").update(canonicalJson(body)).digest("hex") };
}

function resolveSignedInternalRpcClosure(initialUnitIds: readonly string[]) {
  const graph = resolveDeployGraph();
  const edges = graph.units.flatMap((unit) => unit.runtimeDependencies
    .filter((dependency) => dependency.protocol === "signed-internal-rpc")
    .map((dependency) => [unit.id, dependency.unitId] as const));
  const participants = new Set(edges.flat());
  const closure = new Set(initialUnitIds.filter((unitId) => participants.has(unitId)));
  let changed = true;
  while (changed) {
    changed = false;
    for (const [left, right] of edges) {
      if (!closure.has(left) && !closure.has(right)) continue;
      if (!closure.has(left)) {
        closure.add(left);
        changed = true;
      }
      if (!closure.has(right)) {
        closure.add(right);
        changed = true;
      }
    }
  }
  return closure;
}
