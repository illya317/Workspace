import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

import { registeredModuleDefinitions } from "@workspace/platform/module-registry";
import {
  loadModuleImpactMap,
  type ModuleImpactDefinition,
  type ModuleImpactMap,
} from "../testing/module-impact-map";
import {
  DEPLOY_GRAPH_SCHEMA_VERSION,
  deployGraphControlPlane,
  deployUnitBlueprints,
  type DeployUnitBlueprint,
} from "./deploy-unit-spec";

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../..");
const SHARED_IMPACT_MODULES = new Set(["core", "platform"]);
const UNIT_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

type RegistryDefinition = (typeof registeredModuleDefinitions)[number];

export interface CrossUnitContributor {
  sourceUnitId: string;
  targetUnitId: string;
  importedPackage: string;
  files: string[];
}

export interface ResolvedDeployUnit {
  id: string;
  kind: DeployUnitBlueprint["kind"];
  maturity: DeployUnitBlueprint["maturity"];
  coordination: DeployUnitBlueprint["coordination"];
  registryPackages: string[];
  moduleKeys: string[];
  moduleLabels: string[];
  impactModules: string[];
  privateSourceRoots: string[];
  pageRoutes: string[];
  apiPrefixes: string[];
  compilerProjects: string[];
  checks: {
    typecheckScopes: string[];
    e2eSuites: string[];
    unmatchedChangePolicy: "fail-closed";
  };
  runtimeDependencies: DeployUnitBlueprint["runtimeDependencies"];
  runtime: DeployUnitBlueprint["runtime"];
}

export interface DeployGraph {
  schemaVersion: typeof DEPLOY_GRAPH_SCHEMA_VERSION;
  lifecycle: typeof deployGraphControlPlane;
  sharedImpactModules: string[];
  units: ResolvedDeployUnit[];
  contributorEdges: CrossUnitContributor[];
}

interface ResolveDeployGraphOptions {
  blueprints?: readonly DeployUnitBlueprint[];
  impactMap?: ModuleImpactMap;
  registry?: readonly RegistryDefinition[];
  repositoryRoot?: string;
}

function uniqueSorted(values: Iterable<string>) {
  return [...new Set(values)].sort();
}

function normalizeRepoPath(repositoryRoot: string, absolutePath: string) {
  return path.relative(repositoryRoot, absolutePath).replaceAll(path.sep, "/");
}

function assertNormalizedRoute(value: string, location: string) {
  if (!value.startsWith("/") || value.includes("//") || (value.length > 1 && value.endsWith("/"))) {
    throw new Error(`${location} must be a normalized absolute route: ${value}`);
  }
}

function registrationRoutes(definition: RegistryDefinition) {
  const routes: string[] = [];
  const moduleDef = definition.moduleDef;
  const isHeadless = Boolean(
    moduleDef && "presentation" in moduleDef && moduleDef.presentation === "headless",
  );
  if (!isHeadless) {
    if (moduleDef?.href) routes.push(moduleDef.href);
    for (const child of moduleDef?.children ?? []) routes.push(child.href);
  }
  for (const route of definition.routes ?? []) {
    routes.push(typeof route === "string" ? route : route.path);
  }
  return uniqueSorted(routes);
}

function registrationApiPrefixes(definition: RegistryDefinition) {
  const prefixes: string[] = [];
  const moduleDef = definition.moduleDef;
  if (moduleDef && "apiPrefixes" in moduleDef) prefixes.push(...(moduleDef.apiPrefixes ?? []));
  for (const child of moduleDef?.children ?? []) {
    if ("apiPrefixes" in child) prefixes.push(...(child.apiPrefixes ?? []));
  }
  for (const resource of definition.resourceDefs ?? []) {
    if ("apiPrefixes" in resource) prefixes.push(...(resource.apiPrefixes ?? []));
  }
  for (const guard of definition.apiGuards ?? []) prefixes.push(guard.pathPrefix);
  for (const route of definition.apiRoutes ?? []) prefixes.push(route.pathPrefix);
  return uniqueSorted(prefixes);
}

function tsconfigForRegistryPackage(repositoryRoot: string, packageName: string) {
  if (packageName.startsWith("@workspace/platform:")) {
    return path.join(repositoryRoot, "packages/platform/tsconfig.json");
  }
  const packageScope = packageName.match(/^@workspace\/([a-z0-9-]+)$/)?.[1];
  if (!packageScope) throw new Error(`Unsupported registry package selector: ${packageName}`);
  return path.join(repositoryRoot, `packages/${packageScope}/tsconfig.json`);
}

function resolveReferenceConfig(configPath: string, referencePath: string) {
  const absoluteReference = path.resolve(path.dirname(configPath), referencePath);
  if (absoluteReference.endsWith(".json")) return absoluteReference;
  if (fs.existsSync(absoluteReference) && fs.statSync(absoluteReference).isDirectory()) {
    return path.join(absoluteReference, "tsconfig.json");
  }
  return `${absoluteReference}.json`;
}

function compilerClosure(repositoryRoot: string, packageNames: readonly string[]) {
  const visited = new Set<string>();
  const ordered: string[] = [];

  function visit(configPath: string) {
    const normalizedConfigPath = path.normalize(configPath);
    if (visited.has(normalizedConfigPath)) return;
    if (!fs.existsSync(normalizedConfigPath)) {
      throw new Error(`Deploy graph references missing TypeScript project: ${normalizeRepoPath(repositoryRoot, normalizedConfigPath)}`);
    }
    visited.add(normalizedConfigPath);
    const config = JSON.parse(fs.readFileSync(normalizedConfigPath, "utf8")) as {
      references?: Array<{ path: string }>;
    };
    for (const reference of config.references ?? []) {
      visit(resolveReferenceConfig(normalizedConfigPath, reference.path));
    }
    ordered.push(normalizeRepoPath(repositoryRoot, normalizedConfigPath));
  }

  for (const packageName of packageNames) visit(tsconfigForRegistryPackage(repositoryRoot, packageName));
  return uniqueSorted(ordered);
}

function typecheckScopes(packageNames: readonly string[]) {
  return uniqueSorted(packageNames.map((packageName) => {
    if (packageName.startsWith("@workspace/platform:")) return "platform";
    const scope = packageName.match(/^@workspace\/([a-z0-9-]+)$/)?.[1];
    if (!scope) throw new Error(`Unsupported registry package selector: ${packageName}`);
    return scope;
  }));
}

function e2eSuitesForModules(impactMap: ModuleImpactMap, moduleIds: readonly string[]) {
  const ownedModules = new Set(moduleIds);
  return uniqueSorted(impactMap.rules.flatMap((rule) => (
    rule.modules.some((moduleId) => ownedModules.has(moduleId)) ? rule.requiredSuites : []
  )));
}

function sourceRootsForModules(impactMap: ModuleImpactMap, moduleIds: readonly string[]) {
  const modulesById = new Map(impactMap.modules.map((module) => [module.id, module]));
  const roots: string[] = [];
  for (const moduleId of moduleIds) {
    const impactModule = modulesById.get(moduleId);
    if (!impactModule) throw new Error(`Deploy unit references missing impact module: ${moduleId}`);
    roots.push(...impactModule.roots.prefixes, ...impactModule.roots.files);
  }
  return uniqueSorted(roots);
}

function validateBlueprints(
  blueprints: readonly DeployUnitBlueprint[],
  registry: readonly RegistryDefinition[],
  impactMap: ModuleImpactMap,
  repositoryRoot: string,
) {
  const seenIds = new Set<string>();
  const seenRegistryPackages = new Map<string, string>();
  const seenImpactModules = new Map<string, string>();
  const seenPorts = new Map<number, string>();
  const seenAssetPrefixes = new Map<string, string>();
  let blueGreenApplicationConnections = 0;

  for (const blueprint of blueprints) {
    if (!UNIT_ID_PATTERN.test(blueprint.id)) throw new Error(`Invalid deploy unit id: ${blueprint.id}`);
    if (seenIds.has(blueprint.id)) throw new Error(`Duplicate deploy unit id: ${blueprint.id}`);
    seenIds.add(blueprint.id);
    if (blueprint.registryPackages.length === 0) throw new Error(`${blueprint.id} must own a registry package`);
    if (blueprint.impactModules.length === 0) throw new Error(`${blueprint.id} must own an impact module`);
    for (const [slot, slotSpec] of Object.entries(blueprint.runtime.slots)) {
      if (!Number.isInteger(slotSpec.port) || slotSpec.port < 1024 || slotSpec.port > 65535) {
        throw new Error(`${blueprint.id} ${slot} has invalid runtime port: ${slotSpec.port}`);
      }
      const portOwner = seenPorts.get(slotSpec.port);
      if (portOwner) throw new Error(`Runtime port ${slotSpec.port} is shared by ${portOwner} and ${blueprint.id}:${slot}`);
      seenPorts.set(slotSpec.port, `${blueprint.id}:${slot}`);
    }
    if (blueprint.kind === "business-l1" || blueprint.kind === "platform-l1") {
      if (!blueprint.runtime.assetPrefix) throw new Error(`${blueprint.id} Next zone must declare an asset prefix`);
    }
    if (blueprint.kind === "workspace-shell" && blueprint.runtime.assetPrefix !== null) {
      throw new Error("workspace-shell is the default zone and must not declare an asset prefix");
    }
    if (blueprint.runtime.assetPrefix) {
      assertNormalizedRoute(blueprint.runtime.assetPrefix, `${blueprint.id}.runtime.assetPrefix`);
      const assetOwner = seenAssetPrefixes.get(blueprint.runtime.assetPrefix);
      if (assetOwner) throw new Error(`Asset prefix ${blueprint.runtime.assetPrefix} is shared by ${assetOwner} and ${blueprint.id}`);
      seenAssetPrefixes.set(blueprint.runtime.assetPrefix, blueprint.id);
    }
    const { memoryMiB, databasePoolMax, blueGreenReplicaMultiplier } = blueprint.runtime.capacity;
    if (!Number.isInteger(memoryMiB) || (memoryMiB ?? 0) <= 0) {
      throw new Error(`${blueprint.id} runtime memory capacity is not allocated`);
    }
    if (!Number.isInteger(databasePoolMax) || (databasePoolMax ?? 0) <= 0) {
      throw new Error(`${blueprint.id} database pool capacity is not allocated`);
    }
    if (blueGreenReplicaMultiplier !== 2) throw new Error(`${blueprint.id} blue-green multiplier must be 2`);
    const slo = blueprint.runtime.slo;
    if (!(slo.availabilityPercent > 0 && slo.availabilityPercent <= 100)
      || !(slo.maximumErrorRatePercent >= 0 && slo.maximumErrorRatePercent < 100)
      || !Number.isInteger(slo.p95LatencyMs) || slo.p95LatencyMs <= 0
      || !Number.isInteger(slo.canaryObservationMinutes) || slo.canaryObservationMinutes <= 0
      || !Number.isInteger(slo.recoveryTimeObjectiveMinutes) || slo.recoveryTimeObjectiveMinutes <= 0
      || !Number.isInteger(slo.recoveryPointObjectiveMinutes) || slo.recoveryPointObjectiveMinutes <= 0) {
      throw new Error(`${blueprint.id} runtime SLO is invalid`);
    }
    blueGreenApplicationConnections += Number(databasePoolMax) * blueGreenReplicaMultiplier;
    if (blueprint.maturity === "active" || blueprint.maturity === "candidate") {
      if (!fs.existsSync(path.join(repositoryRoot, blueprint.runtime.appRoot))) {
        throw new Error(`${blueprint.id} is ${blueprint.maturity} but app root is missing: ${blueprint.runtime.appRoot}`);
      }
    }
    for (const packageName of blueprint.registryPackages) {
      const owner = seenRegistryPackages.get(packageName);
      if (owner) throw new Error(`Registry package ${packageName} is owned by both ${owner} and ${blueprint.id}`);
      seenRegistryPackages.set(packageName, blueprint.id);
    }
    for (const moduleId of blueprint.impactModules) {
      const owner = seenImpactModules.get(moduleId);
      if (owner) throw new Error(`Impact module ${moduleId} is owned by both ${owner} and ${blueprint.id}`);
      seenImpactModules.set(moduleId, blueprint.id);
    }
  }

  for (const blueprint of blueprints) {
    const dependencyIds = new Set<string>();
    for (const dependency of blueprint.runtimeDependencies) {
      if (!seenIds.has(dependency.unitId)) {
        throw new Error(`${blueprint.id} runtime dependency references unknown unit: ${dependency.unitId}`);
      }
      if (dependency.unitId === blueprint.id) throw new Error(`${blueprint.id} cannot depend on itself at runtime`);
      if (dependencyIds.has(dependency.unitId)) {
        throw new Error(`${blueprint.id} repeats runtime dependency: ${dependency.unitId}`);
      }
      dependencyIds.add(dependency.unitId);
      if (!dependency.reason.trim()) throw new Error(`${blueprint.id}->${dependency.unitId} runtime dependency needs a reason`);
    }
  }

  if (blueGreenApplicationConnections > deployGraphControlPlane.connectionBudget.maximumApplicationConnections) {
    throw new Error(
      `Full-fleet blue-green database pools require ${blueGreenApplicationConnections} connections, above the application budget`,
    );
  }
  const requiredPostgresqlConnections = blueGreenApplicationConnections
    + deployGraphControlPlane.connectionBudget.reservedControlPlaneConnections;
  if (requiredPostgresqlConnections > deployGraphControlPlane.connectionBudget.minimumPostgresqlMaxConnections) {
    throw new Error(
      `Full-fleet connection budget requires PostgreSQL max_connections >= ${requiredPostgresqlConnections}`,
    );
  }

  const registryPackageNames = new Set(registry.map((definition) => definition.packageName));
  const missingRegistryPackages = [...registryPackageNames].filter((packageName) => !seenRegistryPackages.has(packageName));
  const unknownRegistryPackages = [...seenRegistryPackages.keys()].filter((packageName) => !registryPackageNames.has(packageName));
  if (missingRegistryPackages.length > 0) {
    throw new Error(`Deploy graph leaves registry packages unowned: ${missingRegistryPackages.sort().join(", ")}`);
  }
  if (unknownRegistryPackages.length > 0) {
    throw new Error(`Deploy graph references unknown registry packages: ${unknownRegistryPackages.sort().join(", ")}`);
  }

  const requiredImpactModules = impactMap.modules
    .map((module) => module.id)
    .filter((moduleId) => !SHARED_IMPACT_MODULES.has(moduleId));
  const missingImpactModules = requiredImpactModules.filter((moduleId) => !seenImpactModules.has(moduleId));
  const unknownImpactModules = [...seenImpactModules.keys()].filter((moduleId) => (
    !impactMap.modules.some((module) => module.id === moduleId)
  ));
  if (missingImpactModules.length > 0) {
    throw new Error(`Deploy graph leaves impact modules unowned: ${missingImpactModules.sort().join(", ")}`);
  }
  if (unknownImpactModules.length > 0) {
    throw new Error(`Deploy graph references unknown impact modules: ${unknownImpactModules.sort().join(", ")}`);
  }
}

function routeConflict(left: string, right: string) {
  if (left === "/" || right === "/") return false;
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

export function validateRouteOwnership(units: readonly Pick<ResolvedDeployUnit, "id" | "pageRoutes" | "apiPrefixes" | "runtime">[]) {
  const claims = units.flatMap((unit) => [
    ...unit.pageRoutes.map((route) => ({ unitId: unit.id, kind: "page", route })),
    ...unit.apiPrefixes.map((route) => ({ unitId: unit.id, kind: "api", route })),
    ...(unit.runtime.assetPrefix ? [{ unitId: unit.id, kind: "asset", route: unit.runtime.assetPrefix }] : []),
  ]);
  for (const claim of claims) assertNormalizedRoute(claim.route, `${claim.unitId} ${claim.kind} claim`);
  for (let leftIndex = 0; leftIndex < claims.length; leftIndex += 1) {
    const left = claims[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < claims.length; rightIndex += 1) {
      const right = claims[rightIndex];
      if (left.unitId === right.unitId) continue;
      if (routeConflict(left.route, right.route)) {
        throw new Error(
          `Route ownership conflict: ${left.unitId} ${left.kind} ${left.route} overlaps ${right.unitId} ${right.kind} ${right.route}`,
        );
      }
    }
  }
}

function filesUnderRoot(repositoryRoot: string, root: string): string[] {
  const absoluteRoot = path.join(repositoryRoot, root);
  if (!fs.existsSync(absoluteRoot)) return [];
  const stat = fs.statSync(absoluteRoot);
  if (stat.isFile()) return /\.(?:[mc]?ts|tsx)$/.test(root) ? [root] : [];
  const files: string[] = [];
  function visit(directory: string) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolutePath);
      else if (/\.(?:[mc]?ts|tsx)$/.test(entry.name)) files.push(normalizeRepoPath(repositoryRoot, absolutePath));
    }
  }
  visit(absoluteRoot);
  return files;
}

function importedWorkspacePackages(repositoryRoot: string, sourceFile: string) {
  const source = fs.readFileSync(path.join(repositoryRoot, sourceFile), "utf8");
  const importedFiles = ts.preProcessFile(source, true, true).importedFiles.map((item) => item.fileName);
  return uniqueSorted(importedFiles.flatMap((specifier) => {
    const match = specifier.match(/^@workspace\/([a-z0-9-]+)/);
    return match ? [`@workspace/${match[1]}`] : [];
  }));
}

function resolveContributors(repositoryRoot: string, units: readonly ResolvedDeployUnit[]) {
  const physicalPackageOwner = new Map<string, string>();
  for (const unit of units) {
    for (const packageName of unit.registryPackages) {
      if (/^@workspace\/[a-z0-9-]+$/.test(packageName)) physicalPackageOwner.set(packageName, unit.id);
    }
  }
  const edgeFiles = new Map<string, Set<string>>();
  for (const unit of units) {
    const files = uniqueSorted(unit.privateSourceRoots.flatMap((root) => filesUnderRoot(repositoryRoot, root)));
    for (const sourceFile of files) {
      for (const importedPackage of importedWorkspacePackages(repositoryRoot, sourceFile)) {
        const targetUnitId = physicalPackageOwner.get(importedPackage);
        if (!targetUnitId || targetUnitId === unit.id) continue;
        const key = `${unit.id}\u0000${targetUnitId}\u0000${importedPackage}`;
        const sources = edgeFiles.get(key) ?? new Set<string>();
        sources.add(sourceFile);
        edgeFiles.set(key, sources);
      }
    }
  }
  return [...edgeFiles.entries()].map(([key, files]) => {
    const [sourceUnitId, targetUnitId, importedPackage] = key.split("\u0000");
    return { sourceUnitId, targetUnitId, importedPackage, files: [...files].sort() };
  }).sort((left, right) => (
    `${left.sourceUnitId}:${left.targetUnitId}:${left.importedPackage}`
      .localeCompare(`${right.sourceUnitId}:${right.targetUnitId}:${right.importedPackage}`)
  ));
}

export function resolveDeployGraph(options: ResolveDeployGraphOptions = {}): DeployGraph {
  const repositoryRoot = options.repositoryRoot ?? REPOSITORY_ROOT;
  const registry = options.registry ?? registeredModuleDefinitions;
  const impactMap = options.impactMap ?? loadModuleImpactMap(path.join(repositoryRoot, "scripts/testing/module-impact-map.json"));
  const blueprints = options.blueprints ?? deployUnitBlueprints;
  validateBlueprints(blueprints, registry, impactMap, repositoryRoot);
  const registryByPackage = new Map(registry.map((definition) => [definition.packageName, definition]));

  const units = blueprints.map((blueprint): ResolvedDeployUnit => {
    const definitions = blueprint.registryPackages.map((packageName) => {
      const definition = registryByPackage.get(packageName);
      if (!definition) throw new Error(`Missing registry definition: ${packageName}`);
      return definition;
    });
    return {
      id: blueprint.id,
      kind: blueprint.kind,
      maturity: blueprint.maturity,
      coordination: blueprint.coordination,
      registryPackages: [...blueprint.registryPackages],
      moduleKeys: uniqueSorted(definitions.flatMap((definition) => (
        definition.moduleDef?.key ? [definition.moduleDef.key] : []
      ))),
      moduleLabels: uniqueSorted(definitions.flatMap((definition) => (
        definition.moduleDef?.label ? [definition.moduleDef.label] : []
      ))),
      impactModules: [...blueprint.impactModules].sort(),
      privateSourceRoots: sourceRootsForModules(impactMap, blueprint.impactModules),
      pageRoutes: uniqueSorted(definitions.flatMap(registrationRoutes)),
      apiPrefixes: uniqueSorted(definitions.flatMap(registrationApiPrefixes)),
      compilerProjects: compilerClosure(repositoryRoot, blueprint.registryPackages),
      checks: {
        typecheckScopes: uniqueSorted([
          ...typecheckScopes(blueprint.registryPackages),
          ...(blueprint.runtime.engine === "next-standalone" ? [`app-${blueprint.id}`] : []),
        ]),
        e2eSuites: e2eSuitesForModules(impactMap, blueprint.impactModules),
        unmatchedChangePolicy: "fail-closed",
      },
      runtimeDependencies: [...blueprint.runtimeDependencies]
        .sort((left, right) => left.unitId.localeCompare(right.unitId)),
      runtime: blueprint.runtime,
    };
  });
  validateRouteOwnership(units);

  const contributorEdges = resolveContributors(repositoryRoot, units);
  const promotionBlockingContributorEdges = contributorEdges.filter((edge) => (
    units.find((unit) => unit.id === edge.sourceUnitId)?.maturity !== "planned"
  ));
  if (promotionBlockingContributorEdges.length > 0) {
    throw new Error(
      `Candidate or active deploy units still bundle cross-unit contributors: ${promotionBlockingContributorEdges
        .map((edge) => `${edge.sourceUnitId}->${edge.targetUnitId}`)
        .join(", ")}`,
    );
  }

  return {
    schemaVersion: DEPLOY_GRAPH_SCHEMA_VERSION,
    lifecycle: deployGraphControlPlane,
    sharedImpactModules: [...SHARED_IMPACT_MODULES].sort(),
    units,
    contributorEdges,
  };
}

export function summarizeDeployGraph(graph: DeployGraph) {
  const blueGreenApplicationConnections = graph.units.reduce((total, unit) => (
    total + (unit.runtime.capacity.databasePoolMax ?? 0) * unit.runtime.capacity.blueGreenReplicaMultiplier
  ), 0);
  return {
    schemaVersion: graph.schemaVersion,
    deployUnitCount: graph.units.length,
    activeUnitCount: graph.units.filter((unit) => unit.maturity === "active").length,
    candidateUnitCount: graph.units.filter((unit) => unit.maturity === "candidate").length,
    plannedUnitCount: graph.units.filter((unit) => unit.maturity === "planned").length,
    frozenUnitIds: graph.units
      .filter((unit) => unit.coordination === "frozen-final-handoff")
      .map((unit) => unit.id),
    contributorEdgeCount: graph.contributorEdges.length,
    blueGreenApplicationConnections,
    reservedControlPlaneConnections: graph.lifecycle.connectionBudget.reservedControlPlaneConnections,
  };
}
