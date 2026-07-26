import {
  buildExternalWorkspaceAnalysisSourceCatalog,
  canDiscoverExternalWorkspaceAnalysisSource,
  loadExternalWorkspaceAnalysisSource,
} from "@workspace/external/server";
import { createWorkspaceAnalysisSourceRpcHandler } from "@workspace/platform/server/workspace-analysis-source-rpc";

export const POST = createWorkspaceAnalysisSourceRpcHandler({
  ownerUnitId: "external",
  allowedCallerUnitIds: ["finance"],
  sourceCatalog: buildExternalWorkspaceAnalysisSourceCatalog(),
  canDiscover: canDiscoverExternalWorkspaceAnalysisSource,
  executeSource: loadExternalWorkspaceAnalysisSource,
});
