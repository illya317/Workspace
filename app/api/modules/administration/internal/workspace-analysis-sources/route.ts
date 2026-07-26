import {
  buildAdministrationWorkspaceAnalysisSourceCatalog,
  canDiscoverAdministrationWorkspaceAnalysisSource,
  loadAdministrationWorkspaceAnalysisSource,
} from "@workspace/administration/server";
import { createWorkspaceAnalysisSourceRpcHandler } from "@workspace/platform/server/workspace-analysis-source-rpc";

export const POST = createWorkspaceAnalysisSourceRpcHandler({
  ownerUnitId: "administration",
  allowedCallerUnitIds: ["finance"],
  sourceCatalog: buildAdministrationWorkspaceAnalysisSourceCatalog(),
  canDiscover: canDiscoverAdministrationWorkspaceAnalysisSource,
  executeSource: loadAdministrationWorkspaceAnalysisSource,
});
