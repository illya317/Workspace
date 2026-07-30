import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  SOURCE_CODE_ANALYSIS_ROLES,
  SOURCE_CODE_ANALYSIS_SCHEMA_VERSION,
  type SourceCodeAnalysisModuleRow,
  type SourceCodeAnalysisRole,
  type SourceCodeAnalysisRoleCounts,
  type SourceCodeAnalysisSnapshot,
} from "../../../packages/platform/source-code-analysis-contract";
import { SOURCE_MODULE_DECLARATIONS, sourceModuleDeclarationsForPath } from "./declarations";
import { analyzeSourceDependencies } from "./dependencies";
import { collectSourceFiles, countSourceLines, isGeneratedSource } from "./source-files";

const TEST_FILE_PATTERN = /(?:^|\/)(?:__tests__\/|[^/]+\.(?:test|spec)\.[^.]+$)/;
interface AnalyzedFile {
  path: string;
  text: string;
  moduleKey: string;
  role: SourceCodeAnalysisRole;
  mixedRoles: SourceCodeAnalysisRole[];
  lines: number;
}

function emptyRoleCounts(): SourceCodeAnalysisRoleCounts {
  return Object.fromEntries(SOURCE_CODE_ANALYSIS_ROLES.map((role) => [role, 0])) as SourceCodeAnalysisRoleCounts;
}

function withoutTypeOnlyImports(text: string) {
  return text.replace(/import\s+type\b[\s\S]*?;\s*/g, "");
}

function hasDirectPersistenceAccess(text: string) {
  const runtimeText = withoutTypeOnlyImports(text);
  return /\bprisma\s*\./.test(runtimeText)
    || /import\s*\{[^}]*\bprisma\b[^}]*\}\s*from\s*["'][^"']*(?:server\/prisma|\/db)["']/.test(runtimeText)
    || /from\s+["'][^"']*\/(?:database|db)["']/.test(runtimeText);
}

function hasDirectIntegrationAccess(text: string) {
  const runtimeText = withoutTypeOnlyImports(text);
  return /\bfetch\s*\(/.test(runtimeText)
    || /\b(?:axios|ky)\s*\./.test(runtimeText)
    || /(?:from|import\s*\()\s*["'](?:@wecom\/|onlyoffice|axios|ky\b)/.test(runtimeText);
}

function hasDirectExternalSdkAccess(text: string) {
  const runtimeText = withoutTypeOnlyImports(text);
  return /\b(?:axios|ky)\s*\./.test(runtimeText)
    || /(?:from|import\s*\()\s*["'](?:@wecom\/|onlyoffice|axios|ky\b)/.test(runtimeText);
}

function isDedicatedIntegrationSource(relativePath: string) {
  const normalized = relativePath.toLowerCase();
  const filename = path.posix.basename(normalized);
  return normalized.includes("/integrations/")
    || normalized.includes("/integration/")
    || /(?:connector|adapter|webhook|wecom|onlyoffice)/.test(filename);
}

function isDedicatedDomainValidationSource(relativePath: string) {
  const normalized = relativePath.toLowerCase();
  const filename = path.posix.basename(normalized);
  if (normalized.startsWith("app/")) return false;
  return /(?:validation|validator)/.test(filename)
    || /\/(?:validation|validators)\//.test(normalized);
}

function roleSignals(relativePath: string, moduleKey: string, text: string) {
  const normalized = relativePath.toLowerCase();
  const filename = path.posix.basename(normalized);
  const isAppSource = normalized.startsWith("app/");
  const isStyleSource = normalized.endsWith(".css") || normalized.endsWith(".scss");
  const isUiSource = isStyleSource || (!isAppSource && (
    normalized.endsWith(".tsx")
    || (/^use-[^.]+\.(?:ts|tsx)$/.test(filename) && normalized.includes("/ui/"))
    || /from\s+["']react["']/.test(text)
  ));
  const hasInputSignal = /(?:schema|route-input|route-command|request-shape)/.test(filename)
    || /\bz\s*\.\s*object\s*\(/.test(text);
  const hasDirectPersistenceSignal = hasDirectPersistenceAccess(text);
  const signals = new Set<SourceCodeAnalysisRole>();

  if (TEST_FILE_PATTERN.test(normalized)) return new Set<SourceCodeAnalysisRole>(["test"]);
  if (moduleKey === "operations" || moduleKey === "tooling") return new Set<SourceCodeAnalysisRole>(["tooling"]);
  if (moduleKey === "data-model") return new Set<SourceCodeAnalysisRole>(["persistence"]);
  if (isStyleSource) signals.add("ui");
  if (moduleKey === "application-shell") {
    if (!isStyleSource) signals.add("composition");
  } else if (isAppSource) signals.add(filename === "route.ts" || hasInputSignal ? "input" : "composition");
  else if (isUiSource) signals.add("ui");

  if (hasInputSignal) signals.add("input");
  if (
    !isUiSource
    && !isAppSource
    && (
      /(?:validation|validator|policy|guard)/.test(filename)
      || /\/(?:validation|validators|policies|guards)\//.test(normalized)
    )
  ) {
    signals.add("domainValidation");
  }
  if (
    hasDirectPersistenceSignal
    || (!isUiSource && (
      /(?:prisma|repository|persistence|data-access|store|database|db\.)/.test(filename)
      || normalized.includes("/dal/")
    ))
  ) {
    signals.add("persistence");
  }
  if (
    (
      normalized.includes("/integrations/")
      || normalized.includes("/integration/")
      || /(?:connector|webhook|wecom|onlyoffice)/.test(filename)
      || /(?:external|remote|http|api)-(?:adapter|client|gateway)/.test(filename)
      || normalized.includes("/document-editor/adapters")
    )
    && !isAppSource
  ) {
    signals.add("integration");
  }
  if (
    normalized.includes("/types/")
    || normalized.includes("/constants/")
    || /(?:^|[-.])(?:contract|registry|types?|constants?|module|index)\.[^.]+$/.test(filename)
  ) {
    signals.add("contract");
  }
  if (!isUiSource && !isAppSource && /(?:service|algorithm|calculation|engine|use-case|workflow)/.test(filename)) {
    signals.add("domain");
  }
  if (signals.size === 0) signals.add("domain");
  return signals;
}

function primaryRole(signals: Set<SourceCodeAnalysisRole>): SourceCodeAnalysisRole {
  const precedence: SourceCodeAnalysisRole[] = [
    "test",
    "tooling",
    "composition",
    "ui",
    "input",
    "domainValidation",
    "integration",
    "persistence",
    "contract",
    "domain",
  ];
  return precedence.find((role) => signals.has(role)) ?? "domain";
}

export function detectMixedResponsibilityRoles(
  relativePath: string,
  moduleKey: string,
  text: string,
) {
  if (TEST_FILE_PATTERN.test(relativePath.toLowerCase())) return [];
  const signals = roleSignals(relativePath, moduleKey, text);
  const mixed = new Set<SourceCodeAnalysisRole>();
  const hasPersistence = hasDirectPersistenceAccess(text);
  const hasIntegration = hasDirectIntegrationAccess(text);
  const hasExternalSdk = hasDirectExternalSdkAccess(text);

  // Input adapters may parse and normalize, but they must hand a validated
  // command to a service instead of reading or writing Prisma themselves.
  if (signals.has("input") && hasPersistence) {
    mixed.add("input");
    mixed.add("persistence");
  }

  // Validators own rules, not fact loading. Read-only FK/state checks belong in
  // a module-private reference adapter just as writes belong in a service.
  if (isDedicatedDomainValidationSource(relativePath) && hasPersistence) {
    mixed.add("domainValidation");
    mixed.add("persistence");
  }

  // Input schemas and UI hosts may call a separate integration adapter, but a
  // single source file must not also implement the transport/SDK boundary.
  if (signals.has("input") && hasIntegration && isDedicatedIntegrationSource(relativePath)) {
    mixed.add("input");
    mixed.add("integration");
  }
  if (signals.has("ui") && signals.has("input")) {
    mixed.add("ui");
    mixed.add("input");
  }
  if (signals.has("ui") && hasExternalSdk) {
    mixed.add("ui");
    mixed.add("integration");
  }

  return SOURCE_CODE_ANALYSIS_ROLES.filter((role) => mixed.has(role));
}

function sourceRevision(repositoryRoot: string) {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim() || null;
  } catch {
    return null;
  }
}

export async function analyzeSourceCode(repositoryRoot: string): Promise<SourceCodeAnalysisSnapshot> {
  const relativePaths = await collectSourceFiles(repositoryRoot);
  const unclassifiedFiles: string[] = [];
  const ambiguousFiles: Array<{ path: string; moduleKeys: string[] }> = [];
  const files: AnalyzedFile[] = [];
  const digest = createHash("sha256");
  let governedFileCount = 0;

  for (const relativePath of relativePaths) {
    const candidates = sourceModuleDeclarationsForPath(relativePath);
    const text = await fs.readFile(path.join(repositoryRoot, relativePath), "utf8");
    if (isGeneratedSource(text)) continue;
    governedFileCount += 1;
    digest.update(relativePath).update("\0").update(text).update("\0");
    if (candidates.length === 0) {
      unclassifiedFiles.push(relativePath);
      continue;
    }
    if (candidates.length > 1) {
      ambiguousFiles.push({ path: relativePath, moduleKeys: candidates.map((candidate) => candidate.key) });
      continue;
    }
    const moduleKey = candidates[0].key;
    const signals = roleSignals(relativePath, moduleKey, text);
    const mixedRoles = detectMixedResponsibilityRoles(relativePath, moduleKey, text);
    files.push({
      path: relativePath,
      text,
      moduleKey,
      role: primaryRole(signals),
      mixedRoles,
      lines: countSourceLines(text, relativePath),
    });
  }

  const missingInterfaces: Array<{ moduleKey: string; path: string }> = [];
  for (const declaration of SOURCE_MODULE_DECLARATIONS) {
    for (const interfacePath of declaration.interfacePaths) {
      try {
        const stat = await fs.stat(path.join(repositoryRoot, interfacePath));
        if (!stat.isFile()) missingInterfaces.push({ moduleKey: declaration.key, path: interfacePath });
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
          missingInterfaces.push({ moduleKey: declaration.key, path: interfacePath });
          continue;
        }
        throw error;
      }
    }
  }

  const rows = new Map<string, SourceCodeAnalysisModuleRow>();
  for (const declaration of SOURCE_MODULE_DECLARATIONS) {
    rows.set(declaration.key, {
      key: declaration.key,
      label: declaration.label,
      category: declaration.category,
      ownerResourceKey: declaration.ownerResourceKey,
      interfacePaths: declaration.interfacePaths,
      fileCount: 0,
      lines: 0,
      roles: emptyRoleCounts(),
      dependencies: [],
      dependencyCount: 0,
      crossModuleImportCount: 0,
      mixedResponsibilityFileCount: 0,
    });
  }
  for (const file of files) {
    const row = rows.get(file.moduleKey);
    if (!row) continue;
    row.fileCount += 1;
    row.lines += file.lines;
    row.roles[file.role] += file.lines;
    if (file.mixedRoles.length > 1) row.mixedResponsibilityFileCount += 1;
  }

  const dependencyAnalysis = analyzeSourceDependencies(files, rows.keys());
  for (const [moduleKey, dependencies] of dependencyAnalysis.dependencies) {
    const row = rows.get(moduleKey);
    if (row) {
      row.dependencies = dependencies;
      row.dependencyCount = dependencies.length;
      row.crossModuleImportCount = dependencyAnalysis.crossModuleImportCounts.get(moduleKey) ?? 0;
    }
  }

  const cycles = dependencyAnalysis.cycles;
  const declaredFileCount = files.length;
  const totalFileCount = governedFileCount;
  const totalLines = [...rows.values()].reduce((sum, row) => sum + row.lines, 0);
  const mixedResponsibilityFiles = files
    .filter((file) => file.mixedRoles.length > 1)
    .map((file) => ({ path: file.path, moduleKey: file.moduleKey, roles: file.mixedRoles }));

  return {
    schemaVersion: SOURCE_CODE_ANALYSIS_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sourceRevision: sourceRevision(repositoryRoot),
    sourceDigest: digest.digest("hex"),
    declarationMode: "central-manifest",
    lineMetric: "non-empty-non-comment-source-lines",
    summary: {
      fileCount: totalFileCount,
      lines: totalLines,
      declaredFileCount,
      coveragePercent: totalFileCount === 0 ? 100 : Number(((declaredFileCount / totalFileCount) * 100).toFixed(2)),
      unclassifiedFileCount: unclassifiedFiles.length,
      ambiguousFileCount: ambiguousFiles.length,
      missingInterfaceCount: missingInterfaces.length,
      dependencyCycleCount: cycles.length,
      mixedResponsibilityFileCount: mixedResponsibilityFiles.length,
    },
    modules: [...rows.values()],
    dependencyEdges: dependencyAnalysis.dependencyEdges,
    dependencyCycles: cycles,
    diagnostics: { unclassifiedFiles, ambiguousFiles, missingInterfaces, mixedResponsibilityFiles },
  };
}
