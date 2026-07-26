import {
  canDiscoverHrWorkspaceAnalysisSource,
  buildHrWorkspaceAnalysisSourceCatalog,
} from "@workspace/hr/server/workspace-analysis-source-access";
import { loadHrWorkspaceAnalysisSource } from "@workspace/hr/server/workspace-analysis-source-executor";
import { createWorkspaceAnalysisSourceRpcHandler } from "@workspace/platform/server/workspace-analysis-source-rpc";

export const POST = createWorkspaceAnalysisSourceRpcHandler({
  ownerUnitId: "hr",
  allowedCallerUnitIds: ["finance"],
  sourceCatalog: buildHrWorkspaceAnalysisSourceCatalog(),
  canDiscover: canDiscoverHrWorkspaceAnalysisSource,
  executeSource: loadHrWorkspaceAnalysisSource,
});
