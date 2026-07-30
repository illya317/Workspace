import { createHash } from "node:crypto";

import type { AgentProfileIdentity } from "./execution";

export function buildAgentRuntimeAuditSnapshot(profile: AgentProfileIdentity | null) {
  if (!profile) {
    return {
      runtimeBindingId: null,
      runtimeConfigJson: null,
      runtimeConfigHash: null,
    };
  }

  const runtimeConfigJson = JSON.stringify({
    schemaVersion: 2,
    profileKey: profile.key,
    displayName: profile.displayName,
    roleName: profile.roleName,
    responsibilities: profile.responsibilities,
    actorEmployeeId: profile.actorEmployeeId,
    actorEmployeeName: profile.actorEmployeeName,
    kind: profile.runtime.kind,
    instructions: profile.runtime.instructions,
    capabilityKeys: [...profile.allowedToolKeys].sort(),
  });
  return {
    runtimeBindingId: profile.runtime.bindingId,
    runtimeConfigJson,
    runtimeConfigHash: createHash("sha256").update(runtimeConfigJson).digest("hex"),
  };
}
