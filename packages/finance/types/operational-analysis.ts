import type {
  WorkspaceApiOperationalAnalysisDefinition,
  WorkspaceSourcesOperationalAnalysisDefinition,
} from "@workspace/platform/workspace-analysis-source-contract";

export type OperationalAnalysisScopeType = "personal" | "department" | "project";

export type SalesAnalysisFilterKey =
  | "periodMode"
  | "period"
  | "groupBy"
  | "metric"
  | "sortOrder"
  | "pageSize";

export type SalesAnalysisBlock =
  | { kind: "salesMetrics" }
  | { kind: "salesCharts" }
  | { kind: "salesSummary" }
  | { kind: "salesDetails" }
  | { kind: "note"; title?: string; content: string };

export type SalesOperationalAnalysisDefinition = {
  schemaVersion: 1;
  dataset: "sales.shipments";
  layout?: "stack" | "grid";
  filters: SalesAnalysisFilterKey[];
  blocks: SalesAnalysisBlock[];
};

export type CostAnalysisFilterKey = "year" | "month" | "product";

export type CostAnalysisMetricKey =
  | "rawMaterials"
  | "packagingMaterials"
  | "directLabor"
  | "auxiliaryLabor"
  | "utilities"
  | "depreciation"
  | "otherManufacturingCost"
  | "manufacturingCost"
  | "quantity"
  | "unitCost";

export const COST_ANALYSIS_METRIC_LABELS: Record<CostAnalysisMetricKey, string> = {
  rawMaterials: "原材料",
  packagingMaterials: "包装材料",
  directLabor: "直接人工",
  auxiliaryLabor: "辅助人工",
  utilities: "水电燃气",
  depreciation: "折旧",
  otherManufacturingCost: "其他制造费用",
  manufacturingCost: "制造成本",
  quantity: "入库数量",
  unitCost: "单位成本",
};

export type CostAnalysisBlock =
  | { kind: "costMetrics"; metrics: CostAnalysisMetricKey[] }
  | { kind: "costTrend"; title?: string; metric: CostAnalysisMetricKey; comparison?: "none" | "monthOverMonth" | "yearOverYear" | "both" }
  | { kind: "costBreakdown"; title?: string; metrics: CostAnalysisMetricKey[] }
  | { kind: "costRanking"; title?: string; metric: CostAnalysisMetricKey; limit?: number }
  | { kind: "costTable"; title?: string; metrics: CostAnalysisMetricKey[]; limit?: number }
  | { kind: "note"; title?: string; content: string };

export type CostOperationalAnalysisDefinition = {
  schemaVersion: 1;
  dataset: "finance.costStructure";
  layout?: "stack" | "grid";
  filters: CostAnalysisFilterKey[];
  defaults?: { year?: number; month?: number; product?: string };
  blocks: CostAnalysisBlock[];
};

export type {
  WorkspaceAnalysisRuntimeBlock,
  WorkspaceAnalysisRuntimeDTO,
  WorkspaceAnalysisRuntimeFilter,
  WorkspaceApiBlock,
  WorkspaceApiFilter,
  WorkspaceApiMetric,
  WorkspaceApiOperationalAnalysisDefinition,
  WorkspaceApiQueryBinding,
  WorkspaceApiQueryValue,
  WorkspaceApiSource,
  WorkspaceApiTableColumn,
  WorkspaceApiValueFormat,
  WorkspaceSourcesOperationalAnalysisDefinition,
} from "@workspace/platform/workspace-analysis-source-contract";

export type OperationalAnalysisDefinition =
  | SalesOperationalAnalysisDefinition
  | CostOperationalAnalysisDefinition
  | WorkspaceApiOperationalAnalysisDefinition
  | WorkspaceSourcesOperationalAnalysisDefinition;

export type OperationalAnalysisTemplateRevisionKind =
  | "legacy"
  | "draft"
  | "publish"
  | "rollback"
  | "discard"
  | "archive"
  | "restore";

export type OperationalAnalysisTemplateLifecycleAction =
  | "publish"
  | "rollback"
  | "discard"
  | "archive"
  | "restore";

export type OperationalAnalysisTemplateLifecycleActionDTO = {
  enabled: boolean;
  reason: string | null;
};

export type OperationalAnalysisTemplateLifecycleActionsDTO = Record<
  OperationalAnalysisTemplateLifecycleAction,
  OperationalAnalysisTemplateLifecycleActionDTO
>;

export type OperationalAnalysisManagedTemplateDTO = {
  key: string;
  id: number;
  name: string;
  description: string | null;
  status: "active" | "archived";
  headRevision: number;
  publishedRevision: number | null;
  hasDraft: boolean;
  updatedAt: string;
  actions: OperationalAnalysisTemplateLifecycleActionsDTO;
};

export type OperationalAnalysisTemplateRevisionSummaryDTO = {
  revision: number;
  name: string;
  description: string | null;
  changeKind: OperationalAnalysisTemplateRevisionKind;
  sourceRevision: number | null;
  reason: string | null;
  createdBy: number;
  createdAt: string;
  isHead: boolean;
  isPublished: boolean;
  wasPublished: boolean;
};

export type OperationalAnalysisTemplateLifecycleDTO = {
  template: OperationalAnalysisManagedTemplateDTO;
  revisions: OperationalAnalysisTemplateRevisionSummaryDTO[];
  page: number;
  pageSize: number;
  total: number;
};

export type OperationalAnalysisTemplateDTO = {
  key: string;
  id: number | null;
  name: string;
  description: string | null;
  source: "system" | "workspace";
  revision: number;
  definition: OperationalAnalysisDefinition;
  lifecycle: {
    headRevision: number;
    publishedRevision: number | null;
    hasDraft: boolean;
  } | null;
};

export type OperationalAnalysisTemplateCatalogDTO = {
  scope: { scopeType: OperationalAnalysisScopeType; scopeId: number };
  canConfigure: boolean;
  templates: OperationalAnalysisTemplateDTO[];
  managedTemplates: OperationalAnalysisManagedTemplateDTO[];
};

export type CostMetricValues = Record<CostAnalysisMetricKey, number | null>;

export type CostOperationalAnalysisRuntimeDTO = {
  years: number[];
  summary: CostMetricValues;
  trend: Array<{
    key: string;
    label: string;
    values: CostMetricValues;
    previousMonth: CostMetricValues | null;
    previousYear: CostMetricValues | null;
  }>;
  ranking: Array<{ key: string; label: string; values: CostMetricValues }>;
  rows: Array<{
    key: string;
    year: number;
    month: number | null;
    product: string;
    values: CostMetricValues;
  }>;
};
