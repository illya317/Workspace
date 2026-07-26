import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { getUserBusinessActorIdentity } from "@workspace/platform/server/user-identity";
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
      expectedVersion: number;
      actorUserId: number;
      actorEmployeeId: string | null;
      actorName: string;
      fields?: Record<string, unknown>;
    }
  | {
      kind: "update";
      batchId: number;
      actorUserId: number;
      body: Record<string, unknown>;
    };

export type QcWorkflowAction = "save_precheck" | "approve_precheck" | "save_inspection" | "approve_review";

const QC_WORKFLOW_DISABLED_MESSAGE = "该 QC 行为未接入流程，请先在流程设置启用";

function statusMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function statusCode(error: unknown, fallback: number) {
  const status = error && typeof error === "object" && "status" in error ? (error as { status?: unknown }).status : undefined;
  if (Number.isInteger(status)) return Number(status);
  return fallback;
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

export function qcRequestAuthMethod(request: Request): "active_session" | "personal_api_key" {
  return request.headers.has("x-api-key") ? "personal_api_key" : "active_session";
}

export async function executeListQcBatchesCommand() {
  return { data: await listQcBatches() };
}

export async function executeCreateQcBatchCommand(command: Parameters<typeof createQcBatch>[0]) {
  try {
    return Response.json({ data: await createQcBatch(command) }, { status: 201 });
  } catch (error) {
    return serviceError(statusMessage(error, "创建批次失败"), statusCode(error, 400));
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
  authMethod: "active_session" | "personal_api_key";
  body: Record<string, unknown> & {
    action?: "save_precheck" | "save_inspection";
    stageKey?: string;
    testName?: string;
    fields?: unknown;
    expectedVersion?: number;
  };
}): Promise<DomainValidationResult<QcBatchPatchCommand>> {
  if (input.body.action) {
    return buildQcWorkflowCommand({
      batchId: input.batchId,
      userId: input.userId,
      authMethod: input.authMethod,
      action: input.body.action,
      stageKey: input.body.stageKey,
      testName: input.body.testName,
      expectedVersion: input.body.expectedVersion,
      fields: recordFields(input.body.fields),
    });
  }
  if (input.body.fields) return failCommand("检验数据更新必须声明动作");
  return okCommand({ kind: "update", batchId: input.batchId, actorUserId: input.userId, body: input.body });
}

export function buildQcBatchApproveReviewCommand(input: {
  batchId: number;
  userId: number;
  authMethod: "active_session" | "personal_api_key";
  body: {
    stageKey: string;
    testName?: string;
    expectedVersion: number;
  };
}) {
  return buildQcWorkflowCommand({
    batchId: input.batchId,
    userId: input.userId,
    authMethod: input.authMethod,
    action: input.body.testName ? "approve_review" : "approve_precheck",
    stageKey: input.body.stageKey,
    testName: input.body.testName,
    expectedVersion: input.body.expectedVersion,
  });
}

async function buildQcWorkflowCommand(input: {
  batchId: number;
  userId: number;
  authMethod: "active_session" | "personal_api_key";
  action: QcWorkflowAction;
  stageKey?: string;
  testName?: string;
  expectedVersion?: number;
  fields?: Record<string, unknown>;
}): Promise<DomainValidationResult<QcBatchPatchCommand>> {
  if (!input.stageKey || (input.action !== "save_precheck" && input.action !== "approve_precheck" && !input.testName)) return failCommand("缺少检验项目信息");
  if (!Number.isInteger(input.expectedVersion) || Number(input.expectedVersion) <= 0) return failCommand("缺少有效的批次版本，请刷新后重试", 409, "expectedVersion");
  if (input.authMethod !== "active_session") return failCommand("电子签名必须使用交互式登录会话", 403);
  const enabled = await assertQcNativeWorkflowEnabled({
    businessActionKey: businessActionKeyForQcWorkflowAction(input.action),
    actorUserId: input.userId,
  });
  if (!enabled.ok) return enabled;
  const identity = await getUserBusinessActorIdentity(input.userId);
  if (!identity) return failCommand("当前账号未绑定员工档案且不是管理员，不能进行检验签名");
  return okCommand({
    kind: "workflow",
    batchId: input.batchId,
    action: input.action,
    stageKey: input.stageKey,
    testName: input.testName,
    expectedVersion: Number(input.expectedVersion),
    actorUserId: input.userId,
    actorEmployeeId: identity.employeeId,
    actorName: identity.signatureName,
    fields: input.fields,
  });
}

export async function executeQcBatchPatchCommand(command: QcBatchPatchCommand) {
  try {
    if (command.kind !== "workflow") {
      const batch = await updateQcBatch(command.batchId, command.body, command.actorUserId);
      if (!batch) return serviceError("批次不存在", 404);
      return serviceOk({ data: batch });
    }
    if (command.action === "save_precheck" || command.action === "approve_precheck") {
      const batch = await updateQcBatchPrecheck(command.batchId, {
        action: command.action,
        stageKey: command.stageKey,
        actorName: command.actorName,
        actorUserId: command.actorUserId,
        actorEmployeeId: command.actorEmployeeId,
        expectedVersion: command.expectedVersion,
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
      actorUserId: command.actorUserId,
      actorEmployeeId: command.actorEmployeeId,
      expectedVersion: command.expectedVersion,
      fields: command.fields,
    });
    if (!batch) return serviceError("批次不存在", 404);
    return serviceOk({ data: batch });
  } catch (error) {
    return serviceError(statusMessage(error, "批次更新失败"), statusCode(error, 400));
  }
}

export function buildDeleteQcBatchRouteCommand(input: { batchId: number; expectedVersion: number; userId: number }) {
  if (!Number.isInteger(input.batchId) || input.batchId <= 0) return failCommand("无效批次 ID", 400, "batchId");
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion <= 0) return failCommand("缺少有效的批次版本，请刷新后重试", 409, "expectedVersion");
  return okCommand({ batchId: input.batchId, expectedVersion: input.expectedVersion, actorUserId: input.userId });
}

export async function executeDeleteQcBatchCommand(command: Parameters<typeof deleteQcBatch>[0]) {
  try {
    const deleted = await deleteQcBatch(command);
    if (!deleted) return serviceError("批次不存在", 404);
    return serviceOk({ ok: true });
  } catch (error) {
    return serviceError(statusMessage(error, "删除批次失败"), statusCode(error, 400));
  }
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
