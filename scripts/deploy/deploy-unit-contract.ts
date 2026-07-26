import { createHash } from "node:crypto";

import {
  resolveDeployGraph,
  type DeployGraph,
  type ResolvedDeployUnit,
} from "./deploy-graph";

export const DEPLOY_UNIT_CONTRACT_SCHEMA_VERSION = 1 as const;

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => [key, canonicalValue(nested)]));
}

export function canonicalJson(value: unknown) {
  return JSON.stringify(canonicalValue(value));
}

export function sha256Json(value: unknown) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function publicRoute(basePath: string, route: string) {
  return route === "/" ? basePath : `${basePath}${route}`;
}

function contributorBlockers(graph: DeployGraph, unitId: string) {
  return graph.contributorEdges
    .filter((edge) => edge.sourceUnitId === unitId)
    .map((edge) => ({
      targetUnitId: edge.targetUnitId,
      importedPackage: edge.importedPackage,
      files: edge.files,
    }));
}

export interface DeployUnitContract {
  schemaVersion: typeof DEPLOY_UNIT_CONTRACT_SCHEMA_VERSION;
  kind: "workspace-deploy-unit-contract";
  graphSha256: string;
  id: string;
  unitKind: ResolvedDeployUnit["kind"];
  maturity: ResolvedDeployUnit["maturity"];
  coordination: ResolvedDeployUnit["coordination"];
  moduleKeys: string[];
  moduleLabels: string[];
  build: {
    appRoot: string;
    output: "node-bundle" | "standalone";
    basePath: string;
    assetPrefix: string | null;
    deploymentIdSource: "artifact-manifest";
  };
  runtime: ResolvedDeployUnit["runtime"];
  routes: {
    pagePrefixes: string[];
    apiPrefixes: string[];
    assetPrefix: string | null;
  };
  compiler: {
    projects: string[];
    typecheckScopes: string[];
  };
  checks: ResolvedDeployUnit["checks"];
  runtimeDependencies: ResolvedDeployUnit["runtimeDependencies"];
  controlPlane: {
    authority: string;
    policy: "require-existing";
    minimumSchemaReceipt: string;
  };
  readiness: {
    contributorBlockers: ReturnType<typeof contributorBlockers>;
  };
}

export function resolveDeployUnitContract(unitId: string, graph = resolveDeployGraph()): DeployUnitContract {
  const unit = graph.units.find((candidate) => candidate.id === unitId);
  if (!unit) throw new Error(`Unknown deploy unit: ${unitId}`);
  const basePath = graph.lifecycle.gateway.basePath;
  return {
    schemaVersion: DEPLOY_UNIT_CONTRACT_SCHEMA_VERSION,
    kind: "workspace-deploy-unit-contract",
    graphSha256: sha256Json(graph),
    id: unit.id,
    unitKind: unit.kind,
    maturity: unit.maturity,
    coordination: unit.coordination,
    moduleKeys: unit.moduleKeys,
    moduleLabels: unit.moduleLabels,
    build: {
      appRoot: unit.runtime.appRoot,
      output: unit.runtime.engine === "next-standalone" ? "standalone" : "node-bundle",
      basePath,
      assetPrefix: unit.runtime.assetPrefix,
      deploymentIdSource: "artifact-manifest",
    },
    runtime: unit.runtime,
    routes: {
      pagePrefixes: unit.pageRoutes.map((route) => publicRoute(basePath, route)),
      apiPrefixes: unit.apiPrefixes.map((route) => publicRoute(basePath, route)),
      assetPrefix: unit.runtime.assetPrefix,
    },
    compiler: {
      projects: unit.compilerProjects,
      typecheckScopes: unit.checks.typecheckScopes,
    },
    checks: unit.checks,
    runtimeDependencies: unit.runtimeDependencies,
    controlPlane: {
      authority: graph.lifecycle.lifecycleOwner,
      policy: "require-existing",
      minimumSchemaReceipt: graph.lifecycle.minimumSchemaReceipt,
    },
    readiness: {
      contributorBlockers: contributorBlockers(graph, unit.id),
    },
  };
}
