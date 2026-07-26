import "server-only";

import { isResourceEnabled } from "../effective-module-registry";
import type { WorkspaceAnalysisSourceDefinition } from "../workspace-analysis-source-contract";

/**
 * Uses the source's existing protected-read resource as the runtime switch.
 * `isResourceEnabled` already folds an L2/resource state together with its
 * runtime parent and owning L1 module, so analysis never creates a second
 * permission or a parallel module-enabled rule.
 */
export function isWorkspaceAnalysisSourceRuntimeEnabled(
  source: WorkspaceAnalysisSourceDefinition,
) {
  return isResourceEnabled(source.authorization.resourceKey);
}
