import path from "node:path";
import ts from "typescript";

import type {
  SourceCodeAnalysisDependencyDirection,
  SourceCodeAnalysisDependencyEdge,
  SourceCodeAnalysisDependencyEvidence,
  SourceCodeAnalysisDependencyFileCycle,
  SourceCodeAnalysisDependencyKind,
  SourceCodeAnalysisReciprocalRoleDependency,
  SourceCodeAnalysisRole,
} from "../../../packages/platform/source-code-analysis-contract";

export interface DependencySourceFile {
  path: string;
  text: string;
  moduleKey: string;
  role: SourceCodeAnalysisRole;
}

interface SourceImportReference {
  specifier: string;
  kind: SourceCodeAnalysisDependencyKind;
}

function importDeclarationIsTypeOnly(node: ts.ImportDeclaration) {
  if (node.importClause?.isTypeOnly) return true;
  if (node.importClause?.name || !node.importClause?.namedBindings || ts.isNamespaceImport(node.importClause.namedBindings)) {
    return false;
  }
  return node.importClause.namedBindings.elements.length > 0
    && node.importClause.namedBindings.elements.every((element) => element.isTypeOnly);
}

function exportDeclarationIsTypeOnly(node: ts.ExportDeclaration) {
  if (node.isTypeOnly) return true;
  return Boolean(node.exportClause
    && ts.isNamedExports(node.exportClause)
    && node.exportClause.elements.length > 0
    && node.exportClause.elements.every((element) => element.isTypeOnly));
}

function importReferences(file: DependencySourceFile) {
  if (!/\.(?:[cm]?[jt]sx?)$/.test(file.path)) return [];
  const sourceFile = ts.createSourceFile(
    file.path,
    file.text,
    ts.ScriptTarget.Latest,
    false,
    file.path.endsWith(".tsx") || file.path.endsWith(".jsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const result: SourceImportReference[] = [];
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      result.push({
        specifier: node.moduleSpecifier.text,
        kind: importDeclarationIsTypeOnly(node) ? "typeOnlyImport" : "valueImport",
      });
    } else if (
      ts.isImportEqualsDeclaration(node)
      && ts.isExternalModuleReference(node.moduleReference)
      && node.moduleReference.expression
      && ts.isStringLiteral(node.moduleReference.expression)
    ) {
      result.push({
        specifier: node.moduleReference.expression.text,
        kind: node.isTypeOnly ? "typeOnlyImport" : "valueImport",
      });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      result.push({
        specifier: node.moduleSpecifier.text,
        kind: exportDeclarationIsTypeOnly(node) ? "typeOnlyReExport" : "reExport",
      });
    } else if (
      ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1
      && ts.isStringLiteral(node.arguments[0])
    ) {
      result.push({ specifier: node.arguments[0].text, kind: "dynamicImport" });
    } else if (
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === "require"
      && node.arguments.length === 1
      && ts.isStringLiteral(node.arguments[0])
    ) {
      result.push({ specifier: node.arguments[0].text, kind: "valueImport" });
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return result;
}

interface DependencyEdgeAccumulator extends SourceCodeAnalysisDependencyEdge {
  valueImportCount: number;
  typeOnlyImportCount: number;
  dynamicImportCount: number;
  reExportCount: number;
  typeOnlyReExportCount: number;
}

function emptyDependencyEdge(
  file: DependencySourceFile,
  target: DependencySourceFile,
): DependencyEdgeAccumulator {
  return {
    sourceModuleKey: file.moduleKey,
    sourceRole: file.role,
    targetModuleKey: target.moduleKey,
    targetRole: target.role,
    importCount: 0,
    valueImportCount: 0,
    typeOnlyImportCount: 0,
    dynamicImportCount: 0,
    reExportCount: 0,
    typeOnlyReExportCount: 0,
  };
}

function addDependencyKind(edge: DependencyEdgeAccumulator, kind: SourceCodeAnalysisDependencyKind) {
  edge.importCount += 1;
  if (kind === "valueImport") edge.valueImportCount += 1;
  else if (kind === "typeOnlyImport") edge.typeOnlyImportCount += 1;
  else if (kind === "dynamicImport") edge.dynamicImportCount += 1;
  else if (kind === "reExport") edge.reExportCount += 1;
  else edge.typeOnlyReExportCount += 1;
}

function dependencyCellKey(moduleKey: string, role: SourceCodeAnalysisRole) {
  return `${moduleKey}\0${role}`;
}

function dependencyEdgeKey(edge: Pick<SourceCodeAnalysisDependencyEdge, "sourceModuleKey" | "sourceRole" | "targetModuleKey" | "targetRole">) {
  return [edge.sourceModuleKey, edge.sourceRole, edge.targetModuleKey, edge.targetRole].join("\0");
}

function architectureImportCount(edge: DependencyEdgeAccumulator) {
  return edge.valueImportCount
    + edge.typeOnlyImportCount
    + edge.dynamicImportCount
    + edge.reExportCount
    + edge.typeOnlyReExportCount;
}

function runtimeImportCount(edge: DependencyEdgeAccumulator) {
  return edge.valueImportCount + edge.dynamicImportCount + edge.reExportCount;
}

function dependencyDirection(
  edge: DependencyEdgeAccumulator,
  evidence: SourceCodeAnalysisDependencyEvidence[],
): SourceCodeAnalysisDependencyDirection {
  return {
    importCount: architectureImportCount(edge),
    valueImportCount: edge.valueImportCount,
    typeOnlyImportCount: edge.typeOnlyImportCount,
    dynamicImportCount: edge.dynamicImportCount,
    reExportCount: edge.reExportCount,
    typeOnlyReExportCount: edge.typeOnlyReExportCount,
    evidence: evidence
      .sort((left, right) => [left.sourcePath, left.targetPath, left.kind].join("\0")
        .localeCompare([right.sourcePath, right.targetPath, right.kind].join("\0"))),
  };
}

function reciprocalRoleDependencies(
  dependencyEdges: Map<string, DependencyEdgeAccumulator>,
  evidenceByEdge: Map<string, SourceCodeAnalysisDependencyEvidence[]>,
) {
  const result: SourceCodeAnalysisReciprocalRoleDependency[] = [];
  const visited = new Set<string>();
  for (const [edgeKey, edge] of dependencyEdges) {
    if (edge.sourceRole === "test" || edge.targetRole === "test") continue;
    if (dependencyCellKey(edge.sourceModuleKey, edge.sourceRole) === dependencyCellKey(edge.targetModuleKey, edge.targetRole)) continue;
    if (architectureImportCount(edge) === 0) continue;
    const reverseKey = [edge.targetModuleKey, edge.targetRole, edge.sourceModuleKey, edge.sourceRole].join("\0");
    const reverse = dependencyEdges.get(reverseKey);
    if (!reverse || architectureImportCount(reverse) === 0) continue;
    const pairKey = [edgeKey, reverseKey].sort().join("\u0001");
    if (visited.has(pairKey)) continue;
    visited.add(pairKey);

    const leftFirst = dependencyCellKey(edge.sourceModuleKey, edge.sourceRole)
      .localeCompare(dependencyCellKey(edge.targetModuleKey, edge.targetRole)) <= 0;
    const leftToRightEdge = leftFirst ? edge : reverse;
    const rightToLeftEdge = leftFirst ? reverse : edge;
    const leftToRightKey = leftFirst ? edgeKey : reverseKey;
    const rightToLeftKey = leftFirst ? reverseKey : edgeKey;
    result.push({
      left: { moduleKey: leftToRightEdge.sourceModuleKey, role: leftToRightEdge.sourceRole },
      right: { moduleKey: leftToRightEdge.targetModuleKey, role: leftToRightEdge.targetRole },
      classification: runtimeImportCount(leftToRightEdge) > 0 && runtimeImportCount(rightToLeftEdge) > 0
        ? "runtime"
        : "type-assisted",
      leftToRight: dependencyDirection(leftToRightEdge, evidenceByEdge.get(leftToRightKey) ?? []),
      rightToLeft: dependencyDirection(rightToLeftEdge, evidenceByEdge.get(rightToLeftKey) ?? []),
    });
  }
  return result.sort((left, right) => [left.left.moduleKey, left.left.role, left.right.moduleKey, left.right.role].join("\0")
    .localeCompare([right.left.moduleKey, right.left.role, right.right.moduleKey, right.right.role].join("\0")));
}

function stronglyConnectedFileComponents(graph: Map<string, Set<string>>) {
  const indices = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];
  let nextIndex = 0;

  function visit(filePath: string) {
    indices.set(filePath, nextIndex);
    lowLinks.set(filePath, nextIndex);
    nextIndex += 1;
    stack.push(filePath);
    onStack.add(filePath);

    for (const targetPath of graph.get(filePath) ?? []) {
      if (!indices.has(targetPath)) {
        visit(targetPath);
        lowLinks.set(filePath, Math.min(lowLinks.get(filePath) ?? 0, lowLinks.get(targetPath) ?? 0));
      } else if (onStack.has(targetPath)) {
        lowLinks.set(filePath, Math.min(lowLinks.get(filePath) ?? 0, indices.get(targetPath) ?? 0));
      }
    }

    if (lowLinks.get(filePath) !== indices.get(filePath)) return;
    const component: string[] = [];
    let member: string | undefined;
    do {
      member = stack.pop();
      if (!member) break;
      onStack.delete(member);
      component.push(member);
    } while (member !== filePath);
    if (component.length > 1 || (component.length === 1 && graph.get(component[0])?.has(component[0]))) {
      components.push(component.sort());
    }
  }

  for (const filePath of graph.keys()) {
    if (!indices.has(filePath)) visit(filePath);
  }
  return components.sort((left, right) => left.join("\0").localeCompare(right.join("\0")));
}

function dependencyFileCycles(
  architectureGraph: Map<string, Set<string>>,
  runtimeGraph: Map<string, Set<string>>,
  evidence: SourceCodeAnalysisDependencyEvidence[],
  filesByPath: Map<string, DependencySourceFile>,
) {
  const runtimeComponents = stronglyConnectedFileComponents(runtimeGraph);
  const runtimeComponentKeys = new Set(runtimeComponents.map((paths) => paths.join("\0")));
  const components = [
    ...runtimeComponents.map((paths) => ({ classification: "runtime" as const, paths })),
    ...stronglyConnectedFileComponents(architectureGraph)
      .filter((paths) => !runtimeComponentKeys.has(paths.join("\0")))
      .map((paths) => ({ classification: "type-assisted" as const, paths })),
  ].sort((left, right) => [left.paths.join("\0"), left.classification].join("\0")
    .localeCompare([right.paths.join("\0"), right.classification].join("\0")));

  return components.map(({ classification, paths }): SourceCodeAnalysisDependencyFileCycle => {
    const pathSet = new Set(paths);
    return {
      classification,
      paths,
      cells: [...new Map(paths.flatMap((filePath) => {
        const file = filesByPath.get(filePath);
        return file ? [[dependencyCellKey(file.moduleKey, file.role), { moduleKey: file.moduleKey, role: file.role }] as const] : [];
      })).values()].sort((left, right) => dependencyCellKey(left.moduleKey, left.role)
        .localeCompare(dependencyCellKey(right.moduleKey, right.role))),
      evidence: evidence
        .filter((item) => pathSet.has(item.sourcePath) && pathSet.has(item.targetPath))
        .filter((item) => classification === "type-assisted"
          || item.kind === "valueImport"
          || item.kind === "dynamicImport"
          || item.kind === "reExport")
        .sort((left, right) => [left.sourcePath, left.targetPath, left.kind].join("\0")
          .localeCompare([right.sourcePath, right.targetPath, right.kind].join("\0"))),
    };
  });
}

function resolveSourceImport(fromPath: string, specifier: string, knownFiles: Set<string>) {
  let base: string | null = null;
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    base = path.posix.normalize(path.posix.join(path.posix.dirname(fromPath), specifier));
  } else if (specifier.startsWith("@/")) {
    base = specifier.slice(2);
  } else if (specifier.startsWith("@workspace/")) {
    const [packageName, ...segments] = specifier.slice("@workspace/".length).split("/");
    base = segments.length ? `packages/${packageName}/${segments.join("/")}` : `packages/${packageName}/index`;
  }
  if (!base) return null;

  const candidates = [
    base,
    ...[".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"].map((extension) => `${base}${extension}`),
    ...[".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"].map((extension) => `${base}/index${extension}`),
  ];
  return candidates.find((candidate) => knownFiles.has(candidate)) ?? null;
}

function dependencyCycles(edges: Map<string, Set<string>>) {
  const cycles = new Map<string, string[]>();
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  function visit(moduleKey: string) {
    if (visiting.has(moduleKey)) {
      const start = stack.indexOf(moduleKey);
      const cycle = [...stack.slice(start), moduleKey];
      cycles.set(cycle.slice(0, -1).sort().join("|"), cycle);
      return;
    }
    if (visited.has(moduleKey)) return;
    visiting.add(moduleKey);
    stack.push(moduleKey);
    for (const dependency of edges.get(moduleKey) ?? []) visit(dependency);
    stack.pop();
    visiting.delete(moduleKey);
    visited.add(moduleKey);
  }

  for (const moduleKey of edges.keys()) visit(moduleKey);
  return [...cycles.values()].sort((left, right) => left.join("|").localeCompare(right.join("|")));
}

export function analyzeSourceDependencies(files: DependencySourceFile[], moduleKeys: Iterable<string>) {
  const fileByPath = new Map(files.map((file) => [file.path, file]));
  const knownFiles = new Set(fileByPath.keys());
  const edges = new Map<string, Set<string>>();
  const crossModuleImportCounts = new Map<string, number>();
  const dependencyEdges = new Map<string, DependencyEdgeAccumulator>();
  const evidenceByEdge = new Map<string, SourceCodeAnalysisDependencyEvidence[]>();
  const architectureFileGraph = new Map(files.map((file) => [file.path, new Set<string>()]));
  const runtimeFileGraph = new Map(files.map((file) => [file.path, new Set<string>()]));
  const fileEvidence: SourceCodeAnalysisDependencyEvidence[] = [];
  for (const moduleKey of moduleKeys) {
    edges.set(moduleKey, new Set());
    crossModuleImportCounts.set(moduleKey, 0);
  }

  for (const file of files) {
    for (const reference of importReferences(file)) {
      const targetPath = resolveSourceImport(file.path, reference.specifier, knownFiles);
      const target = targetPath ? fileByPath.get(targetPath) : null;
      if (!target) continue;
      const dependencyKey = [file.moduleKey, file.role, target.moduleKey, target.role].join("\0");
      const dependency = dependencyEdges.get(dependencyKey) ?? emptyDependencyEdge(file, target);
      addDependencyKind(dependency, reference.kind);
      dependencyEdges.set(dependencyKey, dependency);
      const evidence = evidenceByEdge.get(dependencyKey) ?? [];
      evidence.push({ sourcePath: file.path, targetPath, kind: reference.kind });
      evidenceByEdge.set(dependencyKey, evidence);
      if (
        file.role !== "test"
        && target.role !== "test"
      ) {
        architectureFileGraph.get(file.path)?.add(targetPath);
        if (reference.kind === "valueImport" || reference.kind === "dynamicImport" || reference.kind === "reExport") {
          runtimeFileGraph.get(file.path)?.add(targetPath);
        }
        fileEvidence.push({ sourcePath: file.path, targetPath, kind: reference.kind });
      }
      if (file.role === "test" || target.role === "test" || target.moduleKey === file.moduleKey) continue;
      edges.get(file.moduleKey)?.add(target.moduleKey);
      crossModuleImportCounts.set(file.moduleKey, (crossModuleImportCounts.get(file.moduleKey) ?? 0) + 1);
    }
  }

  return {
    crossModuleImportCounts,
    dependencyEdges: [...dependencyEdges.values()].sort((left, right) =>
      [left.sourceModuleKey, left.sourceRole, left.targetModuleKey, left.targetRole].join("\0")
        .localeCompare([right.sourceModuleKey, right.sourceRole, right.targetModuleKey, right.targetRole].join("\0"))),
    reciprocalRoleDependencies: reciprocalRoleDependencies(dependencyEdges, evidenceByEdge),
    dependencyFileCycles: dependencyFileCycles(architectureFileGraph, runtimeFileGraph, fileEvidence, fileByPath),
    dependencies: new Map([...edges].map(([moduleKey, values]) => [moduleKey, [...values].sort()])),
    cycles: dependencyCycles(edges),
  };
}
