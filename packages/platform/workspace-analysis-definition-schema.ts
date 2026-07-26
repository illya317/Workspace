import { z } from "zod";

import type {
  WorkspaceAnalysisSourceDefinition,
  WorkspaceSourcesOperationalAnalysisDefinition,
} from "./workspace-analysis-source-contract";
import { PERMISSION_ACTION_KEYS } from "./permission-actions";

const memberKeySchema = z.string().trim().min(1).max(60).regex(
  /^[a-z][a-zA-Z0-9]*$/,
  "key 必须以小写字母开头，且只能包含字母和数字",
);
const sourceKeySchema = z.string().trim().min(3).max(120).regex(
  /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/,
  "sourceKey 必须是带业务域前缀的稳定编号",
);
const parameterValueSchema = z.union([
  z.string().max(300),
  z.number().finite(),
  z.boolean(),
]);
const parametersSchema = z.record(memberKeySchema, parameterValueSchema).superRefine((parameters, context) => {
  if (Object.keys(parameters).length > 20) {
    context.addIssue({ code: "custom", message: "单个数据源最多声明 20 个参数" });
  }
});
const sourceReferenceSchema = z.object({
  key: memberKeySchema,
  label: z.string().trim().min(1).max(100).optional(),
  sourceKey: sourceKeySchema,
  sourceVersion: z.number().int().min(1).max(1_000_000),
  parameters: parametersSchema.optional(),
}).strict();
const filterSchema = z.object({
  key: memberKeySchema,
  label: z.string().trim().min(1).max(60),
  source: memberKeySchema,
  field: memberKeySchema,
  kind: z.enum(["search", "select", "year", "month"]),
  defaultValue: z.string().max(120).optional(),
  options: z.array(z.object({
    label: z.string().trim().min(1).max(60),
    value: z.string().max(120),
  }).strict()).min(1).max(60).optional(),
}).strict().superRefine((filter, context) => {
  if (filter.kind === "select" && !filter.options?.length) {
    context.addIssue({ code: "custom", path: ["options"], message: "select 筛选器必须声明 options" });
  }
  if (filter.kind === "select" && filter.options?.some((option) => option.value === "__all")) {
    context.addIssue({ code: "custom", path: ["options"], message: "__all 是运行时保留的全部选项值" });
  }
  if (filter.kind !== "select" && filter.options) {
    context.addIssue({ code: "custom", path: ["options"], message: "只有 select 筛选器可以声明 options" });
  }
});
const valueFormatSchema = z.enum(["text", "number", "integer", "currency", "percent", "date"]);
const aggregateOperationSchema = z.enum(["count", "distinctCount", "sum", "average", "min", "max"]);
const metricSchema = z.object({
  key: memberKeySchema,
  label: z.string().trim().min(1).max(60),
  operation: aggregateOperationSchema,
  field: memberKeySchema.optional(),
  format: z.enum(["number", "integer", "currency", "percent"]).optional(),
}).strict().superRefine((metric, context) => {
  if (metric.operation !== "count" && !metric.field) {
    context.addIssue({ code: "custom", path: ["field"], message: `${metric.operation} 指标必须声明 field` });
  }
});
const metricListSchema = z.array(metricSchema).min(1).max(8);
const blockSchema = z.union([
  z.object({
    key: memberKeySchema,
    kind: z.literal("metrics"),
    source: memberKeySchema,
    metrics: metricListSchema,
  }).strict(),
  z.object({
    key: memberKeySchema,
    kind: z.literal("chart"),
    source: memberKeySchema,
    title: z.string().trim().min(1).max(100),
    dimension: z.object({
      field: memberKeySchema,
      label: z.string().trim().min(1).max(60).optional(),
      bucket: z.enum(["year", "quarter", "month"]).optional(),
    }).strict(),
    metrics: metricListSchema,
    comparison: z.enum(["none", "periodOverPeriod", "yearOverYear", "both"]).optional(),
    sort: z.enum(["dimensionAsc", "dimensionDesc", "valueAsc", "valueDesc"]).optional(),
    limit: z.number().int().min(1).max(60).optional(),
  }).strict().superRefine((block, context) => {
    if ((block.comparison ?? "none") !== "none" && !block.dimension.bucket) {
      context.addIssue({ code: "custom", path: ["dimension", "bucket"], message: "同比或环比图表必须使用日期 bucket" });
    }
    if ((block.comparison ?? "none") !== "none" && block.metrics.length !== 1) {
      context.addIssue({ code: "custom", path: ["metrics"], message: "同比或环比图表一次只能比较一个指标" });
    }
    if (block.dimension.bucket === "year" && block.comparison === "both") {
      context.addIssue({ code: "custom", path: ["comparison"], message: "年度分桶不能重复展示环比和同比" });
    }
  }),
  z.object({
    key: memberKeySchema,
    kind: z.literal("table"),
    source: memberKeySchema,
    title: z.string().trim().min(1).max(100),
    columns: z.array(z.object({
      key: memberKeySchema,
      label: z.string().trim().min(1).max(60),
      field: memberKeySchema,
      format: valueFormatSchema.optional(),
    }).strict()).min(1).max(24),
    limit: z.number().int().min(1).max(500).optional(),
  }).strict(),
  z.object({
    key: memberKeySchema,
    kind: z.literal("note"),
    title: z.string().trim().min(1).max(100).optional(),
    content: z.string().trim().min(1).max(2_000),
  }).strict(),
]);

export const workspaceSourcesOperationalAnalysisDefinitionSchema: z.ZodType<WorkspaceSourcesOperationalAnalysisDefinition> = z.object({
  schemaVersion: z.literal(3),
  dataset: z.literal("workspace.sources"),
  layout: z.enum(["stack", "grid"]).optional(),
  sources: z.array(sourceReferenceSchema).min(1).max(4),
  filters: z.array(filterSchema).max(12),
  blocks: z.array(blockSchema).min(1).max(24),
}).strict().superRefine((definition, context) => {
  uniqueKeys(definition.sources, "数据源 key 不能重复", ["sources"], context);
  uniqueKeys(definition.filters, "筛选器 key 不能重复", ["filters"], context);
  uniqueKeys(definition.blocks, "区块 key 不能重复", ["blocks"], context);
  const knownSources = new Set(definition.sources.map((source) => source.key));
  definition.filters.forEach((filter, index) => {
    if (!knownSources.has(filter.source)) {
      context.addIssue({ code: "custom", path: ["filters", index, "source"], message: "筛选器引用了不存在的数据源" });
    }
  });
  definition.blocks.forEach((block, index) => {
    if (block.kind !== "note" && !knownSources.has(block.source)) {
      context.addIssue({ code: "custom", path: ["blocks", index, "source"], message: "区块引用了不存在的数据源" });
    }
    if (block.kind === "metrics" || block.kind === "chart") {
      uniqueKeys(block.metrics, "同一区块的指标 key 不能重复", ["blocks", index, "metrics"], context);
    }
    if (block.kind === "table") {
      uniqueKeys(block.columns, "同一表格的列 key 不能重复", ["blocks", index, "columns"], context);
    }
  });
});

function uniqueKeys(
  values: readonly { key: string }[],
  message: string,
  path: PropertyKey[],
  context: z.RefinementCtx,
) {
  const keys = values.map((value) => value.key);
  if (new Set(keys).size !== keys.length) context.addIssue({ code: "custom", path, message });
}

const sourceScopeBindingSchema = z.object({
  mode: z.enum(["target", "viewer", "workspace"]),
  description: z.string().trim().min(1).max(500),
}).strict();
const sourceParameterDefinitionSchema = z.object({
  key: memberKeySchema,
  label: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(500),
  kind: z.enum(["text", "integer", "number", "boolean", "date"]),
  required: z.boolean().optional(),
  requiredWith: z.array(memberKeySchema).max(20).optional(),
}).strict();
const sourceParameterConstraintSchema = z.object({
  kind: z.literal("orderedDates"),
  from: memberKeySchema,
  to: memberKeySchema,
  description: z.string().trim().min(1).max(500),
}).strict();
const sourceFieldDefinitionSchema = z.object({
  key: memberKeySchema,
  label: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(500),
  kind: z.enum(["text", "number", "integer", "currency", "percent", "date", "boolean"]),
  sensitivity: z.enum(["internal", "confidential", "restricted"]),
  exportPolicy: z.enum(["allowed", "masked", "forbidden"]),
  capabilities: z.object({
    displayable: z.boolean(),
    filterOperators: z.array(z.enum(["equals", "contains", "in", "range", "year", "month"])).max(6),
    groupable: z.boolean(),
    aggregateOperations: z.array(aggregateOperationSchema).max(6),
  }).strict(),
}).strict();

export const workspaceAnalysisSourceDefinitionSchema: z.ZodType<WorkspaceAnalysisSourceDefinition> = z.object({
  sourceKey: sourceKeySchema,
  version: z.number().int().min(1).max(1_000_000),
  label: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(500),
  ownerModuleKey: z.string().trim().min(1).max(100),
  authorization: z.object({
    resourceKey: z.string().trim().min(1).max(160),
    requiredActions: z.array(z.enum(PERMISSION_ACTION_KEYS)).min(1).max(PERMISSION_ACTION_KEYS.length),
    projection: z.enum(["default", "space"]),
    enforcement: z.enum(["gateway", "serviceDelegated"]),
  }).strict(),
  scopeBindings: z.object({
    personal: sourceScopeBindingSchema.optional(),
    department: sourceScopeBindingSchema.optional(),
    project: sourceScopeBindingSchema.optional(),
  }).strict(),
  parameters: z.array(sourceParameterDefinitionSchema).max(20),
  parameterConstraints: z.array(sourceParameterConstraintSchema).max(20).optional(),
  fields: z.array(sourceFieldDefinitionSchema).min(1).max(200),
  limits: z.object({
    maxRows: z.number().int().positive(),
    maxGroups: z.number().int().positive(),
    maxPageSize: z.number().int().positive(),
    maxPages: z.number().int().positive(),
    maxBytes: z.number().int().positive(),
    timeoutMs: z.number().int().positive(),
  }).strict(),
}).strict();
