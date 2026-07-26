import "server-only";

import type { WorkspaceAnalysisSourceDefinition } from "@workspace/platform/workspace-analysis-source-contract";
import { canEnterResource, evaluatePermissionAction } from "@workspace/platform/server/auth";
import { createWorkspaceAnalysisSourceCatalog } from "@workspace/platform/server/workspace-analysis-source-registry";

import { ADMINISTRATION_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS } from "./workspace-analysis-sources";

export function buildAdministrationWorkspaceAnalysisSourceCatalog() {
  const catalog = createWorkspaceAnalysisSourceCatalog(ADMINISTRATION_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS);
  catalog.validateReferences();
  return catalog;
}

export async function canDiscoverAdministrationWorkspaceAnalysisSource(input: {
  readonly requesterId: number;
  readonly source: WorkspaceAnalysisSourceDefinition;
}) {
  if (input.source.ownerModuleKey !== "administration") return false;
  for (const action of input.source.authorization.requiredActions) {
    const allowed = action === "entry"
      ? await canEnterResource(input.requesterId, input.source.authorization.resourceKey)
      : await evaluatePermissionAction(
          input.requesterId,
          input.source.authorization.resourceKey,
          action,
          { projection: input.source.authorization.projection },
        );
    if (!allowed) return false;
  }
  return true;
}
