import { createPreparedApprovalDraft, prepareApprovalDraft, submit, type ApprovalOperation } from "@workspace/platform/server/approvals";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import { commitPreparedWorkTaskPayload, workTaskApprovalAdapter } from "./task-approval-adapter";
import { canUpdateWorkTaskAction } from "./access";
import { listDepartmentCollaborations, respondDepartmentCollaboration } from "./department-collaborations";

type CollaborationBody = {
  title?: string;
  description?: string;
  collaborationType?: string;
  triggerRule?: string;
  scopeDescription?: string;
  inputRequirement?: string;
  deliverable?: string;
  acceptanceCriteria?: string;
  responseTargetHours?: number | null;
  deliveryTargetDays?: number | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  escalationPolicy?: string;
  responsibleDepartmentId?: number;
  enablingDepartmentIds?: number[];
  responsiblePositionIds?: number[];
  executorPositionIds?: number[];
};

export function buildListDepartmentCollaborationsCommand(input: { userId: number; departmentId?: number | null }) {
  const departmentId = positiveId(input.departmentId);
  return departmentId
    ? okCommand({ userId: input.userId, departmentId })
    : failCommand("部门无效", 400, "departmentId");
}

export function executeListDepartmentCollaborationsCommand(command: { userId: number; departmentId: number }) {
  return listDepartmentCollaborations(command);
}

export function buildSubmitDepartmentCollaborationCommand(input: { userId: number; body: CollaborationBody }): DomainValidationResult<{
  userId: number;
  responsibleDepartmentId: number;
  payload: Record<string, unknown>;
}> {
  const responsibleDepartmentId = positiveId(input.body.responsibleDepartmentId);
  if (!responsibleDepartmentId) return failCommand("负责部门无效", 400, "responsibleDepartmentId");
  return okCommand({
    userId: input.userId,
    responsibleDepartmentId,
    payload: {
      title: input.body.title,
      description: input.body.description,
      collaborationType: input.body.collaborationType,
      triggerRule: input.body.triggerRule,
      scopeDescription: input.body.scopeDescription,
      inputRequirement: input.body.inputRequirement,
      deliverable: input.body.deliverable,
      acceptanceCriteria: input.body.acceptanceCriteria,
      responseTargetHours: input.body.responseTargetHours,
      deliveryTargetDays: input.body.deliveryTargetDays,
      effectiveFrom: input.body.effectiveFrom,
      effectiveTo: input.body.effectiveTo,
      escalationPolicy: input.body.escalationPolicy,
      responsibleDepartmentId,
      enablingDepartmentIds: input.body.enablingDepartmentIds,
      responsiblePositionIds: input.body.responsiblePositionIds,
      executorPositionIds: input.body.executorPositionIds,
    },
  });
}

export async function executeSubmitDepartmentCollaborationCommand(command: {
  userId: number;
  responsibleDepartmentId: number;
  payload: Record<string, unknown>;
}) {
  return executeDepartmentCollaborationMutation({
    ...command,
    operation: "create",
  });
}

export function buildUpdateDepartmentCollaborationCommand(input: {
  userId: number;
  collaborationId?: number | null;
  body: CollaborationBody;
}): DomainValidationResult<{
  userId: number;
  collaborationId: number;
  responsibleDepartmentId: number;
  payload: Record<string, unknown>;
}> {
  const collaborationId = positiveId(input.collaborationId);
  if (!collaborationId) return failCommand("协作事项无效", 400, "collaborationId");
  const base = buildSubmitDepartmentCollaborationCommand({ userId: input.userId, body: input.body });
  return base.ok ? okCommand({ ...base.data, collaborationId }) : base;
}

export async function executeUpdateDepartmentCollaborationCommand(command: {
  userId: number;
  collaborationId: number;
  responsibleDepartmentId: number;
  payload: Record<string, unknown>;
}) {
  return executeDepartmentCollaborationMutation({
    ...command,
    operation: "update",
    subjectId: String(command.collaborationId),
  });
}

async function executeDepartmentCollaborationMutation(command: {
  userId: number;
  responsibleDepartmentId: number;
  payload: Record<string, unknown>;
  operation: ApprovalOperation;
  subjectId?: string | null;
}) {
  const prepared = await prepareApprovalDraft({
    adapter: workTaskApprovalAdapter,
    actorUserId: command.userId,
    operation: command.operation,
    subjectId: command.subjectId,
    payload: {
      entityType: "collaboration",
      targetType: "department",
      targetId: command.responsibleDepartmentId,
      data: command.payload,
    },
  });
  if (!prepared.ok) return serviceError(prepared.error, prepared.status || 400);
  const workflowPolicy = prepared.data.workflowPolicy;
  if (workflowPolicy.mode === "direct" || workflowPolicy.mode === "permission_only") {
    if (!(await canUpdateWorkTaskAction(command.userId, "department", command.responsibleDepartmentId))) {
      return serviceError("无权限直接保存部门协作", 403);
    }
    const committed = await commitPreparedWorkTaskPayload({
      actorUserId: command.userId,
      submitterUserId: command.userId,
      operation: command.operation,
      subjectId: prepared.data.prepared.subjectId ?? command.subjectId,
      payload: prepared.data.prepared.payload,
    });
    return committed.ok
      ? serviceOk({ executionMode: "direct" as const, result: committed.data })
      : serviceError(committed.error, committed.status || 400);
  }
  const draft = await createPreparedApprovalDraft({
    adapter: workTaskApprovalAdapter,
    actorUserId: command.userId,
    operation: command.operation,
    subjectId: command.subjectId,
    prepared: prepared.data.prepared,
    workflowPolicy,
  });
  if (!draft.ok) return serviceError(draft.error, draft.status || 400);
  const result = await submit({
    adapter: workTaskApprovalAdapter,
    requestId: draft.data.request.id,
    actorUserId: command.userId,
    expectedVersion: draft.data.request.version,
  });
  return result.ok
    ? serviceOk({ executionMode: "workflow" as const, request: result.data.request })
    : serviceError(result.error, result.status || 400);
}

export function buildRespondDepartmentCollaborationCommand(input: {
  userId: number;
  collaborationId?: number | null;
  body: { departmentId?: number; action?: "accept" | "reject"; note?: string | null };
}) {
  const collaborationId = positiveId(input.collaborationId);
  const departmentId = positiveId(input.body.departmentId);
  if (!collaborationId || !departmentId || !input.body.action) return failCommand("协作响应参数无效", 400);
  return okCommand({
    userId: input.userId,
    collaborationId,
    departmentId,
    action: input.body.action,
    note: input.body.note ?? null,
  });
}

export function executeRespondDepartmentCollaborationCommand(command: {
  userId: number;
  collaborationId: number;
  departmentId: number;
  action: "accept" | "reject";
  note?: string | null;
}) {
  return respondDepartmentCollaboration(command);
}

function positiveId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}
