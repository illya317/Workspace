export const SOURCE_CODE_ANALYSIS_SCHEMA_VERSION = 4 as const;

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
  "ui",
  "input",
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
  ui: "UI",
  input: "输入",
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
    reciprocalRoleDependencyCount?: number;
    runtimeReciprocalRoleDependencyCount?: number;
    typeAssistedReciprocalRoleDependencyCount?: number;
    dependencyFileCycleCount?: number;
    runtimeDependencyFileCycleCount?: number;
    typeAssistedDependencyFileCycleCount?: number;
  };
  modules: SourceCodeAnalysisModuleRow[];
  dependencyEdges: SourceCodeAnalysisDependencyEdge[];
  reciprocalRoleDependencies?: SourceCodeAnalysisReciprocalRoleDependency[];
  dependencyFileCycles?: SourceCodeAnalysisDependencyFileCycle[];
  dependencyCycles: string[][];
  diagnostics: {
    unclassifiedFiles: string[];
    ambiguousFiles: Array<{ path: string; moduleKeys: string[] }>;
    missingInterfaces: Array<{ moduleKey: string; path: string }>;
    mixedResponsibilityFiles: Array<{ path: string; moduleKey: string; roles: SourceCodeAnalysisRole[] }>;
  };
}

export function isSourceCodeAnalysisSnapshot(value: unknown): value is SourceCodeAnalysisSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<SourceCodeAnalysisSnapshot>;
  return candidate.schemaVersion === SOURCE_CODE_ANALYSIS_SCHEMA_VERSION
    && typeof candidate.generatedAt === "string"
    && typeof candidate.sourceDigest === "string"
    && Boolean(candidate.summary && typeof candidate.summary.lines === "number")
    && typeof candidate.summary?.dependencyFileCycleCount === "number"
    && Array.isArray(candidate.modules)
    && Array.isArray(candidate.dependencyEdges)
    && Array.isArray(candidate.reciprocalRoleDependencies)
    && Array.isArray(candidate.dependencyFileCycles)
    && candidate.dependencyFileCycles.every((cycle) => Array.isArray(cycle.cells));
}
