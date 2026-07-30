import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import ts from "typescript";

import {
  SOURCE_CODE_ANALYSIS_ROLES,
  SOURCE_CODE_ANALYSIS_SCHEMA_VERSION,
  type SourceCodeAnalysisCapabilityRow,
  type SourceCodeAnalysisModuleRow,
  type SourceCodeAnalysisRole,
  type SourceCodeAnalysisRoleCounts,
  type SourceCodeAnalysisSnapshot,
} from "../../../packages/platform/source-code-analysis-contract";
import { SOURCE_MODULE_DECLARATIONS, sourceModuleDeclarationsForPath } from "./declarations";
import { analyzeSourceDependencies, resolvedSourceImports } from "./dependencies";
import {
  SOURCE_CAPABILITY_DECLARATIONS,
  capabilityGovernedModuleForPath,
  readCapabilityOwnershipBaseline,
  sourceCapabilityDeclarationsForPath,
} from "./capabilities";
import {
  collectRegisteredGeneratedSourceTargets,
  collectSourceFiles,
  countSourceLines,
  isGeneratedSource,
} from "./source-files";

const TEST_FILE_PATTERN = /(?:^|\/)(?:__tests__\/|[^/]+\.(?:test|spec)\.[^.]+$)/;
interface AnalyzedFile {
  path: string;
  text: string;
  moduleKey: string;
  capabilityKey: string | null;
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

function hasApplicationRegistryImport(text: string) {
  const runtimeText = withoutTypeOnlyImports(text);
  return /(?:from|import\s*\()\s*["'][^"']*(?:registry|\/modules)(?:[^"']*)["']/.test(runtimeText);
}

function hasPersistenceContractAccess(text: string) {
  return /import\s+type\b[\s\S]*?from\s*["'][^"']*\/server\/prisma["']/.test(text);
}

function hasOrchestratorImport(text: string) {
  const runtimeText = withoutTypeOnlyImports(text);
  return /(?:from|import\s*\()\s*["'][^"']*(?:execution|proposals|runtime-binding|tools)(?:[^"']*)["']/.test(runtimeText);
}

function hasApplicationRuntimeBoundaryAccess(text: string) {
  const runtimeText = withoutTypeOnlyImports(text);
  return /(?:from|import\s*\()\s*["'][^"']*\/server\/(?:api|auth|rbac|approvals?|business-action|business-space|notifications?|tenant-config)(?:[\/.'"])/.test(runtimeText);
}

function isDedicatedIntegrationSource(relativePath: string) {
  const normalized = relativePath.toLowerCase();
  const filename = path.posix.basename(normalized);
  return normalized.includes("/integrations/")
    || normalized.includes("/integration/")
    || /\/server\/tenant-config\.[^.]+$/.test(normalized)
    || /\/server\/business-date\.[^.]+$/.test(normalized)
    || /(?:connector|webhook|onlyoffice)/.test(filename)
    || /(?:external|remote|http|api)-(?:adapter|client|gateway)/.test(filename)
    || normalized.includes("/document-editor/adapters");
}

function isDedicatedDomainValidationSource(relativePath: string) {
  const normalized = relativePath.toLowerCase();
  const filename = path.posix.basename(normalized);
  if (normalized.startsWith("app/")) return false;
  return /(?:validation|validator)/.test(filename)
    || /\/(?:validation|validators)\//.test(normalized);
}

function parsedTypeScriptSource(relativePath: string, text: string) {
  return ts.createSourceFile(
    relativePath,
    text,
    ts.ScriptTarget.Latest,
    false,
    relativePath.endsWith(".tsx") || relativePath.endsWith(".jsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function hasJsxSyntax(relativePath: string, text: string) {
  if (!/\.[cm]?[jt]sx?$/.test(relativePath)) return false;
  let found = false;
  function visit(node: ts.Node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
      found = true;
      return;
    }
    if (!found) ts.forEachChild(node, visit);
  }
  visit(parsedTypeScriptSource(relativePath, text));
  return found;
}

function isPublicAssemblySource(relativePath: string, text: string) {
  if (!/\.[cm]?[jt]sx?$/.test(relativePath)) return false;
  let hasModuleReExport = false;
  const statementsAreAssemblyOnly = parsedTypeScriptSource(relativePath, text).statements.every((statement) => {
    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier) {
      hasModuleReExport = true;
      return true;
    }
    return ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression);
  });
  return hasModuleReExport && statementsAreAssemblyOnly;
}

function hasRuntimeImport(relativePath: string, text: string) {
  if (!/\.[cm]?[jt]sx?$/.test(relativePath)) return false;
  return parsedTypeScriptSource(relativePath, text).statements.some((statement) => {
    if (!ts.isImportDeclaration(statement)) return false;
    if (!statement.importClause?.isTypeOnly) return true;
    return false;
  });
}

function hasExecutableFunction(relativePath: string, text: string) {
  if (!/\.[cm]?[jt]sx?$/.test(relativePath)) return false;
  return parsedTypeScriptSource(relativePath, text).statements.some((statement) => {
    if (ts.isFunctionDeclaration(statement) && statement.body) return true;
    if (!ts.isVariableStatement(statement)) return false;
    return statement.declarationList.declarations.some((declaration) =>
      declaration.initializer
      && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer)));
  });
}

function isTypeDeclarationOnlySource(relativePath: string, text: string) {
  if (!/\.[cm]?[jt]sx?$/.test(relativePath)) return false;
  let hasTypeDeclaration = false;
  const declarationsOnly = parsedTypeScriptSource(relativePath, text).statements.every((statement) => {
    if (ts.isImportDeclaration(statement)) return statement.importClause?.isTypeOnly === true;
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) {
      hasTypeDeclaration = true;
      return true;
    }
    if (ts.isExportDeclaration(statement) && !statement.moduleSpecifier) {
      hasTypeDeclaration = true;
      return statement.isTypeOnly;
    }
    return ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression);
  });
  return hasTypeDeclaration && declarationsOnly;
}

function hasInputShapingSignal(relativePath: string, text: string) {
  const filename = path.posix.basename(relativePath.toLowerCase());
  return /(?:schema|route-input|route-command|request-shape)/.test(filename)
    || /\bz\s*\.\s*object\s*\(/.test(text);
}

function hasNamedInputSignal(relativePath: string) {
  const normalized = relativePath.toLowerCase();
  const filename = path.posix.basename(normalized);
  return /(?:schema|route-input|route-handler|request-shape)/.test(filename)
    || (normalized.includes("/server/") && /(?:^|[-.])input\.[^.]+$/.test(filename));
}

function roleSignals(relativePath: string, moduleKey: string, text: string) {
  const normalized = relativePath.toLowerCase();
  const filename = path.posix.basename(normalized);
  const isAppSource = normalized.startsWith("app/");
  const isStyleSource = normalized.endsWith(".css") || normalized.endsWith(".scss");
  const hasInputSignal = hasInputShapingSignal(relativePath, text);
  const hasRoleInputSignal = isAppSource ? hasInputSignal : hasNamedInputSignal(relativePath);
  const isSchemaSource = /schema/.test(filename);
  const hasInboundHandlerSignal = /\brequest\s*:\s*(?:Next)?Request\b/.test(text)
    && /\bparse\w*Request\b/.test(text);
  const isRouteCommandFacade = /(?:^|[-.])route-commands?\.[^.]+$/.test(filename);
  const isExecutableInput = !isAppSource
    && (hasRoleInputSignal || hasInboundHandlerSignal)
    && !isSchemaSource
    && hasExecutableFunction(relativePath, text);
  const isExecutableContractFacade = /api-contract\.[^.]+$/.test(filename)
    && hasExecutableFunction(relativePath, text);
  const isRuntimeRegistry = /(?:^|[-.])registry\.[^.]+$/.test(filename)
    && hasRuntimeImport(relativePath, text);
  const isPurePlatformContract = moduleKey === "platform"
    && /^packages\/platform\/[^/]+\.[cm]?[jt]sx?$/.test(normalized)
    && !hasRuntimeImport(relativePath, text);
  const isTypeOnlyContract = isTypeDeclarationOnlySource(relativePath, text);
  const hasContractSignal = normalized.includes("/types/")
    || normalized.includes("/constants/")
    || normalized.includes("/contracts/")
    || (!isAppSource && (
      !normalized.includes("/server/") && /^tenant-config\.[^.]+$/.test(filename)
    ))
    || /(?:contract|types?|constants?|schema)\.[^.]+$/.test(filename)
    || (/(?:^|[-.])registry\.[^.]+$/.test(filename) && !isRuntimeRegistry)
    || (!isAppSource && hasRoleInputSignal && !isRouteCommandFacade && !isExecutableInput)
    || isPurePlatformContract
    || isTypeOnlyContract;
  const isAssemblySource = !isAppSource && isPublicAssemblySource(relativePath, text);
  const isRegistrationSource = !isAppSource && /^(?:module)\.[^.]+$/.test(filename);
  const hasExplicitIntegrationSignal = isDedicatedIntegrationSource(relativePath);
  const isUiSource = isStyleSource || (!isAppSource && (
    ((normalized.includes("/ui/") || normalized.includes("/showcase/") || normalized.includes("/hooks/"))
      && !isAssemblySource && !hasExplicitIntegrationSignal)
    || (normalized.endsWith(".tsx") && (
      hasJsxSyntax(relativePath, text)
      || /(?:nav|page|panel|view|icon)/.test(filename)
    ))
    || (/^use-[^.]+\.(?:ts|tsx)$/.test(filename) && normalized.includes("/ui/"))
  ));
  const signals = new Set<SourceCodeAnalysisRole>();

  if (TEST_FILE_PATTERN.test(normalized)) return new Set<SourceCodeAnalysisRole>(["test"]);
  if (moduleKey === "operations" || moduleKey === "tooling") return new Set<SourceCodeAnalysisRole>(["tooling"]);
  if (moduleKey === "data-model") return new Set<SourceCodeAnalysisRole>(["persistence"]);
  if (isStyleSource) signals.add("ui");
  if (moduleKey === "application-shell") {
    if (!isStyleSource) signals.add("composition");
  } else if (isAppSource) signals.add(filename === "route.ts" || hasInputSignal ? "input" : "composition");
  else if (isAssemblySource) signals.add("assembly");
  else if (isRegistrationSource) signals.add("composition");
  else if (isUiSource) signals.add("ui");

  if ((isAppSource && hasRoleInputSignal) || isExecutableInput) signals.add("input");
  const isDomainValidationSource = !isUiSource
    && !isAppSource
    && !/(?:response|route)/.test(filename)
    && (
      /(?:validation|validator)/.test(filename)
      || /\/(?:validation|validators)\//.test(normalized)
    );
  const isFactAwareValidation = isDomainValidationSource && (
    /reference-adapter/.test(text)
    || /reference-validation/.test(filename)
    || /(?:from|import\s*\()\s*["'][^"']*\/server\/(?!domain(?:\/|-validation(?:\.|["'])))/.test(text)
    || hasApplicationRegistryImport(text)
  );
  const isPureDomainLocation = normalized.includes("/server/domain/") || /(?:^|\/)domain-validation\.[^.]+$/.test(normalized);
  if (
    !isUiSource
    && !isAppSource
    && isDomainValidationSource
    && !isFactAwareValidation
  ) {
    signals.add("domainValidation");
  }
  if (
    !isUiSource && !isDomainValidationSource && (
      /(?:prisma|repository|persistence|data-access|reference-adapter|store|(?:^|[-.])db\.)/.test(filename)
      || (hasDirectPersistenceAccess(text)
        && /(?:policy-(?:resolver|scope)|account-resolver)/.test(filename)
        && !hasApplicationRuntimeBoundaryAccess(text))
      || /\/server\/relation-registry\.[^.]+$/.test(normalized)
      || normalized.includes("/dal/")
    )
  ) {
    signals.add("persistence");
  }
  if (
    hasExplicitIntegrationSignal
    && !isAppSource
    && !hasOrchestratorImport(text)
    && !hasDirectPersistenceAccess(text)
  ) {
    signals.add("integration");
  }
  if (!isAssemblySource && hasContractSignal && !isExecutableContractFacade) signals.add("contract");
  if (
    !isUiSource
    && !isAppSource
    && !isAssemblySource
    && (
      (normalized.includes("/server/")
        && !isPureDomainLocation
        && !isTypeOnlyContract)
      || normalized.includes("/import/")
      || (!isAppSource && /^packages\/[^/]+\/index\.[cm]?[jt]sx?$/.test(normalized))
      || /(?:service|actions?|approvals?|authorization|command|execution|handler|resolver|engine|use-case|workflow)/.test(filename)
      || isRuntimeRegistry
      || isExecutableContractFacade
      || hasApplicationRegistryImport(text)
      || hasOrchestratorImport(text)
      || hasPersistenceContractAccess(text)
      || hasDirectPersistenceAccess(text)
      || /reference-adapter/.test(text)
      || isFactAwareValidation
    )
  ) signals.add("application");
  if (signals.size === 0) signals.add("domain");
  return signals;
}

function isPureServerApplicationCandidate(file: AnalyzedFile) {
  const normalized = file.path.toLowerCase();
  const filename = path.posix.basename(normalized);
  if (file.role !== "application"
    || !/^packages\/[^/]+\/server\//.test(normalized)
    || normalized.includes("/server/domain/")) return false;
  if (hasDirectPersistenceAccess(file.text)
    || hasDirectIntegrationAccess(file.text)
    || hasApplicationRegistryImport(file.text)
    || hasOrchestratorImport(file.text)
    || hasPersistenceContractAccess(file.text)
    || /reference-adapter/.test(file.text)) return false;
  return !/(?:service|actions?|approvals?|authorization|command|execution|executor|handler|resolver|engine|use-case|facade|storage|queue|scheduler|lifecycle|guard|delete|runtime|directory|dto)/.test(filename);
}

function inferPureServerDomains(files: AnalyzedFile[], externalSourceTargets: ReadonlySet<string>) {
  const importsByPath = resolvedSourceImports(files, externalSourceTargets);
  const filesByPath = new Map(files.map((file) => [file.path, file]));
  const resultByPath = new Map<string, boolean>();
  const visiting = new Set<string>();

  function isPure(file: AnalyzedFile): boolean {
    const cached = resultByPath.get(file.path);
    if (cached !== undefined) return cached;
    if (!isPureServerApplicationCandidate(file) || visiting.has(file.path)) return false;
    visiting.add(file.path);
    const pure = (importsByPath.get(file.path) ?? []).every((dependency) => {
      const target = filesByPath.get(dependency.targetPath);
      if (!target || ["contract", "domain", "domainValidation"].includes(target.role)) return true;
      return target.role === "application" && isPureServerApplicationCandidate(target) && isPure(target);
    });
    visiting.delete(file.path);
    resultByPath.set(file.path, pure);
    return pure;
  }

  for (const file of files) {
    if (isPure(file)) file.role = "domain";
  }
}

function primaryRole(signals: Set<SourceCodeAnalysisRole>): SourceCodeAnalysisRole {
  const precedence: SourceCodeAnalysisRole[] = [
    "test",
    "tooling",
    "composition",
    "assembly",
    "ui",
    "input",
    "contract",
    "integration",
    "persistence",
    "domainValidation",
    "application",
    "domain",
  ];
  return precedence.find((role) => signals.has(role)) ?? "domain";
}

export function classifySourceCodeRole(relativePath: string, moduleKey: string, text: string) {
  return primaryRole(roleSignals(relativePath, moduleKey, text));
}

export function detectMixedResponsibilityRoles(
  relativePath: string,
  moduleKey: string,
  text: string,
) {
  if (TEST_FILE_PATTERN.test(relativePath.toLowerCase())) return [];
  const signals = roleSignals(relativePath, moduleKey, text);
  const mixed = new Set<SourceCodeAnalysisRole>();
  const hasInputSignal = hasInputShapingSignal(relativePath, text);
  const hasPersistence = hasDirectPersistenceAccess(text);
  const hasIntegration = hasDirectIntegrationAccess(text);
  const hasExternalSdk = hasDirectExternalSdkAccess(text);

  // Input adapters may parse and normalize, but they must hand a validated
  // command to a service instead of reading or writing Prisma themselves.
  if (hasInputSignal && hasPersistence) {
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
  if (hasInputSignal && hasIntegration && isDedicatedIntegrationSource(relativePath)) {
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
  const [relativePaths, externalSourceTargets, capabilityBaseline] = await Promise.all([
    collectSourceFiles(repositoryRoot),
    collectRegisteredGeneratedSourceTargets(repositoryRoot),
    readCapabilityOwnershipBaseline(repositoryRoot),
  ]);
  const unclassifiedFiles: string[] = [];
  const ambiguousFiles: Array<{ path: string; moduleKeys: string[] }> = [];
  const legacyCapabilityPaths = new Set(Object.values(capabilityBaseline.legacyUnclassifiedFiles).flat());
  const legacyUnclassifiedCapabilityFiles: Array<{ path: string; moduleKey: string }> = [];
  const newUnclassifiedCapabilityFiles: Array<{ path: string; moduleKey: string }> = [];
  const ambiguousCapabilityFiles: Array<{ path: string; moduleKey: string; capabilityKeys: string[] }> = [];
  const files: AnalyzedFile[] = [];
  const digest = createHash("sha256");
  let governedFileCount = 0;
  let capabilityGovernedFileCount = 0;
  let capabilityDeclaredFileCount = 0;

  for (const relativePath of relativePaths) {
    const candidates = sourceModuleDeclarationsForPath(relativePath);
    const text = await fs.readFile(path.join(repositoryRoot, relativePath), "utf8");
    if (isGeneratedSource(relativePath, text)) continue;
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
    let capabilityKey: string | null = null;
    if (capabilityGovernedModuleForPath(relativePath) === moduleKey) {
      capabilityGovernedFileCount += 1;
      const capabilityCandidates = sourceCapabilityDeclarationsForPath(moduleKey, relativePath);
      if (capabilityCandidates.length === 0) {
        const diagnostic = { path: relativePath, moduleKey };
        if (legacyCapabilityPaths.has(relativePath)) legacyUnclassifiedCapabilityFiles.push(diagnostic);
        else newUnclassifiedCapabilityFiles.push(diagnostic);
      } else if (capabilityCandidates.length > 1) {
        ambiguousCapabilityFiles.push({
          path: relativePath,
          moduleKey,
          capabilityKeys: capabilityCandidates.map((candidate) => candidate.key).sort(),
        });
      } else {
        capabilityKey = capabilityCandidates[0].key;
        capabilityDeclaredFileCount += 1;
      }
    }
    const signals = roleSignals(relativePath, moduleKey, text);
    const mixedRoles = detectMixedResponsibilityRoles(relativePath, moduleKey, text);
    files.push({
      path: relativePath,
      text,
      moduleKey,
      capabilityKey,
      role: primaryRole(signals),
      mixedRoles,
      lines: countSourceLines(text, relativePath),
    });
  }

  inferPureServerDomains(files, externalSourceTargets);

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

  const capabilityRows = new Map<string, SourceCodeAnalysisCapabilityRow>();
  for (const declaration of SOURCE_CAPABILITY_DECLARATIONS) {
    capabilityRows.set(`${declaration.moduleKey}\0${declaration.key}`, {
      moduleKey: declaration.moduleKey,
      key: declaration.key,
      label: declaration.label,
      fileCount: 0,
      lines: 0,
      roles: emptyRoleCounts(),
      dependencies: [],
      dependencyCount: 0,
      crossCapabilityImportCount: 0,
      mixedResponsibilityFileCount: 0,
    });
  }
  for (const file of files) {
    if (!file.capabilityKey) continue;
    const row = capabilityRows.get(`${file.moduleKey}\0${file.capabilityKey}`);
    if (!row) throw new Error(`[source-code-analysis] undeclared capability row: ${file.moduleKey}/${file.capabilityKey}`);
    row.fileCount += 1;
    row.lines += file.lines;
    row.roles[file.role] += file.lines;
    if (file.mixedRoles.length > 1) row.mixedResponsibilityFileCount += 1;
  }

  const dependencyAnalysis = analyzeSourceDependencies(files, rows.keys(), externalSourceTargets);
  for (const [moduleKey, dependencies] of dependencyAnalysis.dependencies) {
    const row = rows.get(moduleKey);
    if (row) {
      row.dependencies = dependencies;
      row.dependencyCount = dependencies.length;
      row.crossModuleImportCount = dependencyAnalysis.crossModuleImportCounts.get(moduleKey) ?? 0;
    }
  }
  const capabilityDependencies = new Map<string, Map<string, { moduleKey: string; capabilityKey: string | null }>>();
  for (const edge of dependencyAnalysis.capabilityDependencyEdges) {
    if (!edge.sourceCapabilityKey) continue;
    if (edge.sourceModuleKey === edge.targetModuleKey && edge.sourceCapabilityKey === edge.targetCapabilityKey) continue;
    const rowKey = `${edge.sourceModuleKey}\0${edge.sourceCapabilityKey}`;
    const row = capabilityRows.get(rowKey);
    if (!row) throw new Error(`[source-code-analysis] capability dependency source is undeclared: ${rowKey}`);
    row.crossCapabilityImportCount += edge.importCount;
    const dependencies = capabilityDependencies.get(rowKey) ?? new Map();
    const dependencyKey = `${edge.targetModuleKey}\0${edge.targetCapabilityKey ?? ""}`;
    dependencies.set(dependencyKey, {
      moduleKey: edge.targetModuleKey,
      capabilityKey: edge.targetCapabilityKey,
    });
    capabilityDependencies.set(rowKey, dependencies);
  }
  for (const [rowKey, dependencies] of capabilityDependencies) {
    const row = capabilityRows.get(rowKey);
    if (!row) continue;
    row.dependencies = [...dependencies.values()].sort((left, right) =>
      [left.moduleKey, left.capabilityKey ?? ""].join("\0")
        .localeCompare([right.moduleKey, right.capabilityKey ?? ""].join("\0")));
    row.dependencyCount = row.dependencies.length;
  }
  const l1ImportCount = dependencyAnalysis.dependencyEdges.reduce((sum, edge) => sum + edge.importCount, 0);
  const capabilityImportCount = dependencyAnalysis.capabilityDependencyEdges
    .reduce((sum, edge) => sum + edge.importCount, 0);
  if (l1ImportCount !== capabilityImportCount) {
    throw new Error(
      `[source-code-analysis] capability edge import total ${capabilityImportCount} does not match L1 total ${l1ImportCount}`,
    );
  }

  const cycles = dependencyAnalysis.cycles;
  const reciprocalRoleDependencies = dependencyAnalysis.reciprocalRoleDependencies;
  const runtimeReciprocalRoleDependencyCount = reciprocalRoleDependencies
    .filter((dependency) => dependency.classification === "runtime").length;
  const dependencyFileCycles = dependencyAnalysis.dependencyFileCycles;
  const invalidDependencyDirections = dependencyAnalysis.invalidDependencyDirections;
  const runtimeDependencyFileCycleCount = dependencyFileCycles
    .filter((cycle) => cycle.classification === "runtime").length;
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
      reciprocalRoleDependencyCount: reciprocalRoleDependencies.length,
      runtimeReciprocalRoleDependencyCount,
      typeAssistedReciprocalRoleDependencyCount: reciprocalRoleDependencies.length - runtimeReciprocalRoleDependencyCount,
      dependencyFileCycleCount: dependencyFileCycles.length,
      runtimeDependencyFileCycleCount,
      typeAssistedDependencyFileCycleCount: dependencyFileCycles.length - runtimeDependencyFileCycleCount,
      invalidDependencyDirectionCount: invalidDependencyDirections.length,
      capabilityGovernedFileCount,
      capabilityDeclaredFileCount,
      capabilityCoveragePercent: capabilityGovernedFileCount === 0
        ? 100
        : Number(((capabilityDeclaredFileCount / capabilityGovernedFileCount) * 100).toFixed(2)),
      legacyUnclassifiedCapabilityFileCount: legacyUnclassifiedCapabilityFiles.length,
      newUnclassifiedCapabilityFileCount: newUnclassifiedCapabilityFiles.length,
      ambiguousCapabilityFileCount: ambiguousCapabilityFiles.length,
    },
    modules: [...rows.values()],
    capabilities: [...capabilityRows.values()],
    dependencyEdges: dependencyAnalysis.dependencyEdges,
    capabilityDependencyEdges: dependencyAnalysis.capabilityDependencyEdges,
    reciprocalRoleDependencies,
    dependencyFileCycles,
    invalidDependencyDirections,
    dependencyCycles: cycles,
    diagnostics: {
      unclassifiedFiles,
      ambiguousFiles,
      missingInterfaces,
      mixedResponsibilityFiles,
      legacyUnclassifiedCapabilityFiles,
      newUnclassifiedCapabilityFiles,
      ambiguousCapabilityFiles,
    },
  };
}
