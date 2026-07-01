import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { getUserEmployeeSignatureName } from "@workspace/platform/server/user-identity";
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
  submitQcBatch,
  updateQcBatch,
  updateQcBatchPrecheck,
  updateQcBatchWorkflow,
} from "./batches";

export type QcBatchPatchCommand =
  | {
      kind: "workflow";
      batchId: number;
      action: "save_precheck" | "save_inspection" | "approve_review";
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
  userName?: string | null;
  body: Record<string, unknown> & {
    action?: "save_precheck" | "save_inspection" | "approve_review";
    stageKey?: string;
    testName?: string;
    fields?: unknown;
  };
}): Promise<DomainValidationResult<QcBatchPatchCommand>> {
  if (input.body.action) {
    if (!input.body.stageKey || (input.body.action !== "save_precheck" && !input.body.testName)) return failCommand("缺少检验项目信息");
    const actorName = await getUserEmployeeSignatureName(input.userId, input.userName ?? undefined);
    return okCommand({
      kind: "workflow",
      batchId: input.batchId,
      action: input.body.action,
      stageKey: input.body.stageKey,
      testName: input.body.testName,
      actorName,
      fields: recordFields(input.body.fields),
    });
  }
  if (input.body.fields) return failCommand("检验数据更新必须声明动作");
  return okCommand({ kind: "update", batchId: input.batchId, body: input.body });
}

export async function executeQcBatchPatchCommand(command: QcBatchPatchCommand) {
  try {
    if (command.kind !== "workflow") {
      const batch = await updateQcBatch(command.batchId, command.body);
      if (!batch) return serviceError("批次不存在", 404);
      return serviceOk({ data: batch });
    }
    if (command.action === "save_precheck") {
      const batch = await updateQcBatchPrecheck(command.batchId, {
        stageKey: command.stageKey,
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

export async function executeSubmitQcBatchCommand(command: { batchId: number }) {
  const batch = await submitQcBatch(command.batchId);
  if (!batch) return serviceError("批次不存在", 404);
  return serviceOk({ data: batch });
}

export async function executeDeleteQcBatchCommand(command: { batchId: number }) {
  const deleted = await deleteQcBatch(command.batchId);
  if (!deleted) return serviceError("批次不存在", 404);
  return serviceOk({ ok: true });
}
