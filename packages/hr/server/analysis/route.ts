import "server-only";

type WorkspaceAnalysisSourceRouteContext = {
  readonly params?: Promise<Record<string, string | string[]>>;
};

type WorkspaceAnalysisSourceRouteHandler = (
  request: Request,
  runtimeContext?: WorkspaceAnalysisSourceRouteContext,
) => Promise<Response>;

async function buildHrWorkspaceAnalysisSourceRoute(): Promise<WorkspaceAnalysisSourceRouteHandler> {
  const [rpc, access, executor] = await Promise.all([
    import("@workspace/platform/server/workspace-analysis-source-rpc"),
    import("./source-access"),
    import("./source-executor"),
  ]);

  return rpc.createWorkspaceAnalysisSourceRpcHandler({
    ownerUnitId: "hr",
    allowedCallerUnitIds: ["finance"],
    sourceCatalog: access.buildHrWorkspaceAnalysisSourceCatalog(),
    canDiscover: access.canDiscoverHrWorkspaceAnalysisSource,
    executeSource: executor.loadHrWorkspaceAnalysisSource,
  });
}

export function createHrWorkspaceAnalysisSourceRoute(): WorkspaceAnalysisSourceRouteHandler {
  let routePromise: Promise<WorkspaceAnalysisSourceRouteHandler> | undefined;

  return async function hrWorkspaceAnalysisSourceRoute(request, runtimeContext) {
    routePromise ??= buildHrWorkspaceAnalysisSourceRoute();
    const route = await routePromise;
    return route(request, runtimeContext);
  };
}
