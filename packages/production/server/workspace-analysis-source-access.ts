import "server-only";

import type { WorkspaceAnalysisSourceDefinition } from "@workspace/platform/workspace-analysis-source-contract";
import { canEnterResource, evaluatePermissionAction } from "@workspace/platform/server/auth";

export async function canDiscoverProductionWorkspaceAnalysisSource(input: {
  readonly requesterId: number;
  readonly source: WorkspaceAnalysisSourceDefinition;
}) {
  if (input.source.ownerModuleKey !== "production") return false;
  for (const action of input.source.authorization.requiredActions) {
    const allowed = action === "entry"
      ? await canEnterResource(input.requesterId, input.source.authorization.resourceKey)
      : await evaluatePermissionAction(input.requesterId, input.source.authorization.resourceKey, action, {
          projection: input.source.authorization.projection,
        });
    if (!allowed) return false;
  }
  return true;
}
