import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { getUserEmployeeSignatureName } from "@workspace/platform/server/user-identity";
import { resolveWorkflowPolicy } from "@workspace/platform/server/workflows";
import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";

import {
  createQcBatch,
  deleteQcBatch,
  getQcBatch,
  listQcBatches,
  updateQcBatch,
  updateQcBatchPrecheck,
  updateQcBatchWorkflow,
} from "./batches";

export type QcBatchPatchCommand =
  | {
      kind: "workflow";
      batchId: number;
      action: "save_precheck" | "approve_precheck" | "save_inspection" | "approve_review";
      stageKey: string;
      testName?: string;
      actorName: string;
      fields?: Record<string, unknown>;
    }
  | {
      kind: "update";
      batchId: number;
      body: Record<string, unknown>;
    };

export type QcWorkflowAction = "save_precheck" | "approve_precheck" | "save_inspection" | "approve_review";

const QC_WORKFLOW_DISABLED_MESSAGE = "该 QC 行为未接入流程，请先在流程设置启用";

function statusMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function recordFields(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export function buildQcBatchIdCommand(batchId: number) {
  if (!Number.isInteger(batchId) || batchId <= 0) return failCommand("无效批次 ID", 400, "batchId");
  return okCommand({ batchId });
}

export async function executeListQcBatchesCommand() {
  return { data: await listQcBatches() };
}

export async function executeCreateQcBatchCommand(command: Parameters<typeof createQcBatch>[0]) {
  try {
    return Response.json({ data: await createQcBatch(command) }, { status: 201 });
  } catch (error) {
    return serviceError(statusMessage(error, "创建批次失败"), 400);
  }
}

export async function executeGetQcBatchCommand(command: { batchId: number }) {
  const batch = await getQcBatch(command.batchId);
  if (!batch) return serviceError("批次不存在", 404);
  return serviceOk({ data: batch });
}

export async function buildQcBatchPatchCommand(input: {
  batchId: number;
  userId: number;
  body: Record<string, unknown> & {
    action?: "save_precheck" | "save_inspection";
    stageKey?: string;
    testName?: string;
    fields?: unknown;
  };
}): Promise<DomainValidationResult<QcBatchPatchCommand>> {
  if (input.body.action) {
    return buildQcWorkflowCommand({
      batchId: input.batchId,
      userId: input.userId,
      action: input.body.action,
      stageKey: input.body.stageKey,
      testName: input.body.testName,
      fields: recordFields(input.body.fields),
    });
  }
  if (input.body.fields) return failCommand("检验数据更新必须声明动作");
  return okCommand({ kind: "update", batchId: input.batchId, body: input.body });
}

export function buildQcBatchApproveReviewCommand(input: {
  batchId: number;
  userId: number;
  body: {
    stageKey: string;
    testName?: string;
  };
}) {
  return buildQcWorkflowCommand({
    batchId: input.batchId,
    userId: input.userId,
    action: input.body.testName ? "approve_review" : "approve_precheck",
    stageKey: input.body.stageKey,
    testName: input.body.testName,
  });
}

async function buildQcWorkflowCommand(input: {
  batchId: number;
  userId: number;
  action: QcWorkflowAction;
  stageKey?: string;
  testName?: string;
  fields?: Record<string, unknown>;
}): Promise<DomainValidationResult<QcBatchPatchCommand>> {
  if (!input.stageKey || (input.action !== "save_precheck" && input.action !== "approve_precheck" && !input.testName)) return failCommand("缺少检验项目信息");
  const enabled = await assertQcNativeWorkflowEnabled({
    businessActionKey: businessActionKeyForQcWorkflowAction(input.action),
    actorUserId: input.userId,
  });
  if (!enabled.ok) return enabled;
  const actorName = await getUserEmployeeSignatureName(input.userId);
  if (!actorName) return failCommand("当前账号未绑定员工档案，不能进行检验签名");
  return okCommand({
    kind: "workflow",
    batchId: input.batchId,
    action: input.action,
    stageKey: input.stageKey,
    testName: input.testName,
    actorName,
    fields: input.fields,
  });
}

export async function executeQcBatchPatchCommand(command: QcBatchPatchCommand) {
  try {
    if (command.kind !== "workflow") {
      const batch = await updateQcBatch(command.batchId, command.body);
      if (!batch) return serviceError("批次不存在", 404);
      return serviceOk({ data: batch });
    }
    if (command.action === "save_precheck" || command.action === "approve_precheck") {
      const batch = await updateQcBatchPrecheck(command.batchId, {
        action: command.action,
        stageKey: command.stageKey,
        actorName: command.actorName,
        fields: command.fields,
      });
      if (!batch) return serviceError("批次不存在", 404);
      return serviceOk({ data: batch });
    }
    const batch = await updateQcBatchWorkflow(command.batchId, {
      action: command.action,
      stageKey: command.stageKey,
      testName: command.testName || "",
      actorName: command.actorName,
      fields: command.fields,
    });
    if (!batch) return serviceError("批次不存在", 404);
    return serviceOk({ data: batch });
  } catch (error) {
    return serviceError(statusMessage(error, "批次更新失败"), 400);
  }
}

export async function executeDeleteQcBatchCommand(command: { batchId: number }) {
  const deleted = await deleteQcBatch(command.batchId);
  if (!deleted) return serviceError("批次不存在", 404);
  return serviceOk({ ok: true });
}

async function assertQcNativeWorkflowEnabled(input: {
  businessActionKey: string;
  actorUserId: number;
}) {
  const policy = await resolveWorkflowPolicy({
    businessActionKey: input.businessActionKey,
    actorUserId: input.actorUserId,
    defaults: {
      businessActionKey: input.businessActionKey,
      mode: "required",
      flowType: "review",
      separationPolicy: "independent_required",
      handlerSource: "permission",
    },
  });
  if (policy.mode === "required" || policy.mode === "optional") return okCommand({ ok: true as const });
  return failCommand(QC_WORKFLOW_DISABLED_MESSAGE, 409);
}

function businessActionKeyForQcWorkflowAction(action: QcWorkflowAction) {
  if (action === "save_precheck") return "production.qc.batch.precheck.save";
  if (action === "save_inspection") return "production.qc.batch.inspection.save";
  return "production.qc.batch.review";
}
