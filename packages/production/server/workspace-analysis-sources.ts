import "server-only";

import {
  defineWorkspaceAnalysisDerivedReadModel,
  defineWorkspaceAnalysisReadModel,
} from "@workspace/platform/server/workspace-analysis-read-model";
import type {
  ProductRecord,
  ProductSourceMappingRecord,
} from "@workspace/production/types";

import {
  PRODUCTION_PRODUCT_FIELDS,
  PRODUCTION_PRODUCT_MAPPING_FIELDS,
  PRODUCTION_PRODUCT_SKU_FIELDS,
  PRODUCTION_PRODUCT_SOURCE_MAPPING_FIELDS,
  PRODUCTION_QC_BATCH_FIELDS,
  PRODUCTION_QC_FIELD_VALUE_FIELDS,
  PRODUCTION_QC_SIGNATURE_FIELDS,
  PRODUCTION_QC_TEMPLATE_SNAPSHOT_PARTITION_FIELDS,
  PRODUCTION_QC_TEMPLATE_SNAPSHOT_VALUE_FIELDS,
  type ProductionProductSkuAnalysisRow,
  type ProductionProductSourceMappingAnalysisRow,
  type ProductionQcBatchAnalysisRow,
  type ProductionQcFieldValueAnalysisRow,
  type ProductionQcSignatureAnalysisRow,
  type ProductionQcTemplateSnapshotPartitionAnalysisRow,
  type ProductionQcTemplateSnapshotValueAnalysisRow,
} from "./workspace-analysis-source-fields";

const PAGINATION = { pageParam: "page", pageSizeParam: "pageSize", pageSize: 200, maxPages: 20 } as const;
const LIMITS = {
  maxRows: 4_000,
  maxGroups: 500,
  maxPageSize: 200,
  maxPages: 20,
  maxBytes: 5 * 1024 * 1024,
  timeoutMs: 10_000,
} as const;
const PENDING_MAPPING_LIMITS = { ...LIMITS, maxRows: 200 } as const;
const TEMPLATE_PARTITION_PAGINATION = { ...PAGINATION, maxPages: 1 } as const;
const TEMPLATE_PARTITION_LIMITS = { ...LIMITS, maxRows: 200, maxPages: 1 } as const;
const TEMPLATE_VALUE_PAGINATION = { ...PAGINATION, maxPages: 5 } as const;
const TEMPLATE_VALUE_LIMITS = { ...LIMITS, maxRows: 1_000, maxPages: 5 } as const;
const WORKSPACE_SCOPES = {
  personal: { mode: "workspace", description: "显示当前账号凭业务读取权限可见的全公司生产数据，不按个人收窄。" },
  department: { mode: "workspace", description: "显示当前账号凭业务读取权限可见的全公司生产数据，不按部门收窄。" },
  project: { mode: "workspace", description: "显示当前账号凭业务读取权限可见的全公司生产数据，不按项目收窄。" },
} as const;
const PRODUCT_PARAMETERS = [{
  key: "keyword",
  queryKey: "keyword",
  label: "关键词",
  description: "按产品编码、名称、剂型、强度、批准文号或 SKU 搜索。",
  kind: "text",
}] as const;

export const PRODUCTION_PRODUCTS_SOURCE = defineWorkspaceAnalysisReadModel<ProductRecord>()({
  sourceKey: "production.products",
  version: 1,
  label: "产品主数据（全公司）",
  description: "以一个制剂产品为粒度；列表与总数来自同一次产品目录快照。",
  apiPath: "/api/modules/production/products",
  rowsPath: "items",
  totalPath: "total",
  scopes: WORKSPACE_SCOPES,
  parameters: PRODUCT_PARAMETERS,
  fields: PRODUCTION_PRODUCT_FIELDS,
  pagination: PAGINATION,
  limits: LIMITS,
});

export const PRODUCTION_PENDING_PRODUCT_MAPPINGS_SOURCE = defineWorkspaceAnalysisReadModel<ProductSourceMappingRecord>()({
  sourceKey: "production.product-source-mappings.pending",
  version: 1,
  label: "待关联产品来源（全公司）",
  description: "以一条尚未关联产品或 SKU 的公开来源映射为粒度；列表与总数来自同一次产品目录快照，并沿用业务 GET 最多 200 条的上限。",
  apiPath: "/api/modules/production/products",
  rowsPath: "pendingMappings",
  totalPath: "pendingMappingCount",
  scopes: WORKSPACE_SCOPES,
  fields: PRODUCTION_PRODUCT_MAPPING_FIELDS,
  pagination: PAGINATION,
  limits: PENDING_MAPPING_LIMITS,
});

export const PRODUCTION_PRODUCT_SKUS_SOURCE = defineWorkspaceAnalysisReadModel<ProductionProductSkuAnalysisRow>()({
  sourceKey: "production.product-skus",
  version: 1,
  label: "产品 SKU（全公司）",
  description: "以一个产品 SKU 为粒度，从同一次产品目录 GET 快照展开。",
  apiPath: "/api/modules/production/products",
  rowsPath: "items.skus",
  totalPath: "skuCount",
  scopes: WORKSPACE_SCOPES,
  parameters: PRODUCT_PARAMETERS,
  fields: PRODUCTION_PRODUCT_SKU_FIELDS,
  pagination: PAGINATION,
  limits: LIMITS,
});

export const PRODUCTION_PRODUCT_SOURCE_MAPPINGS_SOURCE = defineWorkspaceAnalysisDerivedReadModel<ProductionProductSourceMappingAnalysisRow>()({
  sourceKey: "production.product-source-mappings",
  version: 1,
  label: "全部产品来源映射（全公司）",
  description: "以一条产品来源映射为粒度，按映射 ID 升序完整分页读取已关联与待关联事实，并返回真实总数。",
  authorizationApiPath: "/api/modules/production/products",
  derivation: {
    kind: "boundedRelationSnapshot",
    description: "Production owner 直接分页读取 ProductSourceMapping 关系，并关联公开产品或 SKU 标签；产品目录 GET 只提供原授权合同。",
  },
  scopes: WORKSPACE_SCOPES,
  fields: PRODUCTION_PRODUCT_SOURCE_MAPPING_FIELDS,
  pagination: { pageSize: 200, maxPages: 20 },
  limits: LIMITS,
});

export const PRODUCTION_QC_BATCHES_SOURCE = defineWorkspaceAnalysisReadModel<ProductionQcBatchAnalysisRow>()({
  sourceKey: "production.qc.batches",
  version: 1,
  label: "QC 批次（全公司）",
  description: "以一个 QC 执行批次为粒度；列表与总数来自同一次 QC 批次快照。",
  apiPath: "/api/modules/production/qc",
  rowsPath: "data.batches",
  totalPath: "data.counts.total",
  scopes: WORKSPACE_SCOPES,
  fields: PRODUCTION_QC_BATCH_FIELDS,
  pagination: PAGINATION,
  limits: LIMITS,
});

export const PRODUCTION_QC_SIGNATURES_SOURCE = defineWorkspaceAnalysisReadModel<ProductionQcSignatureAnalysisRow>()({
  sourceKey: "production.qc.signatures",
  version: 1,
  label: "QC 电子签名（全公司）",
  description: "以一条 QC 电子签名审计事实为粒度，从同一次 QC 批次 GET 快照展开。",
  apiPath: "/api/modules/production/qc",
  rowsPath: "data.batches.signatures",
  totalPath: "data.counts.signatureCount",
  scopes: WORKSPACE_SCOPES,
  fields: PRODUCTION_QC_SIGNATURE_FIELDS,
  pagination: PAGINATION,
  limits: LIMITS,
});

export const PRODUCTION_QC_FIELD_VALUES_SOURCE = defineWorkspaceAnalysisReadModel<ProductionQcFieldValueAnalysisRow>()({
  sourceKey: "production.qc.field-values",
  version: 1,
  label: "QC 动态字段值（全公司）",
  description: "以一个 QC 批次字段键值为粒度；动态模板字段统一规范化为 fieldKey/value 标量行。",
  apiPath: "/api/modules/production/qc",
  rowsPath: "data.batches.fields",
  totalPath: "data.counts.fieldValueCount",
  scopes: WORKSPACE_SCOPES,
  fields: PRODUCTION_QC_FIELD_VALUE_FIELDS,
  pagination: PAGINATION,
  limits: LIMITS,
});

export const PRODUCTION_QC_TEMPLATE_SNAPSHOT_VALUES_SOURCE = defineWorkspaceAnalysisDerivedReadModel<ProductionQcTemplateSnapshotValueAnalysisRow>()({
  sourceKey: "production.qc.template-snapshot-values",
  version: 1,
  label: "QC 批次模板快照分段字段（全公司）",
  description: "以指定批次、document/fieldModel 分区和稳定分段中的一个标量路径为粒度；单次最多返回 1000 个叶子。",
  authorizationApiPath: "/api/modules/production/qc/[batchId]",
  derivation: {
    kind: "partitionedSnapshot",
    description: "Production owner 从获授权批次的固化 templateSnapshot 中按 section 和 segment 确定性生成标量叶子行。",
  },
  scopes: WORKSPACE_SCOPES,
  parameters: [
    { key: "batchId", label: "QC 批次 ID", description: "公开 QC 批次详情的稳定标识。", kind: "integer", required: true },
    { key: "section", label: "快照分区", description: "document 或 fieldModel。", kind: "text", required: true },
    { key: "segment", label: "分段号", description: "从分区目录取得的 1-based 稳定分段号。", kind: "integer", required: true },
  ],
  fields: PRODUCTION_QC_TEMPLATE_SNAPSHOT_VALUE_FIELDS,
  pagination: TEMPLATE_VALUE_PAGINATION,
  limits: TEMPLATE_VALUE_LIMITS,
});

export const PRODUCTION_QC_TEMPLATE_SNAPSHOT_PARTITIONS_SOURCE = defineWorkspaceAnalysisDerivedReadModel<ProductionQcTemplateSnapshotPartitionAnalysisRow>()({
  sourceKey: "production.qc.template-snapshot-partitions",
  version: 1,
  label: "QC 批次模板快照分区目录（全公司）",
  description: "列出指定批次 document 或 fieldModel 的完整稳定分段目录；每个分段最多包含 1000 个叶子。",
  authorizationApiPath: "/api/modules/production/qc/[batchId]",
  derivation: {
    kind: "partitionedSnapshot",
    description: "Production owner 扫描获授权批次的固化 templateSnapshot 分区，生成有界 segment 目录。",
  },
  scopes: WORKSPACE_SCOPES,
  parameters: [
    { key: "batchId", label: "QC 批次 ID", description: "公开 QC 批次详情的稳定标识。", kind: "integer", required: true },
    { key: "section", label: "快照分区", description: "document 或 fieldModel。", kind: "text", required: true },
  ],
  fields: PRODUCTION_QC_TEMPLATE_SNAPSHOT_PARTITION_FIELDS,
  pagination: TEMPLATE_PARTITION_PAGINATION,
  limits: TEMPLATE_PARTITION_LIMITS,
});

export const PRODUCTION_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS = [
  PRODUCTION_PRODUCTS_SOURCE,
  PRODUCTION_PENDING_PRODUCT_MAPPINGS_SOURCE,
  PRODUCTION_PRODUCT_SKUS_SOURCE,
  PRODUCTION_PRODUCT_SOURCE_MAPPINGS_SOURCE,
  PRODUCTION_QC_BATCHES_SOURCE,
  PRODUCTION_QC_SIGNATURES_SOURCE,
  PRODUCTION_QC_FIELD_VALUES_SOURCE,
  PRODUCTION_QC_TEMPLATE_SNAPSHOT_PARTITIONS_SOURCE,
  PRODUCTION_QC_TEMPLATE_SNAPSHOT_VALUES_SOURCE,
] as const;
