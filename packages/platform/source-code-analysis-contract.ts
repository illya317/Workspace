export const SOURCE_CODE_ANALYSIS_SCHEMA_VERSION = 6 as const;

export const SOURCE_CODE_ANALYSIS_MODULE_CATEGORIES = [
  "product",
  "system",
  "shared",
  "composition",
  "dataEngineering",
  "engineering",
] as const;

export type SourceCodeAnalysisModuleCategory = (typeof SOURCE_CODE_ANALYSIS_MODULE_CATEGORIES)[number];

export const SOURCE_CODE_ANALYSIS_MODULE_CATEGORY_LABELS: Record<SourceCodeAnalysisModuleCategory, string> = {
  product: "产品 L1",
  system: "系统能力",
  shared: "共享架构",
  composition: "组合层",
  dataEngineering: "数据工程",
  engineering: "工程支撑",
};

export const SOURCE_CODE_ANALYSIS_ROLES = [
  "assembly",
  "ui",
  "input",
  "application",
  "domainValidation",
  "domain",
  "persistence",
  "integration",
  "composition",
  "contract",
  "test",
  "tooling",
] as const;

export type SourceCodeAnalysisRole = (typeof SOURCE_CODE_ANALYSIS_ROLES)[number];

export const SOURCE_CODE_ANALYSIS_ROLE_LABELS: Record<SourceCodeAnalysisRole, string> = {
  assembly: "公共出口",
  ui: "UI",
  input: "输入",
  application: "应用服务",
  domainValidation: "领域校验",
  domain: "业务",
  persistence: "数据访问",
  integration: "外部集成",
  composition: "组合壳",
  contract: "契约",
  test: "模块测试",
  tooling: "工程实现",
};

export type SourceCodeAnalysisRoleCounts = Record<SourceCodeAnalysisRole, number>;

export const SOURCE_CODE_ANALYSIS_DEPENDENCY_KINDS = [
  "valueImport",
  "typeOnlyImport",
  "dynamicImport",
  "reExport",
  "typeOnlyReExport",
] as const;

export type SourceCodeAnalysisDependencyKind = (typeof SOURCE_CODE_ANALYSIS_DEPENDENCY_KINDS)[number];

export interface SourceCodeAnalysisDependencyEvidence {
  sourcePath: string;
  targetPath: string;
  kind: SourceCodeAnalysisDependencyKind;
}

export interface SourceCodeAnalysisDependencyEdge {
  sourceModuleKey: string;
  sourceRole: SourceCodeAnalysisRole;
  targetModuleKey: string;
  targetRole: SourceCodeAnalysisRole;
  importCount: number;
  valueImportCount?: number;
  typeOnlyImportCount?: number;
  dynamicImportCount?: number;
  reExportCount?: number;
  typeOnlyReExportCount?: number;
}

export interface SourceCodeAnalysisDependencyCell {
  moduleKey: string;
  capabilityKey: string | null;
  role: SourceCodeAnalysisRole;
}

export interface SourceCodeAnalysisDependencyDirection {
  importCount: number;
  valueImportCount: number;
  typeOnlyImportCount: number;
  dynamicImportCount: number;
  reExportCount: number;
  typeOnlyReExportCount: number;
  evidence: SourceCodeAnalysisDependencyEvidence[];
}

export interface SourceCodeAnalysisReciprocalRoleDependency {
  left: SourceCodeAnalysisDependencyCell;
  right: SourceCodeAnalysisDependencyCell;
  classification: "runtime" | "type-assisted";
  leftToRight: SourceCodeAnalysisDependencyDirection;
  rightToLeft: SourceCodeAnalysisDependencyDirection;
}

export interface SourceCodeAnalysisDependencyFileCycle {
  classification: "runtime" | "type-assisted";
  paths: string[];
  cells: SourceCodeAnalysisDependencyCell[];
  evidence: SourceCodeAnalysisDependencyEvidence[];
}

export const SOURCE_CODE_ANALYSIS_INVALID_DIRECTION_REASONS = [
  "upwardModuleDependency",
  "crossBusinessDependency",
  "reverseRoleDependency",
  "forbiddenLayerShortcut",
  "implementationImportsOwnAssembly",
  "productionImportsTest",
  "productionImportsTooling",
] as const;

export type SourceCodeAnalysisInvalidDirectionReason =
  (typeof SOURCE_CODE_ANALYSIS_INVALID_DIRECTION_REASONS)[number];

export interface SourceCodeAnalysisInvalidDependencyDirection extends SourceCodeAnalysisDependencyEvidence {
  sourceModuleKey: string;
  sourceCapabilityKey: string | null;
  sourceRole: SourceCodeAnalysisRole;
  targetModuleKey: string;
  targetCapabilityKey: string | null;
  targetRole: SourceCodeAnalysisRole;
  reason: SourceCodeAnalysisInvalidDirectionReason;
}

export interface SourceCodeAnalysisCapabilityDependencyEdge {
  sourceModuleKey: string;
  sourceCapabilityKey: string | null;
  sourceRole: SourceCodeAnalysisRole;
  targetModuleKey: string;
  targetCapabilityKey: string | null;
  targetRole: SourceCodeAnalysisRole;
  importCount: number;
  valueImportCount: number;
  typeOnlyImportCount: number;
  dynamicImportCount: number;
  reExportCount: number;
  typeOnlyReExportCount: number;
}

export interface SourceCodeAnalysisCapabilityDependency {
  moduleKey: string;
  capabilityKey: string | null;
}

export interface SourceCodeAnalysisCapabilityRow {
  moduleKey: string;
  key: string;
  label: string;
  fileCount: number;
  lines: number;
  roles: SourceCodeAnalysisRoleCounts;
  dependencies: SourceCodeAnalysisCapabilityDependency[];
  dependencyCount: number;
  crossCapabilityImportCount: number;
  mixedResponsibilityFileCount: number;
}

export interface SourceCodeAnalysisModuleRow {
  key: string;
  label: string;
  category: SourceCodeAnalysisModuleCategory;
  ownerResourceKey: string | null;
  interfacePaths: string[];
  fileCount: number;
  lines: number;
  roles: SourceCodeAnalysisRoleCounts;
  dependencies: string[];
  dependencyCount: number;
  crossModuleImportCount: number;
  mixedResponsibilityFileCount: number;
}

export interface SourceCodeAnalysisSnapshot {
  schemaVersion: typeof SOURCE_CODE_ANALYSIS_SCHEMA_VERSION;
  generatedAt: string;
  sourceRevision: string | null;
  sourceDigest: string;
  declarationMode: "central-manifest";
  lineMetric: "non-empty-non-comment-source-lines";
  summary: {
    fileCount: number;
    lines: number;
    declaredFileCount: number;
    coveragePercent: number;
    unclassifiedFileCount: number;
    ambiguousFileCount: number;
    missingInterfaceCount: number;
    dependencyCycleCount: number;
    mixedResponsibilityFileCount: number;
    reciprocalRoleDependencyCount: number;
    runtimeReciprocalRoleDependencyCount: number;
    typeAssistedReciprocalRoleDependencyCount: number;
    dependencyFileCycleCount: number;
    runtimeDependencyFileCycleCount: number;
    typeAssistedDependencyFileCycleCount: number;
    invalidDependencyDirectionCount: number;
    capabilityGovernedFileCount: number;
    capabilityDeclaredFileCount: number;
    capabilityCoveragePercent: number;
    legacyUnclassifiedCapabilityFileCount: number;
    newUnclassifiedCapabilityFileCount: number;
    ambiguousCapabilityFileCount: number;
  };
  modules: SourceCodeAnalysisModuleRow[];
  capabilities: SourceCodeAnalysisCapabilityRow[];
  dependencyEdges: SourceCodeAnalysisDependencyEdge[];
  capabilityDependencyEdges: SourceCodeAnalysisCapabilityDependencyEdge[];
  reciprocalRoleDependencies: SourceCodeAnalysisReciprocalRoleDependency[];
  dependencyFileCycles: SourceCodeAnalysisDependencyFileCycle[];
  invalidDependencyDirections: SourceCodeAnalysisInvalidDependencyDirection[];
  dependencyCycles: string[][];
  diagnostics: {
    unclassifiedFiles: string[];
    ambiguousFiles: Array<{ path: string; moduleKeys: string[] }>;
    missingInterfaces: Array<{ moduleKey: string; path: string }>;
    mixedResponsibilityFiles: Array<{ path: string; moduleKey: string; roles: SourceCodeAnalysisRole[] }>;
    legacyUnclassifiedCapabilityFiles: Array<{ path: string; moduleKey: string }>;
    newUnclassifiedCapabilityFiles: Array<{ path: string; moduleKey: string }>;
    ambiguousCapabilityFiles: Array<{ path: string; moduleKey: string; capabilityKeys: string[] }>;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isCapabilityKey(value: unknown) {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function isNullableCapabilityKey(value: unknown) {
  return value === null || isCapabilityKey(value);
}

export function isSourceCodeAnalysisSnapshot(value: unknown): value is SourceCodeAnalysisSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<SourceCodeAnalysisSnapshot>;
  return candidate.schemaVersion === SOURCE_CODE_ANALYSIS_SCHEMA_VERSION
    && typeof candidate.generatedAt === "string"
    && typeof candidate.sourceDigest === "string"
    && Boolean(candidate.summary && typeof candidate.summary.lines === "number")
    && typeof candidate.summary?.reciprocalRoleDependencyCount === "number"
    && typeof candidate.summary?.runtimeReciprocalRoleDependencyCount === "number"
    && typeof candidate.summary?.typeAssistedReciprocalRoleDependencyCount === "number"
    && typeof candidate.summary?.dependencyFileCycleCount === "number"
    && typeof candidate.summary?.runtimeDependencyFileCycleCount === "number"
    && typeof candidate.summary?.typeAssistedDependencyFileCycleCount === "number"
    && Array.isArray(candidate.modules)
    && Array.isArray(candidate.dependencyEdges)
    && Array.isArray(candidate.reciprocalRoleDependencies)
    && Array.isArray(candidate.dependencyFileCycles)
    && candidate.dependencyFileCycles.every((cycle) =>
      isRecord(cycle)
      && Array.isArray(cycle.cells)
      && cycle.cells.every((cell) => isRecord(cell) && isNullableCapabilityKey(cell.capabilityKey)))
    && typeof candidate.summary?.invalidDependencyDirectionCount === "number"
    && typeof candidate.summary?.capabilityGovernedFileCount === "number"
    && typeof candidate.summary?.capabilityDeclaredFileCount === "number"
    && typeof candidate.summary?.capabilityCoveragePercent === "number"
    && typeof candidate.summary?.legacyUnclassifiedCapabilityFileCount === "number"
    && typeof candidate.summary?.newUnclassifiedCapabilityFileCount === "number"
    && typeof candidate.summary?.ambiguousCapabilityFileCount === "number"
    && Array.isArray(candidate.capabilities)
    && candidate.capabilities.every((capability) =>
      isRecord(capability)
      && isCapabilityKey(capability.key)
      && typeof capability.moduleKey === "string"
      && typeof capability.label === "string"
      && typeof capability.fileCount === "number"
      && typeof capability.lines === "number")
    && Array.isArray(candidate.capabilityDependencyEdges)
    && candidate.capabilityDependencyEdges.every((edge) =>
      isRecord(edge)
      && typeof edge.sourceModuleKey === "string"
      && isNullableCapabilityKey(edge.sourceCapabilityKey)
      && typeof edge.targetModuleKey === "string"
      && isNullableCapabilityKey(edge.targetCapabilityKey)
      && typeof edge.importCount === "number")
    && Array.isArray(candidate.invalidDependencyDirections)
    && candidate.invalidDependencyDirections.every((direction) =>
      isRecord(direction)
      && isNullableCapabilityKey(direction.sourceCapabilityKey)
      && isNullableCapabilityKey(direction.targetCapabilityKey))
    && Array.isArray(candidate.diagnostics?.legacyUnclassifiedCapabilityFiles)
    && Array.isArray(candidate.diagnostics?.newUnclassifiedCapabilityFiles)
    && Array.isArray(candidate.diagnostics?.ambiguousCapabilityFiles);
}
