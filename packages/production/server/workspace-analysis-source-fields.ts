import type {
  WorkspaceAnalysisReadModelField,
  WorkspaceAnalysisReadModelFields,
} from "@workspace/platform/server/workspace-analysis-read-model";
import type {
  ProductRecord,
  ProductSkuRecord,
  ProductSourceMappingRecord,
  QcBatchSignature,
  QcBatchSummary,
} from "@workspace/production/types";

import type {
  QcTemplateSnapshotPartitionRow,
  QcTemplateSnapshotValueRow,
} from "./workspace-analysis-qc-template-snapshot";

type Sensitivity = WorkspaceAnalysisReadModelField["sensitivity"];

function field(input: Omit<WorkspaceAnalysisReadModelField, "classification">): WorkspaceAnalysisReadModelField {
  return { classification: "field", ...input };
}

function text(label: string, description: string, sensitivity: Sensitivity = "internal") {
  return field({ label, description, valueKind: "text", sensitivity, exportPolicy: "allowed" });
}

function integer(label: string, description: string, sensitivity: Sensitivity = "internal") {
  return field({
    label,
    description,
    valueKind: "integer",
    sensitivity,
    exportPolicy: "allowed",
    capabilities: {
      filterOperators: ["equals", "in", "range"],
      groupable: true,
      aggregateOperations: ["count", "distinctCount"],
    },
  });
}

function number(label: string, description: string, sensitivity: Sensitivity = "internal") {
  return field({
    label,
    description,
    valueKind: "number",
    sensitivity,
    exportPolicy: "allowed",
    capabilities: {
      filterOperators: ["equals", "range"],
      groupable: false,
      aggregateOperations: ["count", "distinctCount", "average", "min", "max"],
    },
  });
}

function date(label: string, description: string) {
  return field({ label, description, valueKind: "date", sensitivity: "internal", exportPolicy: "allowed" });
}

export type ProductionQcBatchAnalysisRow = QcBatchSummary & {
  templateId: number | null;
  templateVersion: number | null;
  templateProductKey: string | null;
  templateProductName: string | null;
  templateCapturedAt: string | null;
};

export type ProductionProductSkuAnalysisRow = ProductSkuRecord & {
  productCode: string;
  productName: string;
};

export type ProductionProductSourceMappingAnalysisRow = ProductSourceMappingRecord & {
  productId: number | null;
  productCode: string | null;
  productName: string | null;
};

export type ProductionQcSignatureAnalysisRow = QcBatchSignature & {
  batchId: number;
  recordUid: string;
  batchNumber: string;
  productId: number | null;
  productKey: string;
  productName: string;
};

export type ProductionQcFieldValueAnalysisRow = {
  batchId: number;
  recordUid: string;
  batchNumber: string;
  productId: number | null;
  productKey: string;
  productName: string;
  fieldKey: string;
  value: string;
};

export type ProductionQcTemplateSnapshotPartitionAnalysisRow = QcTemplateSnapshotPartitionRow;
export type ProductionQcTemplateSnapshotValueAnalysisRow = QcTemplateSnapshotValueRow;

export const PRODUCTION_PRODUCT_FIELDS = {
  id: integer("产品 ID", "产品主数据的稳定标识。"),
  code: text("产品编码", "产品业务编码。"),
  name: text("产品名称", "产品业务名称。"),
  dosageForm: text("剂型", "产品剂型。"),
  strength: text("规格强度", "产品强度或规格说明。"),
  approvalNumber: text("批准文号", "产品批准文号。"),
  status: text("状态", "产品主数据启用状态。"),
  note: text("备注", "产品主数据备注。", "confidential"),
  version: integer("版本", "产品主数据并发版本。"),
  createdAt: date("创建时间", "产品主数据创建时间。"),
  updatedAt: date("更新时间", "产品主数据最后更新时间。"),
  skus: {
    classification: "childSource",
    sourceKey: "production.product-skus",
    description: "SKU 由 production.product-skus 从同一产品目录快照稳定展开并独立分页。",
  },
  sourceMappings: {
    classification: "childSource",
    sourceKey: "production.product-source-mappings",
    description: "全部已关联与待关联来源映射由 production.product-source-mappings 稳定展开。",
  },
} satisfies WorkspaceAnalysisReadModelFields<ProductRecord>;

export const PRODUCTION_PRODUCT_SKU_FIELDS = {
  productCode: text("产品编码", "SKU 所属产品的业务编码。"),
  productName: text("产品名称", "SKU 所属产品的业务名称。"),
  id: integer("SKU ID", "SKU 稳定内部标识。"),
  productMasterId: integer("产品 ID", "SKU 所属产品主数据标识。"),
  code: text("SKU 编码", "SKU 业务编码。"),
  name: text("SKU 名称", "SKU 业务名称。"),
  specification: text("规格型号", "SKU 规格型号。"),
  baseUnit: text("基本单位", "SKU 库存基本计量单位。"),
  contentUnit: text("内容单位", "每包装内容物的计量单位。"),
  unitsPerPackage: number("每包装单位数", "每个包装包含的内容单位数量。"),
  packagesPerCase: number("每箱包装数", "每箱包含的包装数量。"),
  barcode: text("条码", "SKU 条码。", "confidential"),
  status: text("状态", "SKU 启用状态。"),
  version: integer("版本", "SKU 并发版本。"),
} satisfies WorkspaceAnalysisReadModelFields<ProductionProductSkuAnalysisRow>;

export const PRODUCTION_PRODUCT_MAPPING_FIELDS = {
  id: integer("映射 ID", "产品来源映射的稳定标识。"),
  targetKind: text("目标类型", "映射目标为产品、SKU 或待关联。"),
  targetLabel: text("目标", "已关联产品或 SKU 的展示标签。"),
  sourceSystem: text("来源系统", "来源数据所属系统。"),
  sourceName: text("来源名称", "来源记录的产品名称。"),
  sourceSpecification: text("来源规格", "来源记录的规格型号。"),
  status: text("映射状态", "来源映射处理状态。"),
  sourceFile: text("来源文件", "来源映射关联的导入文件。"),
} satisfies WorkspaceAnalysisReadModelFields<ProductSourceMappingRecord>;

export const PRODUCTION_PRODUCT_SOURCE_MAPPING_FIELDS = {
  productId: integer("产品 ID", "已关联映射所属产品标识；待关联时为空。"),
  productCode: text("产品编码", "已关联映射所属产品编码；待关联时为空。"),
  productName: text("产品名称", "已关联映射所属产品名称；待关联时为空。"),
  ...PRODUCTION_PRODUCT_MAPPING_FIELDS,
} satisfies WorkspaceAnalysisReadModelFields<ProductionProductSourceMappingAnalysisRow>;

export const PRODUCTION_QC_BATCH_FIELDS = {
  id: integer("QC 批次 ID", "QC 批次的稳定系统标识。"),
  recordUid: text("记录 UID", "QC 批记录的稳定唯一标识。"),
  batchNumber: text("生产批号", "接受检验的生产批号。"),
  productId: integer("产品 ID", "已关联产品主数据标识；历史未关联时为空。"),
  productKey: text("产品键", "批次固化的 QC 产品键。"),
  productName: text("产品名称", "批次固化的产品名称。"),
  templateSnapshot: {
    classification: "childSource",
    sourceKey: "production.qc.template-snapshot-values",
    description: "模板快照的 document 与 fieldModel 由分区目录引导，再按 batchId/section/segment 从子来源完整读取；模板标识等稳定标量仍直接登记。",
  },
  templateId: field({
    label: "模板 ID",
    description: "批次创建时固化的 QC 模板稳定标识。",
    valueKind: "integer",
    sensitivity: "internal",
    exportPolicy: "allowed",
    fieldPath: "templateSnapshot.templateId",
  }),
  templateVersion: field({
    label: "模板版本",
    description: "批次创建时固化的 QC 模板版本。",
    valueKind: "integer",
    sensitivity: "internal",
    exportPolicy: "allowed",
    fieldPath: "templateSnapshot.templateVersion",
  }),
  templateProductKey: field({
    label: "模板产品键",
    description: "批次模板快照中的产品键。",
    valueKind: "text",
    sensitivity: "internal",
    exportPolicy: "allowed",
    fieldPath: "templateSnapshot.productKey",
  }),
  templateProductName: field({
    label: "模板产品名称",
    description: "批次模板快照中的产品名称。",
    valueKind: "text",
    sensitivity: "internal",
    exportPolicy: "allowed",
    fieldPath: "templateSnapshot.productName",
  }),
  templateCapturedAt: field({
    label: "模板固化时间",
    description: "QC 模板被固化到批次快照的时间。",
    valueKind: "date",
    sensitivity: "internal",
    exportPolicy: "allowed",
    fieldPath: "templateSnapshot.capturedAt",
  }),
  inspector: text("检验人", "最近一次检验签名人展示名称。", "confidential"),
  status: text("状态", "草稿或已提交状态。"),
  version: integer("版本", "QC 批次并发版本。"),
  createdAt: date("创建时间", "QC 批次创建时间。"),
  updatedAt: date("更新时间", "QC 批次最后更新时间。"),
  fields: {
    classification: "childSource",
    sourceKey: "production.qc.field-values",
    description: "动态检测字段规范化为 production.qc.field-values 的 fieldKey/value 标量行。",
  },
  signatures: {
    classification: "childSource",
    sourceKey: "production.qc.signatures",
    description: "电子签名由 production.qc.signatures 从同一 QC 批次快照稳定展开。",
  },
} satisfies WorkspaceAnalysisReadModelFields<ProductionQcBatchAnalysisRow>;

export const PRODUCTION_QC_SIGNATURE_FIELDS = {
  batchId: integer("批次 ID", "签名所属 QC 批次标识。"),
  recordUid: text("记录 UID", "签名所属 QC 批记录唯一标识。"),
  batchNumber: text("生产批号", "签名所属生产批号。"),
  productId: integer("产品 ID", "签名所属批次关联的产品主数据标识。"),
  productKey: text("产品键", "签名所属批次固化的 QC 产品键。"),
  productName: text("产品名称", "签名所属批次固化的产品名称。"),
  id: integer("签名 ID", "电子签名稳定标识。"),
  fieldKey: text("签名字段键", "签名写入批记录的字段键。"),
  scopeKey: text("签名范围键", "检验前确认或检测项目的稳定范围键。"),
  scopeKind: text("签名范围类型", "precheck 或 inspection。"),
  stageKey: text("阶段键", "签名所属 QC 阶段键。"),
  testName: text("检测项目", "检验签名所属检测项目；确认签名为空。"),
  role: text("签名角色", "检验人或复核人。"),
  meaning: text("签名含义", "电子签名声明的业务含义。", "confidential"),
  signerUserId: integer("签名账号 ID", "签名账号稳定标识。", "restricted"),
  signerEmployeeId: text("签名员工编号", "签名员工编号。", "restricted"),
  signerName: text("签名人", "签名人展示名称。", "restricted"),
  signedAt: date("签名时间", "服务端记录的电子签名时间。"),
  signedRecordVersion: integer("签名记录版本", "签名覆盖的 QC 批记录版本。"),
  signedPayloadHash: text("签名载荷哈希", "被签记录规范化载荷的 SHA-256。", "restricted"),
  authMethod: text("认证方式", "签名采用的认证方式。", "confidential"),
} satisfies WorkspaceAnalysisReadModelFields<ProductionQcSignatureAnalysisRow>;

export const PRODUCTION_QC_FIELD_VALUE_FIELDS = {
  batchId: integer("批次 ID", "字段值所属 QC 批次标识。"),
  recordUid: text("记录 UID", "字段值所属 QC 批记录唯一标识。"),
  batchNumber: text("生产批号", "字段值所属生产批号。"),
  productId: integer("产品 ID", "字段值所属批次关联的产品主数据标识。"),
  productKey: text("产品键", "字段值所属批次固化的 QC 产品键。"),
  productName: text("产品名称", "字段值所属批次固化的产品名称。"),
  fieldKey: text("字段键", "批次固化模板定义的动态字段键。"),
  value: text("字段值", "公开 QC GET 返回的规范化字符串值。", "confidential"),
} satisfies WorkspaceAnalysisReadModelFields<ProductionQcFieldValueAnalysisRow>;

export const PRODUCTION_QC_TEMPLATE_SNAPSHOT_PARTITION_FIELDS = {
  batchId: integer("批次 ID", "模板快照所属 QC 批次标识。"),
  recordUid: text("记录 UID", "模板快照所属 QC 批记录唯一标识。"),
  batchNumber: text("生产批号", "模板快照所属生产批号。"),
  productId: integer("产品 ID", "模板快照所属批次关联的产品主数据标识。"),
  productKey: text("产品键", "批次固化的 QC 产品键。"),
  productName: text("产品名称", "批次固化的产品名称。"),
  templateId: integer("模板 ID", "批次创建时固化的 QC 模板标识。"),
  templateVersion: integer("模板版本", "批次创建时固化的 QC 模板版本。"),
  section: text("快照分区", "值来自 document 或 fieldModel。"),
  segment: integer("分段号", "section 内从 1 开始的稳定分段号。"),
  leafStart: integer("起始序号", "该分段第一个叶子在 section 内的全局序号。"),
  leafEnd: integer("结束序号", "该分段最后一个叶子在 section 内的全局序号。"),
  leafCount: integer("叶子数", "该分段包含的模板快照叶子数量。"),
  firstPath: text("首路径", "该分段第一个确定性 JSON 路径。"),
  lastPath: text("末路径", "该分段最后一个确定性 JSON 路径。"),
} satisfies WorkspaceAnalysisReadModelFields<ProductionQcTemplateSnapshotPartitionAnalysisRow>;

export const PRODUCTION_QC_TEMPLATE_SNAPSHOT_VALUE_FIELDS = {
  batchId: integer("批次 ID", "模板快照所属 QC 批次标识。"),
  recordUid: text("记录 UID", "模板快照所属 QC 批记录唯一标识。"),
  batchNumber: text("生产批号", "模板快照所属生产批号。"),
  productId: integer("产品 ID", "模板快照所属批次关联的产品主数据标识。"),
  productKey: text("产品键", "批次固化的 QC 产品键。"),
  productName: text("产品名称", "批次固化的产品名称。"),
  templateId: integer("模板 ID", "批次创建时固化的 QC 模板标识。"),
  templateVersion: integer("模板版本", "批次创建时固化的 QC 模板版本。"),
  section: text("快照分区", "值来自 document 或 fieldModel。"),
  segment: integer("分段号", "section 内从 1 开始的稳定分段号。"),
  ordinal: integer("叶子序号", "该叶子在 section 确定性遍历顺序中的全局序号。"),
  path: text("字段路径", "模板快照内稳定、确定性的 JSON 路径。"),
  valueKind: text("值类型", "null、text、number、boolean、array 或 object。"),
  textValue: text("文本值", "规范化文本值；数值和布尔值也保留可读文本。", "confidential"),
  numberValue: number("数值", "原值为数值时的可聚合值。", "confidential"),
  booleanValue: field({
    label: "布尔值",
    description: "原值为布尔值时的值。",
    valueKind: "boolean",
    sensitivity: "confidential",
    exportPolicy: "allowed",
  }),
} satisfies WorkspaceAnalysisReadModelFields<ProductionQcTemplateSnapshotValueAnalysisRow>;
