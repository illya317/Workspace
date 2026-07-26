import type { DeployUnitNavigationManifest } from "@workspace/core/routing";

import { resolveDeployGraph, type DeployGraph } from "./deploy-graph";

export function createDeployUnitNavigationManifest(
  graph: DeployGraph = resolveDeployGraph(),
): DeployUnitNavigationManifest {
  return {
    schemaVersion: 1,
    units: graph.units
      .filter((unit) => unit.pageRoutes.length > 0)
      .map((unit) => ({
        id: unit.id,
        pagePrefixes: [...unit.pageRoutes],
      })),
  };
}
