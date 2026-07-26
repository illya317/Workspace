import { z } from "zod";
import { workspaceSourcesOperationalAnalysisDefinitionSchema } from "@workspace/platform/workspace-analysis-definition-schema";

const noteBlockSchema = z.object({
  kind: z.literal("note"),
  title: z.string().trim().min(1).max(100).optional(),
  content: z.string().trim().min(1).max(2000),
});

const salesBlockSchema = z.union([
  z.object({ kind: z.literal("salesMetrics") }),
  z.object({ kind: z.literal("salesCharts") }),
  z.object({ kind: z.literal("salesSummary") }),
  z.object({ kind: z.literal("salesDetails") }),
  noteBlockSchema,
]);

const costMetricSchema = z.enum([
  "rawMaterials",
  "packagingMaterials",
  "directLabor",
  "auxiliaryLabor",
  "utilities",
  "depreciation",
  "otherManufacturingCost",
  "manufacturingCost",
  "quantity",
  "unitCost",
]);

const metricListSchema = z.array(costMetricSchema).min(1).max(10);
const optionalBlockTitle = z.string().trim().min(1).max(100).optional();
const costBlockSchema = z.union([
  z.object({ kind: z.literal("costMetrics"), metrics: metricListSchema }),
  z.object({
    kind: z.literal("costTrend"),
    title: optionalBlockTitle,
    metric: costMetricSchema,
    comparison: z.enum(["none", "monthOverMonth", "yearOverYear", "both"]).optional(),
  }),
  z.object({ kind: z.literal("costBreakdown"), title: optionalBlockTitle, metrics: metricListSchema }),
  z.object({ kind: z.literal("costRanking"), title: optionalBlockTitle, metric: costMetricSchema, limit: z.number().int().min(1).max(30).optional() }),
  z.object({ kind: z.literal("costTable"), title: optionalBlockTitle, metrics: metricListSchema, limit: z.number().int().min(1).max(200).optional() }),
  noteBlockSchema,
]);

const baseDefinitionShape = {
  schemaVersion: z.literal(1),
  layout: z.enum(["stack", "grid"]).optional(),
};

const salesDefinitionSchema = z.object({
  ...baseDefinitionShape,
  dataset: z.literal("sales.shipments"),
  filters: z.array(z.enum(["periodMode", "period", "groupBy", "metric", "sortOrder", "pageSize"])).max(6),
  blocks: z.array(salesBlockSchema).min(1).max(12),
});

const costDefinitionSchema = z.object({
  ...baseDefinitionShape,
  dataset: z.literal("finance.costStructure"),
  filters: z.array(z.enum(["year", "month", "product"])).max(3),
  defaults: z.object({
    year: z.number().int().min(2000).max(2099).optional(),
    month: z.number().int().min(1).max(12).optional(),
    product: z.string().trim().max(120).optional(),
  }).optional(),
  blocks: z.array(costBlockSchema).min(1).max(12),
});

const workspaceApiKeySchema = z.string().trim().min(1).max(60).regex(
  /^[a-z][a-zA-Z0-9_-]*$/,
  "key 必须以小写字母开头，且只能包含字母、数字、下划线或短横线",
);
const workspaceApiFieldPathSchema = z.string().trim().min(1).max(160).regex(
  /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/,
  "字段路径只能使用点号连接的字段名",
);
const workspaceApiRoutePathSchema = z.string().trim().min(1).max(240).regex(
  /^\/api\/modules\/[a-zA-Z0-9_/-]+$/,
  "数据源必须是具体的 /api/modules/... 路径，查询参数请放入 query",
);
const workspaceApiQueryValueSchema = z.union([
  z.string().max(300),
  z.number().finite(),
  z.boolean(),
  z.object({ binding: z.enum(["scopeId", "scopeType"]) }),
]);
const workspaceApiSourceSchema = z.object({
  key: workspaceApiKeySchema,
  label: z.string().trim().min(1).max(100).optional(),
  path: workspaceApiRoutePathSchema,
  rowsPath: workspaceApiFieldPathSchema,
  query: z.record(z.string().trim().min(1).max(80), workspaceApiQueryValueSchema).optional(),
  pagination: z.object({
    pageParam: workspaceApiKeySchema.optional(),
    pageSizeParam: workspaceApiKeySchema.optional(),
    pageSize: z.number().int().min(1).max(500).optional(),
    totalPath: workspaceApiFieldPathSchema,
    maxPages: z.number().int().min(1).max(20).optional(),
  }).optional(),
});
const workspaceApiFilterSchema = z.object({
  key: workspaceApiKeySchema,
  label: z.string().trim().min(1).max(60),
  source: workspaceApiKeySchema,
  field: workspaceApiFieldPathSchema,
  kind: z.enum(["search", "select", "year", "month"]),
  defaultValue: z.string().max(120).optional(),
  options: z.array(z.object({
    label: z.string().trim().min(1).max(60),
    value: z.string().max(120),
  })).min(1).max(60).optional(),
}).superRefine((filter, context) => {
  if (filter.kind === "select" && !filter.options?.length) {
    context.addIssue({ code: "custom", path: ["options"], message: "select 筛选器必须声明 options" });
  }
  if (filter.kind !== "select" && filter.options) {
    context.addIssue({ code: "custom", path: ["options"], message: "只有 select 筛选器可以声明 options" });
  }
});
const workspaceApiFormatSchema = z.enum(["text", "number", "integer", "currency", "percent", "date"]);
const workspaceApiMetricSchema = z.object({
  key: workspaceApiKeySchema,
  label: z.string().trim().min(1).max(60),
  operation: z.enum(["count", "distinctCount", "sum", "average", "min", "max"]),
  field: workspaceApiFieldPathSchema.optional(),
  format: z.enum(["number", "integer", "currency", "percent"]).optional(),
}).superRefine((metric, context) => {
  if (metric.operation !== "count" && !metric.field) {
    context.addIssue({ code: "custom", path: ["field"], message: `${metric.operation} 指标必须声明 field` });
  }
});
const workspaceApiMetricListSchema = z.array(workspaceApiMetricSchema).min(1).max(8);
const workspaceApiBlockSchema = z.union([
  z.object({
    kind: z.literal("apiMetrics"),
    source: workspaceApiKeySchema,
    metrics: workspaceApiMetricListSchema,
  }),
  z.object({
    kind: z.literal("apiChart"),
    source: workspaceApiKeySchema,
    title: z.string().trim().min(1).max(100),
    dimension: z.object({
      field: workspaceApiFieldPathSchema,
      label: z.string().trim().min(1).max(60).optional(),
      bucket: z.enum(["year", "quarter", "month"]).optional(),
    }),
    metrics: workspaceApiMetricListSchema,
    comparison: z.enum(["none", "periodOverPeriod", "yearOverYear", "both"]).optional(),
    sort: z.enum(["dimensionAsc", "dimensionDesc", "valueAsc", "valueDesc"]).optional(),
    limit: z.number().int().min(1).max(60).optional(),
  }).superRefine((block, context) => {
    if ((block.comparison ?? "none") !== "none" && !block.dimension.bucket) {
      context.addIssue({ code: "custom", path: ["dimension", "bucket"], message: "同比或环比图表必须使用日期 bucket" });
    }
    if ((block.comparison ?? "none") !== "none" && block.metrics.length !== 1) {
      context.addIssue({ code: "custom", path: ["metrics"], message: "同比或环比图表一次只能比较一个指标" });
    }
    if (block.dimension.bucket === "year" && block.comparison === "both") {
      context.addIssue({ code: "custom", path: ["comparison"], message: "年度分桶的环比就是上年，不能同时重复展示同比" });
    }
  }),
  z.object({
    kind: z.literal("apiTable"),
    source: workspaceApiKeySchema,
    title: z.string().trim().min(1).max(100),
    columns: z.array(z.object({
      key: workspaceApiKeySchema,
      label: z.string().trim().min(1).max(60),
      field: workspaceApiFieldPathSchema,
      format: workspaceApiFormatSchema.optional(),
    })).min(1).max(24),
    limit: z.number().int().min(1).max(500).optional(),
  }),
  noteBlockSchema,
]);
const workspaceApiDefinitionSchema = z.object({
  schemaVersion: z.literal(2),
  dataset: z.literal("workspace.api"),
  layout: z.enum(["stack", "grid"]).optional(),
  sources: z.array(workspaceApiSourceSchema).min(1).max(8),
  filters: z.array(workspaceApiFilterSchema).max(12),
  blocks: z.array(workspaceApiBlockSchema).min(1).max(24),
});

export const operationalAnalysisDefinitionSchema = z.union([
  salesDefinitionSchema,
  costDefinitionSchema,
  workspaceApiDefinitionSchema,
  workspaceSourcesOperationalAnalysisDefinitionSchema,
]).superRefine((definition, context) => {
  if (definition.dataset === "workspace.api") {
    const sourceKeys = definition.sources.map((source) => source.key);
    if (new Set(sourceKeys).size !== sourceKeys.length) {
      context.addIssue({ code: "custom", path: ["sources"], message: "数据源 key 不能重复" });
    }
    const filterKeys = definition.filters.map((filter) => filter.key);
    if (new Set(filterKeys).size !== filterKeys.length) {
      context.addIssue({ code: "custom", path: ["filters"], message: "筛选器 key 不能重复" });
    }
    const knownSources = new Set(sourceKeys);
    definition.filters.forEach((filter, index) => {
      if (!knownSources.has(filter.source)) {
        context.addIssue({ code: "custom", path: ["filters", index, "source"], message: "筛选器引用了不存在的数据源" });
      }
    });
    definition.blocks.forEach((block, index) => {
      if (block.kind !== "note" && !knownSources.has(block.source)) {
        context.addIssue({ code: "custom", path: ["blocks", index, "source"], message: "区块引用了不存在的数据源" });
      }
      if (block.kind === "apiMetrics" || block.kind === "apiChart") {
        const metricKeys = block.metrics.map((metric) => metric.key);
        if (new Set(metricKeys).size !== metricKeys.length) {
          context.addIssue({ code: "custom", path: ["blocks", index, "metrics"], message: "同一区块的指标 key 不能重复" });
        }
      }
      if (block.kind === "apiTable") {
        const columnKeys = block.columns.map((column) => column.key);
        if (new Set(columnKeys).size !== columnKeys.length) {
          context.addIssue({ code: "custom", path: ["blocks", index, "columns"], message: "同一表格的列 key 不能重复" });
        }
      }
    });
    return;
  }
  if (definition.dataset === "workspace.sources") return;
  const blockKinds = definition.blocks.map((block) => block.kind);
  for (const kind of new Set(blockKinds)) {
    if (kind !== "note" && blockKinds.filter((value) => value === kind).length > 1) {
      context.addIssue({ code: "custom", path: ["blocks"], message: `${kind} 区块不能重复` });
    }
  }
  if (new Set(definition.filters).size !== definition.filters.length) {
    context.addIssue({ code: "custom", path: ["filters"], message: "筛选器不能重复" });
  }
});

export const operationalAnalysisTemplateInputSchema = z.object({
  scopeType: z.enum(["personal", "department", "project"]),
  scopeId: z.coerce.number().int().positive(),
  templateId: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).optional().nullable(),
  definition: operationalAnalysisDefinitionSchema,
});

export const workspaceSourcesOperationalAnalysisTemplateInputSchema = z.object({
  scopeType: z.enum(["personal", "department", "project"]),
  scopeId: z.coerce.number().int().positive(),
  templateId: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).optional().nullable(),
  definition: workspaceSourcesOperationalAnalysisDefinitionSchema,
}).strict();

export const storedOperationalAnalysisTemplateInputSchema = z.object({
  input: operationalAnalysisTemplateInputSchema,
  expectedRevision: z.number().int().positive().optional(),
});

export const storedWorkspaceSourcesOperationalAnalysisTemplateInputSchema = z.object({
  input: workspaceSourcesOperationalAnalysisTemplateInputSchema,
  expectedRevision: z.number().int().positive().optional(),
}).strict().superRefine((stored, context) => {
  if (stored.input.templateId && stored.expectedRevision === undefined) {
    context.addIssue({ code: "custom", path: ["expectedRevision"], message: "修改模板必须声明当前修订" });
  }
  if (!stored.input.templateId && stored.expectedRevision !== undefined) {
    context.addIssue({ code: "custom", path: ["expectedRevision"], message: "新建模板不能声明当前修订" });
  }
});

export const operationalAnalysisTemplateRouteParamsSchema = z.object({
  targetType: z.enum(["personal", "department", "project"]),
  targetId: z.coerce.number().int().positive(),
});

export const operationalAnalysisTemplateRuntimeParamsSchema = operationalAnalysisTemplateRouteParamsSchema.extend({
  templateId: z.coerce.number().int().positive(),
});

export const operationalAnalysisTemplateLifecycleParamsSchema = operationalAnalysisTemplateRuntimeParamsSchema;

export const operationalAnalysisTemplateLifecycleQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

const operationalAnalysisTemplateLifecycleCommandBase = {
  expectedRevision: z.number().int().positive(),
  reason: z.string().trim().min(1).max(500).optional().nullable(),
};

export const operationalAnalysisTemplateLifecycleCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("publish"), ...operationalAnalysisTemplateLifecycleCommandBase }).strict(),
  z.object({
    action: z.literal("rollback"),
    sourceRevision: z.number().int().positive(),
    ...operationalAnalysisTemplateLifecycleCommandBase,
  }).strict(),
  z.object({ action: z.literal("discard"), ...operationalAnalysisTemplateLifecycleCommandBase }).strict(),
  z.object({ action: z.literal("archive"), ...operationalAnalysisTemplateLifecycleCommandBase }).strict(),
  z.object({ action: z.literal("restore"), ...operationalAnalysisTemplateLifecycleCommandBase }).strict(),
]);

export const operationalAnalysisTemplateRuntimeQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2099).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  productName: z.string().trim().max(120).optional(),
});

const workspaceAnalysisRuntimeFilterKeySchema = z.string().trim().min(1).max(60).regex(
  /^[a-z][a-zA-Z0-9]*$/,
  "筛选器 key 必须以小写字母开头，且只能包含字母和数字",
);

export const operationalAnalysisTemplateRuntimeInputSchema = z.object({
  revision: z.number().int().positive(),
  filterValues: z.record(workspaceAnalysisRuntimeFilterKeySchema, z.string().max(120)).optional(),
}).strict().superRefine((input, context) => {
  if (Object.keys(input.filterValues ?? {}).length > 12) {
    context.addIssue({ code: "custom", path: ["filterValues"], message: "一次最多提交 12 个筛选值" });
  }
});

export const operationalAnalysisTemplatePreviewInputSchema = z.object({
  expectedRevision: z.number().int().positive(),
  revision: z.number().int().positive(),
  filterValues: z.record(workspaceAnalysisRuntimeFilterKeySchema, z.string().max(120)).optional(),
}).strict().superRefine((input, context) => {
  if (input.revision > input.expectedRevision) {
    context.addIssue({ code: "custom", path: ["revision"], message: "预览修订不能超过当前修订" });
  }
  if (Object.keys(input.filterValues ?? {}).length > 12) {
    context.addIssue({ code: "custom", path: ["filterValues"], message: "一次最多提交 12 个筛选值" });
  }
});

export type OperationalAnalysisTemplateInput = z.infer<typeof operationalAnalysisTemplateInputSchema>;
export type WorkspaceSourcesOperationalAnalysisTemplateInput = z.infer<typeof workspaceSourcesOperationalAnalysisTemplateInputSchema>;
export type StoredWorkspaceSourcesOperationalAnalysisTemplateInput = z.infer<typeof storedWorkspaceSourcesOperationalAnalysisTemplateInputSchema>;
export type OperationalAnalysisTemplateRuntimeInput = z.infer<typeof operationalAnalysisTemplateRuntimeInputSchema>;
export type OperationalAnalysisTemplatePreviewInput = z.infer<typeof operationalAnalysisTemplatePreviewInputSchema>;
export type OperationalAnalysisTemplateLifecycleQuery = z.infer<typeof operationalAnalysisTemplateLifecycleQuerySchema>;
export type OperationalAnalysisTemplateLifecycleCommandInput = z.infer<typeof operationalAnalysisTemplateLifecycleCommandSchema>;
