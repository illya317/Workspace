import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  coreUiComponentKindMeta,
  coreUiComponentRegistry,
  coreUiComponentTierMeta,
} from "@workspace/core/ui/component-registry";
import type { CoreUiRegistryUsageRow } from "@workspace/platform/types";

const SCAN_ROOTS = ["app", "packages"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts"]);
const SKIP_DIRS = new Set([
  ".git",
  ".next",
  "node_modules",
  "generated",
  "dist",
  "build",
]);

let cachedRows: CoreUiRegistryUsageRow[] | null = null;

function toRepoPath(filePath: string) {
  return path.relative(process.cwd(), filePath).split(path.sep).join("/");
}

function isSourceFile(filePath: string) {
  return SOURCE_EXTENSIONS.has(path.extname(filePath));
}

function shouldSkipPath(filePath: string) {
  const repoPath = toRepoPath(filePath);
  if (repoPath.startsWith("packages/core/ui/")) return true;
  return repoPath.split("/").some((part) => SKIP_DIRS.has(part));
}

function listSourceFiles(dirPath: string): string[] {
  if (!existsSync(dirPath) || shouldSkipPath(dirPath)) return [];

  const stat = statSync(dirPath);
  if (stat.isFile()) return isSourceFile(dirPath) ? [dirPath] : [];
  if (!stat.isDirectory()) return [];

  return readdirSync(dirPath).flatMap((entry) =>
    listSourceFiles(path.join(dirPath, entry)),
  );
}

function parseNamedCoreUiImports(source: string) {
  const names = new Set<string>();
  const importPattern =
    /import\s+(?:type\s+)?\{([\s\S]*?)\}\s+from\s+["']@workspace\/core\/ui(?:\/index)?["']/g;
  for (const match of source.matchAll(importPattern)) {
    const specifiers = match[1] ?? "";
    for (const part of specifiers.split(",")) {
      const importedName = part.trim().split(/\s+as\s+/i)[0]?.trim();
      if (importedName) names.add(importedName);
    }
  }
  return names;
}

function hasDeepCoreUiImport(source: string, componentName: string) {
  const pattern = new RegExp(
    `from\\s+["']@workspace/core/ui/${componentName}(?:\\.tsx?)?["']`,
  );
  return pattern.test(source);
}

export function getCoreUiRegistryUsageRows(): CoreUiRegistryUsageRow[] {
  if (cachedRows) return cachedRows;

  const usageByName = new Map<string, string[]>(
    coreUiComponentRegistry.map((component) => [component.name, []]),
  );
  const rootDir = path.resolve(/*turbopackIgnore: true*/ process.cwd());
  const sourceFiles = SCAN_ROOTS.flatMap((root) =>
    listSourceFiles(path.join(/*turbopackIgnore: true*/ rootDir, root)),
  );

  for (const filePath of sourceFiles) {
    const source = readFileSync(filePath, "utf8");
    const repoPath = toRepoPath(filePath);
    const namedImports = parseNamedCoreUiImports(source);

    for (const component of coreUiComponentRegistry) {
      if (
        namedImports.has(component.name) ||
        hasDeepCoreUiImport(source, component.name)
      ) {
        usageByName.get(component.name)?.push(repoPath);
      }
    }
  }

  cachedRows = coreUiComponentRegistry
    .map((component) => ({
      name: component.name,
      tier: component.tier,
      tierLabel: coreUiComponentTierMeta[component.tier].label,
      tierDescription: coreUiComponentTierMeta[component.tier].description,
      kind: component.kind,
      kindLabel: coreUiComponentKindMeta[component.kind].label,
      kindDescription: coreUiComponentKindMeta[component.kind].description,
      description: component.description,
      example: component.example,
      includedComponents: [
        ...("includes" in component ? component.includes : []),
      ],
      usageFiles: usageByName.get(component.name)?.sort() ?? [],
    }))
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));

  return cachedRows;
}
