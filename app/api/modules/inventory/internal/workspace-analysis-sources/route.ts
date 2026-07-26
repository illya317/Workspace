import {
  buildInventoryWorkspaceAnalysisSourceCatalog,
  canDiscoverInventoryWorkspaceAnalysisSource,
  loadInventoryWorkspaceAnalysisSource,
} from "@workspace/inventory/server";
import { createWorkspaceAnalysisSourceRpcHandler } from "@workspace/platform/server/workspace-analysis-source-rpc";

export const POST = createWorkspaceAnalysisSourceRpcHandler({
  ownerUnitId: "inventory",
  allowedCallerUnitIds: ["finance"],
  sourceCatalog: buildInventoryWorkspaceAnalysisSourceCatalog(),
  canDiscover: canDiscoverInventoryWorkspaceAnalysisSource,
  executeSource: loadInventoryWorkspaceAnalysisSource,
});
