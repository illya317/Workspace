import {
  buildWorkWorkspaceAnalysisSourceCatalog,
  canDiscoverWorkWorkspaceAnalysisSource,
  loadWorkWorkspaceAnalysisSource,
} from "@workspace/work/server";
import { createWorkspaceAnalysisSourceRpcHandler } from "@workspace/platform/server/workspace-analysis-source-rpc";

export const POST = createWorkspaceAnalysisSourceRpcHandler({
  ownerUnitId: "work",
  allowedCallerUnitIds: ["finance"],
  sourceCatalog: buildWorkWorkspaceAnalysisSourceCatalog(),
  canDiscover: canDiscoverWorkWorkspaceAnalysisSource,
  executeSource: loadWorkWorkspaceAnalysisSource,
});
