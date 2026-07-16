import path from "node:path";

const MAX_SOURCE_SEED_FILES = 60;
const SOURCE_FILE_EXTENSIONS = [".tsx", ".ts", ".md", ".json", ".yml", ".yaml", ".prisma"] as const;

export type SourceQueryHints = {
  routePath?: string;
  routeSegments: string[];
  routePages: string[];
  moduleKey?: string;
  activeTabKey?: string;
  activeTabLabel?: string;
  activeChildKey?: string;
  activeChildLabel?: string;
  contextTerms: string[];
};

export type SourceRepositoryReader = {
  exists(file: string): Promise<boolean>;
  readText(file: string): Promise<string | null>;
};

export function uniqueStrings(values: Iterable<string>) {
  return [...new Set([...values].map((value) => value.trim()).filter(Boolean))];
}

function comparableToken(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "");
}

function structuredContextValue(query: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = query.match(new RegExp(`(?:^|\\n)\\s*-\\s*${escaped}:\\s*([^\\n]+)`, "i"));
  return match?.[1]?.trim();
}

function parseKeyLabel(value: string | undefined) {
  if (!value) return {};
  const match = value.trim().match(/^([^\s()（）]+)(?:\s*[（(](.*?)[）)])?/);
  const key = match?.[1] && match[1] !== "(none)" ? match[1] : undefined;
  return { key, label: match?.[2]?.trim() };
}

function routeSegmentsFromPath(routePath: string | undefined) {
  if (!routePath) return [];
  const withoutOrigin = routePath.replace(/^https?:\/\/[^/]+/i, "");
  const clean = withoutOrigin.split(/[?#]/)[0]?.replace(/^\/+|\/+$/g, "") || "";
  const segments = clean.split("/").filter(Boolean);
  return segments[0] === "workspace" ? segments.slice(1) : segments;
}

function routePageCandidates(routeSegments: string[]) {
  if (routeSegments.length === 0) return [];
  const route = routeSegments.join("/");
  return [
    `app/(modules)/${route}/page.tsx`,
    `app/(system)/${route}/page.tsx`,
    `app/(docs)/${route}/page.tsx`,
  ];
}

export function sourceQueryHints(query: string): SourceQueryHints {
  const routePath = structuredContextValue(query, "path");
  const activeTab = parseKeyLabel(structuredContextValue(query, "activeTab"));
  const activeChild = parseKeyLabel(structuredContextValue(query, "activeChild"));
  const routeSegments = routeSegmentsFromPath(routePath);
  const contextTerms = uniqueStrings([
    ...routeSegments,
    routeSegments.join("-"),
    activeTab.key,
    activeTab.label,
    activeChild.key,
    activeChild.label,
  ].filter(Boolean) as string[]);

  return {
    routePath,
    routeSegments,
    routePages: routePageCandidates(routeSegments),
    moduleKey: routeSegments[0],
    activeTabKey: activeTab.key,
    activeTabLabel: activeTab.label,
    activeChildKey: activeChild.key,
    activeChildLabel: activeChild.label,
    contextTerms,
  };
}

function sourceFileCandidates(file: string) {
  const extension = path.posix.extname(file);
  if (SOURCE_FILE_EXTENSIONS.includes(extension as typeof SOURCE_FILE_EXTENSIONS[number])) return [file];
  return [
    ...SOURCE_FILE_EXTENSIONS.map((ext) => `${file}${ext}`),
    ...["index.tsx", "index.ts"].map((indexFile) => path.posix.join(file, indexFile)),
  ];
}

async function resolveSourceFile(reader: SourceRepositoryReader, file: string) {
  const normalized = path.posix.normalize(file).replace(/^\/+/, "");
  if (normalized.startsWith("../")) return null;
  for (const candidate of sourceFileCandidates(normalized)) {
    if (await reader.exists(candidate)) return candidate;
  }
  return null;
}

function relativeImportSpecifiers(content: string) {
  const specs = new Set<string>();
  const staticImport = /(?:import|export)\s+(?:type\s+)?[^;]*?(?:\s+from\s+)?["'](\.[^"']+)["']/g;
  const dynamicImport = /import\(\s*["'](\.[^"']+)["']\s*\)/g;
  for (const match of content.matchAll(staticImport)) specs.add(match[1]);
  for (const match of content.matchAll(dynamicImport)) specs.add(match[1]);
  return [...specs];
}

function workspaceUiImports(content: string) {
  const imports: Array<{ packageName: string; names: string[]; subpath?: string }> = [];
  const importPattern = /import\s+(?:type\s+)?([^;]+?)\s+from\s+["']@workspace\/([^/]+)\/ui(?:\/([^"']+))?["']/g;
  for (const match of content.matchAll(importPattern)) {
    const specifier = match[1];
    const names = new Set<string>();
    const named = specifier.match(/\{([\s\S]*?)\}/);
    named?.[1]
      .split(",")
      .map((part) => part.trim().split(/\s+as\s+/i)[0]?.replace(/^type\s+/, "").trim())
      .filter(Boolean)
      .forEach((name) => names.add(name));
    const defaultName = specifier.replace(named?.[0] ?? "", "").split(",")[0]?.trim();
    if (defaultName && /^[A-Za-z_$][\w$]*$/.test(defaultName)) names.add(defaultName);
    imports.push({ packageName: match[2], names: [...names], subpath: match[3] });
  }
  return imports;
}

async function resolvePackageUiExport(reader: SourceRepositoryReader, packageName: string, exportName: string) {
  const indexFile = `packages/${packageName}/ui/index.ts`;
  const content = await reader.readText(indexFile);
  if (!content) return null;
  const escaped = exportName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const exportPattern = /export\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g;
  for (const match of content.matchAll(exportPattern)) {
    const hasExport = match[1].split(",").some((part) => {
      const normalized = part.replace(/^type\s+/, "").trim();
      return normalized === exportName || new RegExp(`\\b(?:default\\s+as\\s+)?${escaped}\\b`).test(normalized);
    });
    if (!hasExport) continue;
    const resolved = await resolveSourceFile(reader, path.posix.join(path.posix.dirname(indexFile), match[2]));
    if (resolved) return resolved;
  }
  return null;
}

async function routeEntrySourceFiles(reader: SourceRepositoryReader, hints: SourceQueryHints) {
  const seeds: string[] = [];
  for (const page of hints.routePages) {
    const resolved = await resolveSourceFile(reader, page);
    if (resolved) seeds.push(resolved);
  }
  for (const routeFile of [...seeds]) {
    const content = await reader.readText(routeFile);
    if (!content) continue;
    for (const importSpec of workspaceUiImports(content)) {
      if (importSpec.subpath) {
        const resolved = await resolveSourceFile(reader, `packages/${importSpec.packageName}/ui/${importSpec.subpath}`);
        if (resolved) seeds.push(resolved);
      }
      for (const name of importSpec.names) {
        const resolved = await resolvePackageUiExport(reader, importSpec.packageName, name);
        if (resolved) seeds.push(resolved);
      }
    }
  }
  return uniqueStrings(seeds);
}

export function sourceTermMatches(value: string, terms: string[]) {
  return sourceTermScore(value, terms) > 0;
}

function sourceTermScore(value: string, terms: string[]) {
  const comparable = comparableToken(value);
  return terms.reduce((score, term) => {
    const normalized = comparableToken(term);
    return normalized.length >= 2 && comparable.includes(normalized) ? score + normalized.length : score;
  }, 0);
}

async function collectSourceImportGraph(reader: SourceRepositoryReader, roots: string[], terms: string[]) {
  const result = new Set<string>(roots);
  const queue = roots.map((file) => ({ file, depth: 0 }));
  const seen = new Set<string>();

  while (queue.length > 0 && result.size < MAX_SOURCE_SEED_FILES) {
    const next = queue.shift();
    if (!next || seen.has(next.file) || next.depth >= 3) continue;
    seen.add(next.file);
    const content = await reader.readText(next.file);
    if (!content) continue;
    const imports: string[] = [];
    for (const specifier of relativeImportSpecifiers(content)) {
      const resolved = await resolveSourceFile(reader, path.posix.join(path.posix.dirname(next.file), specifier));
      if (resolved) imports.push(resolved);
    }
    imports.sort((a, b) => sourceTermScore(b, terms) - sourceTermScore(a, terms));
    for (const imported of imports) {
      if (result.size >= MAX_SOURCE_SEED_FILES) break;
      const shouldFollow = next.depth < 2 || sourceTermMatches(imported, terms);
      result.add(imported);
      if (shouldFollow) queue.push({ file: imported, depth: next.depth + 1 });
    }
  }
  return [...result];
}

export async function sourceSeedFiles(reader: SourceRepositoryReader, hints: SourceQueryHints, terms: string[]) {
  const routeEntries = await routeEntrySourceFiles(reader, hints);
  return collectSourceImportGraph(reader, routeEntries, [...terms, ...hints.contextTerms]);
}
