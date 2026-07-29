export const SOURCE_CODE_ANALYSIS_SCHEMA_VERSION = 2 as const;

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
  };
  modules: SourceCodeAnalysisModuleRow[];
  dependencyCycles: string[][];
  diagnostics: {
    unclassifiedFiles: string[];
    ambiguousFiles: Array<{ path: string; moduleKeys: string[] }>;
    missingInterfaces: Array<{ moduleKey: string; path: string }>;
    mixedResponsibilityFiles: Array<{ path: string; moduleKey: string; roles: SourceCodeAnalysisRole[] }>;
  };
}
