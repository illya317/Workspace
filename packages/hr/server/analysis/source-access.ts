import "server-only";

import type { WorkspaceAnalysisSourceDefinition } from "@workspace/platform/workspace-analysis-source-contract";
import { canEnterResource, evaluatePermissionAction } from "@workspace/platform/server/auth";
import { createWorkspaceAnalysisSourceCatalog } from "@workspace/platform/server/workspace-analysis-source-registry";

import { canReadHrPerformanceSummary } from "../performance-access";
import { isHrPerformanceWorkspaceAnalysisSourceKey } from "./performance-sources";
import { HR_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS } from "./sources";

export function buildHrWorkspaceAnalysisSourceCatalog() {
  const catalog = createWorkspaceAnalysisSourceCatalog(HR_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS);
  catalog.validateReferences();
  return catalog;
}

export async function canDiscoverHrWorkspaceAnalysisSource(input: {
  readonly requesterId: number;
  readonly targetType: "personal" | "department" | "project";
  readonly targetId: number;
  readonly source: WorkspaceAnalysisSourceDefinition;
}) {
  if (input.source.ownerModuleKey !== "hr") return false;
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
  if (isHrPerformanceWorkspaceAnalysisSourceKey(input.source.sourceKey) && input.targetType !== "personal") {
    return canReadHrPerformanceSummary(input.requesterId);
  }
  return true;
}
