import {
  defineBusinessActionCommandAdapter,
  executeBusinessActionCommand,
} from "@workspace/platform/server/business-action-executor";
import type { ApprovalPreparedPayload } from "@workspace/platform/server/approvals";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import {
  canCreateWorkTaskAction,
  canUpdateWorkTaskAction,
} from "./access";
import {
  commitWorkItemApproval,
  validateCreateItemApprovalPayload,
  validateUpdateItemApprovalPayload,
  workTaskApprovalAdapter,
} from "./task-approval-adapter";
import type { WorkTaskItemApprovalPayload } from "./task-approval-helpers";
import type {
  CreateWorkItemRouteCommand,
  UpdateWorkItemRouteCommand,
} from "./work-task-route-command";
import { updateWorkItem } from "./works";

type WorkItemCommandContext = {
  actorUserId: number;
  submitterUserId: number;
  operation: "create" | "update";
  subjectId?: string | null;
};

type WorkItemCommandResult = { entityType: string; entityId: string; entity: unknown };

const createWorkItemCommand = defineBusinessActionCommandAdapter<
  WorkTaskItemApprovalPayload,
  ApprovalPreparedPayload<WorkTaskItemApprovalPayload>,
  WorkItemCommandResult,
  WorkItemCommandContext
>({
  businessActionKey: "work.tasks.item.create",
  validatorKey: "packages/work/server/task-approval-adapter.validateCreateItemApprovalPayload",
  commitKey: "packages/work/server/task-approval-adapter.commitWorkItemApproval",
  validate: (payload: WorkTaskItemApprovalPayload, context: WorkItemCommandContext) =>
    validateCreateItemApprovalPayload(context.actorUserId, payload),
  commit: (prepared, context: WorkItemCommandContext) =>
    commitWorkItemApproval(context.actorUserId, context.submitterUserId, "create", prepared.payload),
});

const updateWorkItemCommand = defineBusinessActionCommandAdapter<
  WorkTaskItemApprovalPayload,
  ApprovalPreparedPayload<WorkTaskItemApprovalPayload>,
  WorkItemCommandResult,
  WorkItemCommandContext
>({
  businessActionKey: "work.tasks.item.update",
  validatorKey: "packages/work/server/task-approval-adapter.validateUpdateItemApprovalPayload",
  commitKey: "packages/work/server/task-approval-adapter.commitWorkItemApproval",
  validate: (payload: WorkTaskItemApprovalPayload, context: WorkItemCommandContext) =>
    validateUpdateItemApprovalPayload(context.actorUserId, context.subjectId, payload),
  commit: (prepared, context: WorkItemCommandContext) =>
    commitWorkItemApproval(context.actorUserId, context.submitterUserId, "update", prepared.payload),
});

export async function executeCreateWorkItemRouteCommand(command: CreateWorkItemRouteCommand) {
  const { actorUserId, targetType, targetId, ...data } = command;
  const payload = { entityType: "item" as const, targetType, targetId, workId: null, data } as unknown as WorkTaskItemApprovalPayload;
  const context = { actorUserId, submitterUserId: actorUserId, operation: "create" as const };
  const result = await executeBusinessActionCommand({
    command: createWorkItemCommand,
    input: payload,
    context,
    actorUserId,
    authorize: () => canCreateWorkTaskAction(actorUserId, targetType, targetId),
    forbiddenMessage: "无权限编辑工作计划",
    workflow: {
      applicable: targetType !== "personal",
      adapter: workTaskApprovalAdapter,
      operation: "create",
      prepare: (prepared) => prepared,
    },
  });
  if (!result.ok) return result;
  return result.data.executionMode === "direct"
    ? serviceOk({ executionMode: "direct" as const, work: result.data.result.entity })
    : serviceOk({ executionMode: "workflow" as const, request: result.data.request });
}

export async function executeUpdateWorkItemRouteCommand(command: UpdateWorkItemRouteCommand) {
  if (command.lifecycleOnly) {
    const work = await updateWorkItem(command.workId, {
      actorUserId: command.userId,
      ...command.data,
      expectedUpdatedAt: command.expectedUpdatedAt,
    });
    if (!work.ok) return serviceError(work.error, work.status || 400, work.details);
    return serviceOk({ work: work.data });
  }
  const payload = {
    entityType: "item" as const,
    targetType: command.targetType,
    targetId: command.targetId,
    workId: command.workId,
    expectedUpdatedAt: command.expectedUpdatedAt,
    data: command.data,
  } as unknown as WorkTaskItemApprovalPayload;
  const context = { actorUserId: command.userId, submitterUserId: command.userId, operation: "update" as const, subjectId: String(command.workId) };
  const result = await executeBusinessActionCommand({
    command: updateWorkItemCommand,
    input: payload,
    context,
    actorUserId: command.userId,
    authorize: () => canUpdateWorkTaskAction(command.userId, command.targetType, command.targetId),
    forbiddenMessage: "无权限编辑工作计划",
    workflow: {
      applicable: command.targetType !== "personal",
      adapter: workTaskApprovalAdapter,
      operation: "update",
      subjectId: String(command.workId),
      prepare: (prepared) => prepared,
    },
  });
  if (!result.ok) return result;
  return result.data.executionMode === "direct"
    ? serviceOk({ executionMode: "direct" as const, work: result.data.result.entity })
    : serviceOk({ executionMode: "workflow" as const, request: result.data.request });
}
