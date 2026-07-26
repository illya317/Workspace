import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import { isProductionBatchNumber, PRODUCTION_BATCH_NUMBER_MESSAGE } from "@workspace/platform/production-batch-number";
import { getPublishedQcOfficialTemplateByProductKey } from "@workspace/platform/server/docs-editor";
import { getActiveFinishedGood, normalizeProductReference } from "@workspace/platform/server/product-master";
import {
  qcRuntimeFieldMetadata,
  validateQcRuntimeMutation,
  writableQcRuntimeKeys,
} from "../../../qc/runtime-values";
import { buildQcBatchWorkflow, qcPrecheckSignatureKeys, qcSignatureKeys } from "../../../qc/workflow";
import { getQcBatchEditorRuntimeTemplate } from "../editor-runtime-template";
import type { QcBatchCreateInput, QcBatchSummary, QcBatchTemplateSnapshot } from "../types";

export interface CreateQcBatchCommand {
  productId: number;
  productKey: string;
  batchNumber: string;
  productName: string;
  templateSnapshot: QcBatchTemplateSnapshot;
}

export interface QcFieldMetadata {
  valueType?: string;
  unit?: string;
  source: "manual" | "formula";
}

export interface QcSignatureCommand {
  fieldKey: string;
  scopeKey: string;
  scopeKind: "precheck" | "inspection";
  stageKey: string;
  testName?: string;
  role: "inspector" | "reviewer";
  meaning: string;
}

export interface UpdateQcBatchCommand {
  batchId: number;
  expectedVersion: number;
  batchNumber?: string;
}

export interface UpdateQcBatchWorkflowCommand {
  batchId: number;
  expectedVersion: number;
  fields: Record<string, string>;
  fieldMetadata: Record<string, QcFieldMetadata>;
  signature: QcSignatureCommand;
}

export interface QcBatchVersionCommand {
  batchId: number;
  expectedVersion: number;
}

function validBatchId(batchId: number): DomainValidationResult<number> {
  if (!Number.isInteger(batchId) || batchId <= 0) return failCommand("无效批次 ID", 400, "batchId");
  return okCommand(batchId);
}

function validExpectedVersion(value: unknown): DomainValidationResult<number> {
  if (!Number.isInteger(value) || Number(value) <= 0) return failCommand("缺少有效的批次版本，请刷新后重试", 409, "expectedVersion");
  return okCommand(Number(value));
}

function objectFields(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function submittedFields(value: unknown) {
  const fields = objectFields(value) ?? {};
  return Object.fromEntries(Object.entries(fields).map(([key, item]) => [key, item == null ? "" : String(item)]));
}

export async function buildCreateQcBatchCommand(
  input: QcBatchCreateInput,
): Promise<DomainValidationResult<CreateQcBatchCommand>> {
  const productKey = input.productKey.trim();
  const batchNumber = input.batchNumber.trim();
  if (!productKey || !batchNumber) return failCommand("productKey and batchNumber are required");
  if (!isProductionBatchNumber(batchNumber)) return failCommand(PRODUCTION_BATCH_NUMBER_MESSAGE, 400, "batchNumber");

  const [product, template] = await Promise.all([
    getActiveFinishedGood(input.productId),
    getPublishedQcOfficialTemplateByProductKey(productKey),
  ]);
  if (!product) return failCommand("产品主数据不存在或已停用", 400, "productId");
  if (!template) return failCommand("QC official editor template not found");
  if (normalizeProductReference(product.name) !== normalizeProductReference(template.productName)) {
    return failCommand("产品主数据与 QC 模板产品不一致", 400, "productId");
  }
  return okCommand({
    productId: product.id,
    productKey,
    batchNumber,
    productName: product.name,
    templateSnapshot: {
      templateId: template.templateId,
      templateVersion: template.templateVersion,
      productKey: template.productKey,
      productName: template.productName,
      document: template.document,
      fieldModel: template.fieldModel,
      capturedAt: new Date().toISOString(),
    },
  });
}

export function buildUpdateQcBatchCommand(
  batchId: number,
  fields: Record<string, unknown>,
): DomainValidationResult<UpdateQcBatchCommand> {
  const validId = validBatchId(batchId);
  if (!validId.ok) return validId;
  const version = validExpectedVersion(fields.expectedVersion);
  if (!version.ok) return version;
  const batchNumber = typeof fields.batchNumber === "string" ? fields.batchNumber.trim() : undefined;
  if (batchNumber !== undefined && !batchNumber) return failCommand("批号不能为空", 400, "batchNumber");
  if (batchNumber !== undefined && !isProductionBatchNumber(batchNumber)) return failCommand(PRODUCTION_BATCH_NUMBER_MESSAGE, 400, "batchNumber");
  if (batchNumber === undefined) return failCommand("没有可更新的批次字段", 400);
  return okCommand({ batchId: validId.data, expectedVersion: version.data, batchNumber });
}

export async function buildUpdateQcBatchWorkflowCommand(
  batch: QcBatchSummary,
  input: {
    action: "save_inspection" | "approve_review";
    stageKey: string;
    testName: string;
    actorName: string;
    expectedVersion: number;
    fields?: Record<string, unknown>;
  },
): Promise<DomainValidationResult<UpdateQcBatchWorkflowCommand>> {
  const base = mutationBase(batch, input.expectedVersion, input.actorName);
  if (!base.ok) return base;
  const stageKey = input.stageKey.trim();
  const testName = input.testName.trim();
  if (!stageKey || !testName) return failCommand("缺少检验项目信息");

  const runtime = await getQcBatchEditorRuntimeTemplate(batch);
  if (!runtime) return failCommand("检验模板不存在");
  const stage = runtime.stages.find((item) => item.key === stageKey);
  const test = stage?.tests.find((item) => item.key === testName);
  if (!stage || !test) return failCommand("检验项目不存在");

  const workflow = buildQcBatchWorkflow(runtime, batch, input.actorName);
  const current = workflow.tests.find((item) => item.stageKey === stageKey && item.testName === testName);
  if (!current) return failCommand("检验项目不存在");
  const currentStage = workflow.stages[current.stageIndex];
  if (!currentStage?.unlocked) return failCommand("前一阶段尚未全部复核完成");
  if (current.automatic) return failCommand("该成品项目引用待包装品结果，不能手工保存或复核");

  const keys = qcSignatureKeys(stageKey, testName);
  if (input.action === "approve_review") {
    if (!current.inspected) return failCommand("该项目尚未完成检验，不能复核");
    if (current.reviewed) return failCommand("该项目已复核");
    if (!current.canApproveReview) return failCommand("检验者不能复核本人检验的项目");
    return okCommand({
      ...base.data,
      fields: {},
      fieldMetadata: {},
      signature: signatureCommand(keys.reviewer, stageKey, testName, "reviewer", "复核检验结果"),
    });
  }

  if (current.reviewed) return failCommand("该项目已复核，不能继续修改");
  if (!current.canSaveInspection) return failCommand("该项目已由其他检验者完成检验，请进入复核流程");
  return validatedSaveCommand({
    batch,
    expectedVersion: base.data.expectedVersion,
    runtime,
    blocks: test.blocks,
    fields: submittedFields(input.fields),
    requireAllWritable: false,
    signature: signatureCommand(keys.inspector, stageKey, testName, "inspector", "完成检验并保存"),
  });
}

export async function buildUpdateQcBatchPrecheckCommand(
  batch: QcBatchSummary,
  input: {
    action: "save_precheck" | "approve_precheck";
    stageKey: string;
    actorName: string;
    expectedVersion: number;
    fields?: Record<string, unknown>;
  },
): Promise<DomainValidationResult<UpdateQcBatchWorkflowCommand>> {
  const base = mutationBase(batch, input.expectedVersion, input.actorName);
  if (!base.ok) return base;
  const stageKey = input.stageKey.trim();
  if (!stageKey) return failCommand("缺少阶段信息");
  const runtime = await getQcBatchEditorRuntimeTemplate(batch);
  if (!runtime) return failCommand("检验模板不存在");
  const stage = runtime.stages.find((item) => item.key === stageKey);
  if (!stage) return failCommand("阶段不存在");

  const workflow = buildQcBatchWorkflow(runtime, batch, input.actorName);
  const current = workflow.stages.find((item) => item.key === stageKey);
  if (!current?.unlocked) return failCommand("前一阶段尚未全部复核完成");
  const keys = qcPrecheckSignatureKeys(stageKey);
  if (input.action === "approve_precheck") {
    if (!current.precheckInspected) return failCommand("检验前确认尚未保存，不能复核");
    if (current.precheckReviewed) return failCommand("检验前确认已复核");
    if (!current.canApprovePrecheck) return failCommand("检验者不能复核本人填写的检验前确认");
    return okCommand({
      ...base.data,
      fields: {},
      fieldMetadata: {},
      signature: signatureCommand(keys.reviewer, stageKey, undefined, "reviewer", "复核检验前确认"),
    });
  }

  if (current.precheckReviewed) return failCommand("检验前确认已复核，不能继续修改");
  if (!current.canSavePrecheck) return failCommand("检验前确认已由其他检验者完成，请进入复核流程");
  return validatedSaveCommand({
    batch,
    expectedVersion: base.data.expectedVersion,
    runtime,
    blocks: stage.precheckBlocks,
    fields: submittedFields(input.fields),
    requireAllWritable: true,
    signature: signatureCommand(keys.inspector, stageKey, undefined, "inspector", "检验前确认并保存"),
  });
}

function mutationBase(batch: QcBatchSummary, expectedVersion: number, actorName: string) {
  const validId = validBatchId(batch.id);
  if (!validId.ok) return validId;
  const version = validExpectedVersion(expectedVersion);
  if (!version.ok) return version;
  if (!actorName.trim()) return failCommand("操作人不能为空", 400, "actorName");
  return okCommand({ batchId: validId.data, expectedVersion: version.data });
}

function signatureCommand(
  fieldKey: string,
  stageKey: string,
  testName: string | undefined,
  role: "inspector" | "reviewer",
  meaning: string,
): QcSignatureCommand {
  return {
    fieldKey,
    scopeKey: testName ? `${stageKey}/${testName}` : `${stageKey}/precheck`,
    scopeKind: testName ? "inspection" : "precheck",
    stageKey,
    testName,
    role,
    meaning,
  };
}

function validatedSaveCommand(input: {
  batch: QcBatchSummary;
  expectedVersion: number;
  runtime: NonNullable<Awaited<ReturnType<typeof getQcBatchEditorRuntimeTemplate>>>;
  blocks: Parameters<typeof writableQcRuntimeKeys>[0];
  fields: Record<string, string>;
  requireAllWritable: boolean;
  signature: QcSignatureCommand;
}): DomainValidationResult<UpdateQcBatchWorkflowCommand> {
  const allowedKeys = writableQcRuntimeKeys(input.blocks);
  for (const key of Object.keys(input.fields)) {
    if (key.includes("/signature/")) return failCommand("签名字段只能由服务端流程写入", 400, "fields");
    if (!allowedKeys.has(key)) return failCommand(`字段不属于当前记录范围：${key}`, 400, "fields");
  }
  const validated = validateQcRuntimeMutation({
    fieldModel: input.runtime.fieldModel,
    document: input.runtime.document,
    blocks: input.blocks,
    currentValues: input.batch.fields,
    submittedValues: input.fields,
    requireAllWritable: input.requireAllWritable,
  });
  if (validated.errors.length) return failCommand(validated.errors.slice(0, 3).join("；"), 400, "fields");
  const fields = { ...input.fields, ...validated.formulaValues };
  const fieldMetadata = Object.fromEntries(Object.keys(fields).map((key) => [
    key,
    {
      ...qcRuntimeFieldMetadata(input.runtime.fieldModel, key),
      source: key in validated.formulaValues ? "formula" as const : "manual" as const,
    },
  ]));
  return okCommand({
    batchId: input.batch.id,
    expectedVersion: input.expectedVersion,
    fields,
    fieldMetadata,
    signature: input.signature,
  });
}

export function buildDeleteQcBatchCommand(batchId: number, expectedVersion: number): DomainValidationResult<QcBatchVersionCommand> {
  const validId = validBatchId(batchId);
  if (!validId.ok) return validId;
  const version = validExpectedVersion(expectedVersion);
  if (!version.ok) return version;
  return okCommand({ batchId: validId.data, expectedVersion: version.data });
}
