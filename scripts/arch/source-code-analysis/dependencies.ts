import path from "node:path";
import ts from "typescript";

import type {
  SourceCodeAnalysisDependencyEdge,
  SourceCodeAnalysisRole,
} from "../../../packages/platform/source-code-analysis-contract";

export interface DependencySourceFile {
  path: string;
  text: string;
  moduleKey: string;
  role: SourceCodeAnalysisRole;
}

function importSpecifiers(file: DependencySourceFile) {
  if (!/\.(?:[cm]?[jt]sx?)$/.test(file.path)) return [];
  const sourceFile = ts.createSourceFile(
    file.path,
    file.text,
    ts.ScriptTarget.Latest,
    false,
    file.path.endsWith(".tsx") || file.path.endsWith(".jsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const result: string[] = [];
  function visit(node: ts.Node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      result.push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1
      && ts.isStringLiteral(node.arguments[0])
    ) {
      result.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return result;
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
  const dependencyEdges = new Map<string, SourceCodeAnalysisDependencyEdge>();
  for (const moduleKey of moduleKeys) {
    edges.set(moduleKey, new Set());
    crossModuleImportCounts.set(moduleKey, 0);
  }

  for (const file of files) {
    for (const specifier of importSpecifiers(file)) {
      const targetPath = resolveSourceImport(file.path, specifier, knownFiles);
      const target = targetPath ? fileByPath.get(targetPath) : null;
      if (!target) continue;
      const dependencyKey = [file.moduleKey, file.role, target.moduleKey, target.role].join("\0");
      const existingDependency = dependencyEdges.get(dependencyKey);
      dependencyEdges.set(dependencyKey, existingDependency
        ? { ...existingDependency, importCount: existingDependency.importCount + 1 }
        : {
            sourceModuleKey: file.moduleKey,
            sourceRole: file.role,
            targetModuleKey: target.moduleKey,
            targetRole: target.role,
            importCount: 1,
          });
      if (file.role === "test" || file.role === "tooling" || target.moduleKey === file.moduleKey) continue;
      edges.get(file.moduleKey)?.add(target.moduleKey);
      crossModuleImportCounts.set(file.moduleKey, (crossModuleImportCounts.get(file.moduleKey) ?? 0) + 1);
    }
  }

  return {
    crossModuleImportCounts,
    dependencyEdges: [...dependencyEdges.values()].sort((left, right) =>
      [left.sourceModuleKey, left.sourceRole, left.targetModuleKey, left.targetRole].join("\0")
        .localeCompare([right.sourceModuleKey, right.sourceRole, right.targetModuleKey, right.targetRole].join("\0"))),
    dependencies: new Map([...edges].map(([moduleKey, values]) => [moduleKey, [...values].sort()])),
    cycles: dependencyCycles(edges),
  };
}
