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
  updateQcBatchWorkflow,
} from "./batches";
import {
  getQcTemplateFeedback,
  listQcTemplateFeedback,
  listQcTemplateFeedbackByContext,
  saveQcTemplateFeedback,
  saveQcTemplateInlineFeedback,
  updateQcTemplateFeedbackResolved,
} from "./template-feedback";
import { getQcConfigOverviewCached, getQcTemplateDetail } from "./template-cache";

export type QcBatchPatchCommand =
  | {
      kind: "workflow";
      batchId: number;
      action: "save_inspection" | "approve_review";
      stageKey: string;
      testName: string;
      actorName: string;
      fields?: Record<string, unknown>;
    }
  | {
      kind: "update";
      batchId: number;
      body: Record<string, unknown>;
    };

export type QcTemplateFeedbackListCommand =
  | { kind: "list" }
  | { kind: "byKey"; key: string; userId: number };

export type QcTemplateFeedbackSaveCommand = {
  userId: number;
  userName: string;
  context: unknown;
  sections?: unknown;
  note?: unknown;
  inlineEntry?: unknown;
};

export type QcTemplateFeedbackResolveCommand = {
  userId: number;
  userName: string;
  key: string;
  resolved: boolean;
  targetType?: "section" | "inline";
  targetId?: string;
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
    action?: "save_inspection" | "approve_review";
    stageKey?: string;
    testName?: string;
    fields?: unknown;
  };
}): Promise<DomainValidationResult<QcBatchPatchCommand>> {
  if (input.body.action) {
    if (!input.body.stageKey || !input.body.testName) return failCommand("缺少检验项目信息");
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
    const batch = command.kind === "workflow"
      ? await updateQcBatchWorkflow(command.batchId, {
        action: command.action,
        stageKey: command.stageKey,
        testName: command.testName,
        actorName: command.actorName,
        fields: command.fields,
      })
      : await updateQcBatch(command.batchId, command.body);
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

export function buildQcTemplateFeedbackListCommand(input: {
  key?: string;
  userId: number;
}): DomainValidationResult<QcTemplateFeedbackListCommand> {
  if (input.key) return okCommand({ kind: "byKey", key: input.key, userId: input.userId });
  return okCommand({ kind: "list" });
}

export async function executeQcTemplateFeedbackListCommand(command: QcTemplateFeedbackListCommand) {
  if (command.kind === "byKey") {
    const [data, items] = await Promise.all([
      getQcTemplateFeedback(command.key, command.userId),
      listQcTemplateFeedbackByContext(command.key),
    ]);
    return { data, items };
  }
  return { data: await listQcTemplateFeedback() };
}

export async function buildQcTemplateFeedbackSaveCommand(input: {
  userId: number;
  userName?: string | null;
  body: {
    context: unknown;
    sections?: unknown;
    note?: unknown;
    inlineEntry?: unknown;
  };
}): Promise<DomainValidationResult<QcTemplateFeedbackSaveCommand>> {
  return okCommand({
    userId: input.userId,
    userName: await getUserEmployeeSignatureName(input.userId, input.userName ?? undefined),
    context: input.body.context,
    sections: input.body.sections,
    note: input.body.note,
    inlineEntry: input.body.inlineEntry,
  });
}

export async function executeQcTemplateFeedbackSaveCommand(command: QcTemplateFeedbackSaveCommand) {
  try {
    const author = { userId: command.userId, userName: command.userName };
    const item = command.inlineEntry
      ? await saveQcTemplateInlineFeedback(command.context, command.inlineEntry, author)
      : await saveQcTemplateFeedback(command.context, command.sections ?? command.note, author);
    const list = await listQcTemplateFeedback();
    return { data: item, keys: list.keys, states: list.states };
  } catch (error) {
    return serviceError(statusMessage(error, "保存反馈失败"), 400);
  }
}

export async function buildQcTemplateFeedbackResolveCommand(input: {
  userId: number;
  userName?: string | null;
  body: {
    key: string;
    resolved?: unknown;
    targetType?: string;
    targetId?: string;
  };
}): Promise<DomainValidationResult<QcTemplateFeedbackResolveCommand>> {
  return okCommand({
    userId: input.userId,
    userName: await getUserEmployeeSignatureName(input.userId, input.userName ?? undefined),
    key: input.body.key,
    resolved: input.body.resolved === true,
    targetType: input.body.targetType === "section" || input.body.targetType === "inline"
      ? input.body.targetType
      : undefined,
    targetId: String(input.body.targetId ?? "").trim() || undefined,
  });
}

export async function executeQcTemplateFeedbackResolveCommand(command: QcTemplateFeedbackResolveCommand) {
  try {
    const item = await updateQcTemplateFeedbackResolved(
      command.key,
      command.resolved,
      { userId: command.userId, userName: command.userName },
      { type: command.targetType, id: command.targetId },
    );
    return { data: item, list: await listQcTemplateFeedback() };
  } catch (error) {
    return serviceError(statusMessage(error, "更新反馈状态失败"), 400);
  }
}

export function executeQcConfigOverviewCommand() {
  return getQcConfigOverviewCached().then((data) => ({ data }));
}

export async function executeQcTemplateDetailCommand(command: { templateId: string }) {
  try {
    return { data: await getQcTemplateDetail(command.templateId) };
  } catch (error) {
    if (error instanceof Error && error.message.includes("Invalid QC template id")) {
      return serviceError("模板 ID 不合法", 400);
    }
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return serviceError("模板不存在", 404);
    }
    throw error;
  }
}
