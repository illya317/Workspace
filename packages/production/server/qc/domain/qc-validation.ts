import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import type { EditorSlotInline } from "@workspace/platform/document-editor";
import { getPublishedQcOfficialTemplateByProductKey } from "@workspace/platform/server/docs-editor";
import { buildQcBatchWorkflow, qcPrecheckCompletionKey, qcSignatureKeys } from "../../../qc/workflow";
import { getQcBatchEditorRuntimeTemplate, type QcEditorRuntimeTest } from "../editor-runtime-template";
import type { QcBatchCreateInput, QcBatchSummary, QcBatchTemplateSnapshot } from "../types";

export interface CreateQcBatchCommand {
  productKey: string;
  batchNumber: string;
  productName: string;
  templateSnapshot: QcBatchTemplateSnapshot;
}

export interface UpdateQcBatchCommand {
  batchId: number;
  batchNumber?: string;
  inspector?: string;
  fields?: Record<string, string>;
}

export interface UpdateQcBatchWorkflowCommand {
  batchId: number;
  fields: Record<string, string>;
}

export interface UpdateQcBatchPrecheckCommand {
  batchId: number;
  fields: Record<string, string>;
}

export interface QcBatchIdCommand {
  batchId: number;
}

function validBatchId(batchId: number): DomainValidationResult<number> {
  if (!Number.isInteger(batchId) || batchId <= 0) return failCommand("无效批次 ID", 400, "batchId");
  return okCommand(batchId);
}

function objectFields(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function assertWritableInspectionField(key: string, stageKey: string, testName: string, allowedKeys?: Set<string>) {
  if (key.includes("/signature/")) return failCommand("签名字段只能由服务端流程写入", 400, "fields");
  if (allowedKeys?.has(key)) return okCommand(key);
  if (allowedKeys) return failCommand(`字段不属于当前检验项目：${key}`, 400, "fields");
  if (!key.startsWith(`${stageKey}/${testName}/`)) {
    return failCommand(`字段不属于当前检验项目：${key}`, 400, "fields");
  }
  return okCommand(key);
}

function assertWritablePrecheckField(key: string, allowedKeys: Set<string>) {
  if (key.includes("/signature/")) return failCommand("签名字段只能由服务端流程写入", 400, "fields");
  if (!allowedKeys.has(key)) return failCommand(`字段不属于当前实验前准备：${key}`, 400, "fields");
  return okCommand(key);
}

export async function buildCreateQcBatchCommand(
  input: QcBatchCreateInput,
): Promise<DomainValidationResult<CreateQcBatchCommand>> {
  const productKey = input.productKey.trim();
  const batchNumber = input.batchNumber.trim();
  if (!productKey || !batchNumber) return failCommand("productKey and batchNumber are required");

  const template = await getPublishedQcOfficialTemplateByProductKey(productKey);
  if (!template) return failCommand("QC official editor template not found");
  return okCommand({
    productKey,
    batchNumber,
    productName: template.productName,
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
  const command: UpdateQcBatchCommand = { batchId: validId.data };
  if (typeof fields.batchNumber === "string") command.batchNumber = fields.batchNumber.trim();
  if (typeof fields.inspector === "string") command.inspector = fields.inspector.trim();
  const rawFields = objectFields(fields.fields);
  if (rawFields) {
    command.fields = Object.fromEntries(
      Object.entries(rawFields).map(([key, value]) => [key, value == null ? "" : String(value)]),
    );
  }
  return okCommand(command);
}

export async function buildUpdateQcBatchWorkflowCommand(
  batch: QcBatchSummary,
  input: {
    action: "save_inspection" | "approve_review";
    stageKey: string;
    testName: string;
    actorName: string;
    fields?: Record<string, unknown>;
  },
): Promise<DomainValidationResult<UpdateQcBatchWorkflowCommand>> {
  const validId = validBatchId(batch.id);
  if (!validId.ok) return validId;
  const stageKey = input.stageKey.trim();
  const testName = input.testName.trim();
  const actorName = input.actorName.trim();
  if (!stageKey || !testName) return failCommand("缺少检验项目信息");
  if (!actorName) return failCommand("操作人不能为空", 400, "actorName");

  const runtime = await getQcBatchEditorRuntimeTemplate(batch);
  if (!runtime) return failCommand("检验模板不存在");
  const stage = runtime.stages.find((item) => item.key === stageKey);
  const test = stage?.tests.find((item) => item.key === testName);
  if (!stage || !test) return failCommand("检验项目不存在");

  const workflow = buildQcBatchWorkflow(runtime, batch, actorName);
  const current = workflow.tests.find((item) => item.stageKey === stageKey && item.testName === testName);
  if (!current) return failCommand("检验项目不存在");
  const currentStage = workflow.stages[current.stageIndex];
  if (!currentStage?.unlocked) return failCommand("前一阶段尚未全部复核完成");
  if (!currentStage.precheckComplete) return failCommand("请先保存检验前确认");
  if (current.automatic) return failCommand("该成品项目引用待包装品结果，不能手工保存或复核");

  const keys = qcSignatureKeys(stageKey, testName);
  const allowedKeys = runtimeWritableKeys(test.blocks);
  const nextFields: Record<string, string> = {};
  if (input.action === "save_inspection") {
    if (current.reviewed) return failCommand("该项目已复核，不能继续修改");
    if (!current.canSaveInspection) return failCommand("该项目已由其他检验者完成检验，请进入复核流程");
    for (const [key, value] of Object.entries(input.fields || {})) {
      const writable = assertWritableInspectionField(key, stageKey, testName, allowedKeys);
      if (!writable.ok) return writable;
      nextFields[key] = value == null ? "" : String(value);
    }
    nextFields[keys.inspector] = actorName;
  }
  if (input.action === "approve_review") {
    if (!current.inspected) return failCommand("该项目尚未完成检验，不能复核");
    if (current.reviewed) return failCommand("该项目已复核");
    if (!current.canApproveReview) return failCommand("检验者不能复核本人检验的项目");
    nextFields[keys.reviewer] = actorName;
  }
  return okCommand({ batchId: validId.data, fields: nextFields });
}

export async function buildUpdateQcBatchPrecheckCommand(
  batch: QcBatchSummary,
  input: {
    stageKey: string;
    actorName: string;
    fields?: Record<string, unknown>;
  },
): Promise<DomainValidationResult<UpdateQcBatchPrecheckCommand>> {
  const validId = validBatchId(batch.id);
  if (!validId.ok) return validId;
  const stageKey = input.stageKey.trim();
  const actorName = input.actorName.trim();
  if (!stageKey) return failCommand("缺少阶段信息");
  if (!actorName) return failCommand("操作人不能为空", 400, "actorName");

  const runtime = await getQcBatchEditorRuntimeTemplate(batch);
  if (!runtime) return failCommand("检验模板不存在");
  const stage = runtime.stages.find((item) => item.key === stageKey);
  if (!stage) return failCommand("阶段不存在");

  const workflow = buildQcBatchWorkflow(runtime, batch);
  const current = workflow.stages.find((item) => item.key === stageKey);
  if (!current?.unlocked) return failCommand("前一阶段尚未全部复核完成");

  const allowedKeys = runtimeWritableKeys(stage.precheckBlocks);
  const nextFields: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.fields || {})) {
    const writable = assertWritablePrecheckField(key, allowedKeys);
    if (!writable.ok) return writable;
    nextFields[key] = value == null ? "" : String(value);
  }
  nextFields[qcPrecheckCompletionKey(stageKey)] = actorName;
  return okCommand({ batchId: validId.data, fields: nextFields });
}

function runtimeWritableKeys(blocks: QcEditorRuntimeTest["blocks"]) {
  const keys = new Set<string>();
  for (const block of blocks) {
    if (block.type === "paragraph") block.parts.forEach((part) => { if (part.type !== "text" && isWritableRuntimeSlot(part)) keys.add(part.fieldKey); });
    if (block.type === "table") {
      block.rows.forEach((row) => row.cells.forEach((cell) => cell.parts.forEach((part) => {
        if (part.type !== "text" && isWritableRuntimeSlot(part)) keys.add(part.fieldKey);
      })));
    }
  }
  return keys;
}

function isWritableRuntimeSlot(part: EditorSlotInline) {
  return !part.referenceFieldKey
    && !part.fieldKey.includes("/signature/")
    && part.slotKind !== "formula"
    && part.slotKind !== "reference"
    && !part.readonlyDisplay;
}

export function buildSubmitQcBatchCommand(batchId: number): DomainValidationResult<QcBatchIdCommand> {
  const validId = validBatchId(batchId);
  if (!validId.ok) return validId;
  return okCommand({ batchId: validId.data });
}

export function buildDeleteQcBatchCommand(batchId: number): DomainValidationResult<QcBatchIdCommand> {
  const validId = validBatchId(batchId);
  if (!validId.ok) return validId;
  return okCommand({ batchId: validId.data });
}
