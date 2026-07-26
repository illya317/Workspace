import {
  buildProductionWorkspaceAnalysisSourceCatalog,
  canDiscoverProductionWorkspaceAnalysisSource,
  loadProductionWorkspaceAnalysisSource,
} from "@workspace/production/server";
import { createWorkspaceAnalysisSourceRpcHandler } from "@workspace/platform/server/workspace-analysis-source-rpc";

export const POST = createWorkspaceAnalysisSourceRpcHandler({
  ownerUnitId: "production",
  allowedCallerUnitIds: ["finance"],
  sourceCatalog: buildProductionWorkspaceAnalysisSourceCatalog(),
  canDiscover: canDiscoverProductionWorkspaceAnalysisSource,
  executeSource: loadProductionWorkspaceAnalysisSource,
});
