import {
  buildLibraryWorkspaceAnalysisSourceCatalog,
  canDiscoverLibraryWorkspaceAnalysisSource,
  loadLibraryWorkspaceAnalysisSource,
} from "@workspace/library/server";
import { createWorkspaceAnalysisSourceRpcHandler } from "@workspace/platform/server/workspace-analysis-source-rpc";

export const POST = createWorkspaceAnalysisSourceRpcHandler({
  ownerUnitId: "library",
  allowedCallerUnitIds: ["finance"],
  sourceCatalog: buildLibraryWorkspaceAnalysisSourceCatalog(),
  canDiscover: canDiscoverLibraryWorkspaceAnalysisSource,
  executeSource: loadLibraryWorkspaceAnalysisSource,
});
