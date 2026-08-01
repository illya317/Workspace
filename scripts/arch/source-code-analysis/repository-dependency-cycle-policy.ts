import path from "node:path";

export const REPOSITORY_DEPENDENCY_KINDS = [
  "dynamicImport",
  "packageScriptCommand",
  "pythonImport",
  "reExport",
  "shellExecute",
  "shellSource",
  "typeOnlyImport",
  "typeOnlyReExport",
  "valueImport",
  "workflowCommand",
] as const;

export type RepositoryDependencyKind = (typeof REPOSITORY_DEPENDENCY_KINDS)[number];

export interface RepositoryDependencyFile {
  path: string;
  text: string;
}

export interface RepositoryDependencyEdge {
  sourcePath: string;
  targetPath: string;
  kind: RepositoryDependencyKind;
}

export interface RepositoryDependencyCycle {
  classification: "runtime" | "type-assisted";
  paths: string[];
  cyclePath: string[];
  evidence: RepositoryDependencyEdge[];
  blocking: true;
  waivable: false;
}

const TYPE_ONLY_KINDS = new Set<RepositoryDependencyKind>(["typeOnlyImport", "typeOnlyReExport"]);
const SOURCE_EXTENSIONS = [
  ".bash", ".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".py", ".sh", ".ts", ".tsx",
];

function normalizeRepositoryPath(value: string) {
  return path.posix.normalize(value.replace(/^\.\//, "").replace(/^\//, ""));
}

function edgeKey(edge: RepositoryDependencyEdge) {
  return [edge.sourcePath, edge.targetPath, edge.kind].join("\0");
}

function sortedUniqueEdges(edges: readonly RepositoryDependencyEdge[]) {
  return [...new Map(edges.map((edge) => [edgeKey(edge), edge])).values()]
    .sort((left, right) => edgeKey(left).localeCompare(edgeKey(right)));
}

function graphFor(
  filePaths: readonly string[],
  edges: readonly RepositoryDependencyEdge[],
  runtimeOnly: boolean,
) {
  const known = new Set(filePaths);
  const graph = new Map(filePaths.map((filePath) => [filePath, new Set<string>()]));
  for (const edge of edges) {
    if (!known.has(edge.sourcePath) || !known.has(edge.targetPath)) continue;
    if (runtimeOnly && TYPE_ONLY_KINDS.has(edge.kind)) continue;
    graph.get(edge.sourcePath)?.add(edge.targetPath);
  }
  return graph;
}

function stronglyConnectedComponents(graph: ReadonlyMap<string, ReadonlySet<string>>) {
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

    for (const targetPath of [...(graph.get(filePath) ?? [])].sort()) {
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

  for (const filePath of [...graph.keys()].sort()) {
    if (!indices.has(filePath)) visit(filePath);
  }
  return components.sort((left, right) => left.join("\0").localeCompare(right.join("\0")));
}

function representativeCycle(paths: readonly string[], graph: ReadonlyMap<string, ReadonlySet<string>>) {
  const members = new Set(paths);
  function search(start: string, current: string, route: string[], active: Set<string>): string[] | null {
    for (const target of [...(graph.get(current) ?? [])].filter((item) => members.has(item)).sort()) {
      if (target === start) return [...route, start];
      if (active.has(target)) continue;
      active.add(target);
      const found = search(start, target, [...route, target], active);
      active.delete(target);
      if (found) return found;
    }
    return null;
  }
  for (const start of [...paths].sort()) {
    const found = search(start, start, [start], new Set([start]));
    if (found) return found;
  }
  throw new Error("[source-code-analysis] strongly connected component has no cycle route");
}

/**
 * Every first-party file edge participates, including tests and type-only
 * imports. A cycle is a hard diagnostic and deliberately has no waiver field.
 */
export function detectRepositoryDependencyCycles(
  repositoryFilePaths: readonly string[],
  dependencyEdges: readonly RepositoryDependencyEdge[],
): RepositoryDependencyCycle[] {
  const files = [...new Set(repositoryFilePaths.map(normalizeRepositoryPath))].sort();
  const edges = sortedUniqueEdges(dependencyEdges.map((edge) => ({
    ...edge,
    sourcePath: normalizeRepositoryPath(edge.sourcePath),
    targetPath: normalizeRepositoryPath(edge.targetPath),
  })));
  const architectureGraph = graphFor(files, edges, false);
  const runtimeGraph = graphFor(files, edges, true);
  const runtimeComponents = stronglyConnectedComponents(runtimeGraph);
  const runtimeKeys = new Set(runtimeComponents.map((component) => component.join("\0")));
  const components = [
    ...runtimeComponents.map((paths) => ({ classification: "runtime" as const, paths, graph: runtimeGraph })),
    ...stronglyConnectedComponents(architectureGraph)
      .filter((paths) => !runtimeKeys.has(paths.join("\0")))
      .map((paths) => ({ classification: "type-assisted" as const, paths, graph: architectureGraph })),
  ].sort((left, right) =>
    (left.paths.join("\0") + "\0" + left.classification)
      .localeCompare(right.paths.join("\0") + "\0" + right.classification));

  return components.map(({ classification, paths, graph }) => {
    const pathSet = new Set(paths);
    return {
      classification,
      paths,
      cyclePath: representativeCycle(paths, graph),
      evidence: edges.filter((edge) =>
        pathSet.has(edge.sourcePath)
        && pathSet.has(edge.targetPath)
        && (classification === "type-assisted" || !TYPE_ONLY_KINDS.has(edge.kind))),
      blocking: true,
      waivable: false,
    };
  });
}

function cleanedSpecifier(specifier: string, sourcePath: string) {
  const sourceDirectory = path.posix.dirname(sourcePath);
  return specifier
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/[),;]+$/g, "")
    .replace(/^\$\{SCRIPT_DIR\}\//, sourceDirectory + "/")
    .replace(/^\$SCRIPT_DIR\//, sourceDirectory + "/")
    .replace(/^\$\{REPO_ROOT\}\//, "")
    .replace(/^\$REPO_ROOT\//, "");
}

function resolveKnownFile(
  sourcePath: string,
  specifier: string,
  knownFiles: ReadonlySet<string>,
  options: { pythonModule?: boolean } = {},
) {
  let cleaned = cleanedSpecifier(specifier, sourcePath);
  if (!cleaned || cleaned.includes("$")) return null;
  if (options.pythonModule) cleaned = cleaned.replace(/\./g, "/");
  const repositoryRelative = cleaned.startsWith("./") || cleaned.startsWith("../")
    ? path.posix.join(path.posix.dirname(sourcePath), cleaned)
    : cleaned;
  const base = normalizeRepositoryPath(repositoryRelative);
  const candidates = options.pythonModule
    ? [base + ".py", base + "/__init__.py"]
    : [
      base,
      ...SOURCE_EXTENSIONS.map((extension) => base + extension),
      ...SOURCE_EXTENSIONS.map((extension) => base + "/index" + extension),
    ];
  return candidates.find((candidate) => knownFiles.has(candidate)) ?? null;
}

function pythonModuleBase(sourcePath: string, moduleReference: string) {
  const leadingDots = moduleReference.match(/^\.+/)?.[0].length ?? 0;
  const suffix = moduleReference.slice(leadingDots).replace(/\./g, "/");
  if (leadingDots === 0) return suffix;
  let base = path.posix.dirname(sourcePath);
  for (let index = 1; index < leadingDots; index += 1) base = path.posix.dirname(base);
  return suffix ? path.posix.join(base, suffix) : base;
}

function pythonImportEdges(file: RepositoryDependencyFile, knownFiles: ReadonlySet<string>) {
  const edges: RepositoryDependencyEdge[] = [];
  for (const rawLine of file.text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, "");
    const fromMatch = line.match(/^\s*from\s+([.\w]+)\s+import\s+(.+)$/);
    if (fromMatch) {
      const base = pythonModuleBase(file.path, fromMatch[1]);
      const directTarget = resolveKnownFile(file.path, base, knownFiles, { pythonModule: true });
      const importedNames = fromMatch[2].split(",").map((item) => item.trim().split(/\s+as\s+/)[0]);
      const targets = directTarget
        ? [directTarget]
        : importedNames.flatMap((name) => {
          if (!name || name === "*") return [];
          const target = resolveKnownFile(file.path, path.posix.join(base, name), knownFiles, { pythonModule: true });
          return target ? [target] : [];
        });
      for (const targetPath of targets) edges.push({ sourcePath: file.path, targetPath, kind: "pythonImport" });
      continue;
    }
    const importMatch = line.match(/^\s*import\s+(.+)$/);
    if (!importMatch) continue;
    for (const item of importMatch[1].split(",")) {
      const moduleReference = item.trim().split(/\s+as\s+/)[0];
      const targetPath = resolveKnownFile(file.path, moduleReference, knownFiles, { pythonModule: true });
      if (targetPath) edges.push({ sourcePath: file.path, targetPath, kind: "pythonImport" });
    }
  }
  return edges;
}

function commandTokens(line: string) {
  return line.match(/"[^"]*"|'[^']*'|[^\s;&|]+/g)?.map((token) => token.replace(/^["']|["']$/g, "")) ?? [];
}

const COMMAND_EXECUTORS = new Set(["bash", "node", "python", "python3", "sh", "tsx"]);
const OPTIONS_WITH_VALUE = new Set(["--import", "--loader", "--require", "-r"]);

function commandEdges(
  sourcePath: string,
  text: string,
  knownFiles: ReadonlySet<string>,
  kind: "packageScriptCommand" | "shellExecute" | "workflowCommand",
) {
  const edges: RepositoryDependencyEdge[] = [];
  for (const line of text.split(/\r?\n/)) {
    const tokens = commandTokens(line);
    for (let index = 0; index < tokens.length; index += 1) {
      const executable = path.posix.basename(tokens[index]);
      if (!COMMAND_EXECUTORS.has(executable)) continue;
      let candidateIndex = index + 1;
      while (candidateIndex < tokens.length && tokens[candidateIndex].startsWith("-")) {
        const option = tokens[candidateIndex];
        candidateIndex += OPTIONS_WITH_VALUE.has(option) ? 2 : 1;
      }
      const candidate = tokens[candidateIndex];
      if (!candidate) continue;
      const targetPath = resolveKnownFile(sourcePath, candidate, knownFiles);
      if (targetPath) edges.push({ sourcePath, targetPath, kind });
    }
    const directIndex = tokens.findIndex((token, index) =>
      /^(?:\.\.?\/|\$\{?SCRIPT_DIR\}?\/)/.test(token)
      && (index === 0 || tokens[index - 1] === "run:"));
    if (directIndex >= 0) {
      const targetPath = resolveKnownFile(sourcePath, tokens[directIndex], knownFiles);
      if (targetPath) edges.push({ sourcePath, targetPath, kind });
    }
  }
  return edges;
}

function shellSourceEdges(file: RepositoryDependencyFile, knownFiles: ReadonlySet<string>) {
  const edges: RepositoryDependencyEdge[] = [];
  for (const rawLine of file.text.split(/\r?\n/)) {
    const match = rawLine.match(/^\s*(?:source|\.)\s+([^\s;&|]+)/);
    if (!match) continue;
    const targetPath = resolveKnownFile(file.path, match[1], knownFiles);
    if (targetPath) edges.push({ sourcePath: file.path, targetPath, kind: "shellSource" });
  }
  return edges;
}

function packageScriptEdges(file: RepositoryDependencyFile, knownFiles: ReadonlySet<string>) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(file.text) as unknown;
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
  const scripts = (parsed as Record<string, unknown>).scripts;
  if (!scripts || typeof scripts !== "object" || Array.isArray(scripts)) return [];
  return Object.values(scripts).flatMap((command) =>
    typeof command === "string"
      ? commandEdges(file.path, command, knownFiles, "packageScriptCommand")
      : []);
}

/** Extracts first-party Python, shell, workflow and package-script file edges. */
export function extractRepositoryCommandDependencyEdges(files: readonly RepositoryDependencyFile[]) {
  const normalizedFiles = files.map((file) => ({ ...file, path: normalizeRepositoryPath(file.path) }));
  const knownFiles = new Set(normalizedFiles.map((file) => file.path));
  const edges = normalizedFiles.flatMap((file): RepositoryDependencyEdge[] => {
    if (file.path.endsWith(".py")) return pythonImportEdges(file, knownFiles);
    if (/\.(?:bash|sh)$/.test(file.path)) {
      return [
        ...shellSourceEdges(file, knownFiles),
        ...commandEdges(file.path, file.text, knownFiles, "shellExecute"),
      ];
    }
    if (/\.ya?ml$/.test(file.path)) {
      return commandEdges(file.path, file.text, knownFiles, "workflowCommand");
    }
    if (path.posix.basename(file.path) === "package.json") return packageScriptEdges(file, knownFiles);
    return [];
  });
  return sortedUniqueEdges(edges);
}
