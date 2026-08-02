import path from "node:path";

import { resolveDeployGraph, type DeployGraph } from "./deploy-graph";

export interface DeployUnitImpact {
  affectedUnitIds: string[];
  buildableUnitIds: string[];
  blockedPlannedUnitIds: string[];
  typecheckScopes: string[];
  fullTypecheckRequired: boolean;
  failClosed: boolean;
  reasons: Array<{ file: string; reason: string; unitIds: string[] }>;
}

function normalizeRepositoryPath(value: string) {
  const normalized = value.trim().replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || normalized.includes("//") || normalized.split("/").includes("..")) {
    throw new Error(`Changed path is not repository-relative: ${value}`);
  }
  return normalized;
}

function isDocumentationPath(file: string) {
  const basename = path.posix.basename(file);
  return file.startsWith("docs/")
    || file.startsWith(".planning/")
    || ["AGENTS.md", "README.md", "ARCHITECTURE.md", "MODULE.md", "PLAN.md"].includes(basename);
}

function matchesRoot(file: string, root: string) {
  return root.endsWith("/") ? file.startsWith(root) : file === root;
}

function unitForGeneratedApp(file: string, graph: DeployGraph) {
  const match = file.match(/^apps\/([a-z][a-z0-9-]*)\//);
  if (!match) return null;
  return graph.units.some((unit) => unit.id === match[1]) ? match[1] : null;
}

function sharedReason(file: string) {
  if (file.startsWith("packages/core/")) return "shared-core";
  if (file.startsWith("packages/platform/")) return "shared-platform";
  if (file.startsWith("prisma/") || file.startsWith("generated/prisma/")) return "shared-schema";
  if (file === "package.json" || file === "package-lock.json" || file === ".node-version") return "shared-build-input";
  if (/^tsconfig(?:\.[a-z0-9-]+)?\.json$/.test(file) || file === "next.config.ts") return "shared-compiler-config";
  if (file === "app/layout.tsx" || file === "app/error.tsx" || file === "app/globals.css") return "shared-next-shell";
  if (file.startsWith("public/")) return "shared-public-asset";
  if (file.startsWith("scripts/deploy/") || file.startsWith("ops/") || file === ".cnb.yml") {
    return "shared-deploy-protocol";
  }
  return null;
}

function consumerClosure(seedUnitIds: Iterable<string>, graph: DeployGraph) {
  const affected = new Set(seedUnitIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of graph.contributorEdges) {
      if (!affected.has(edge.targetUnitId) || affected.has(edge.sourceUnitId)) continue;
      affected.add(edge.sourceUnitId);
      changed = true;
    }
  }
  return affected;
}

export function resolveDeployUnitImpact(
  changedFiles: readonly string[],
  graph: DeployGraph = resolveDeployGraph(),
): DeployUnitImpact {
  const normalizedFiles = [...new Set(changedFiles.map(normalizeRepositoryPath))].sort();
  const allUnitIds = graph.units.map((unit) => unit.id);
  const directUnits = new Set<string>();
  const reasons: DeployUnitImpact["reasons"] = [];
  let fullTypecheckRequired = false;
  let failClosed = false;

  if (normalizedFiles.length === 0) {
    allUnitIds.forEach((unitId) => directUnits.add(unitId));
    fullTypecheckRequired = true;
    failClosed = true;
    reasons.push({ file: "<empty-diff>", reason: "empty-diff-fail-closed", unitIds: [...allUnitIds] });
  }

  for (const file of normalizedFiles) {
    if (isDocumentationPath(file)) {
      reasons.push({ file, reason: "documentation-only", unitIds: [] });
      continue;
    }

    const shared = sharedReason(file);
    if (shared) {
      allUnitIds.forEach((unitId) => directUnits.add(unitId));
      fullTypecheckRequired = true;
      reasons.push({ file, reason: shared, unitIds: [...allUnitIds] });
      continue;
    }

    const generatedUnit = unitForGeneratedApp(file, graph);
    if (generatedUnit) {
      directUnits.add(generatedUnit);
      reasons.push({ file, reason: "generated-unit-app", unitIds: [generatedUnit] });
      continue;
    }

    const owners = graph.units
      .filter((unit) => unit.privateSourceRoots.some((root) => matchesRoot(file, root)))
      .map((unit) => unit.id);
    if (owners.length > 0) {
      owners.forEach((unitId) => directUnits.add(unitId));
      reasons.push({ file, reason: "unit-private-source", unitIds: owners });
      continue;
    }

    allUnitIds.forEach((unitId) => directUnits.add(unitId));
    fullTypecheckRequired = true;
    failClosed = true;
    reasons.push({ file, reason: "unmatched-code-fail-closed", unitIds: [...allUnitIds] });
  }

  const affected = consumerClosure(directUnits, graph);
  const affectedUnits = graph.units.filter((unit) => affected.has(unit.id));
  return {
    affectedUnitIds: affectedUnits.map((unit) => unit.id).sort(),
    buildableUnitIds: affectedUnits
      .filter((unit) => unit.maturity === "candidate" || unit.maturity === "active")
      .map((unit) => unit.id)
      .sort(),
    blockedPlannedUnitIds: affectedUnits
      .filter((unit) => unit.maturity === "planned")
      .map((unit) => unit.id)
      .sort(),
    typecheckScopes: [...new Set(affectedUnits.flatMap((unit) => unit.checks.typecheckScopes))].sort(),
    fullTypecheckRequired,
    failClosed,
    reasons,
  };
}
