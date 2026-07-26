import "server-only";

import type { WorkspaceAnalysisSourceDefinition } from "@workspace/platform/workspace-analysis-source-contract";
import { createWorkspaceAnalysisSourceCatalog } from "@workspace/platform/server/workspace-analysis-source-registry";

import { checkLibraryRead } from "./permissions";
import { LIBRARY_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS } from "./workspace-analysis-sources";

export function buildLibraryWorkspaceAnalysisSourceCatalog() {
  const catalog = createWorkspaceAnalysisSourceCatalog(LIBRARY_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS);
  catalog.validateReferences();
  return catalog;
}

export function canDiscoverLibraryWorkspaceAnalysisSource(input: {
  readonly requesterId: number;
  readonly targetType: "personal" | "department" | "project";
  readonly source: WorkspaceAnalysisSourceDefinition;
}) {
  if (input.source.ownerModuleKey !== "library" || !input.source.scopeBindings[input.targetType]) return false;
  return checkLibraryRead(input.requesterId);
}
