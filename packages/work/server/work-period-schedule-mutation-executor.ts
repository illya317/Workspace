import {
  defineBusinessActionCommandAdapter,
  executeBusinessActionCommand,
} from "@workspace/platform/server/business-action-executor";
import type { ApprovalPreparedPayload } from "@workspace/platform/server/approvals";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { prisma } from "@workspace/platform/server/prisma";
import { canCreateWorkTaskAction } from "./access";
import {
  commitWorkItemApproval,
  validateCreateItemApprovalPayload,
  workTaskApprovalAdapter,
} from "./task-approval-adapter";
import type { WorkTaskItemApprovalPayload } from "./task-approval-helpers";
import type { CreateWorkPeriodScheduleItemRouteCommand } from "./work-task-route-command";

type ScheduleCommandContext = { actorUserId: number };
type ScheduleCommandResult = { entityType: string; entityId: string; entity: unknown };

const createScheduleCommand = defineBusinessActionCommandAdapter<
  WorkTaskItemApprovalPayload,
  ApprovalPreparedPayload<WorkTaskItemApprovalPayload>,
  ScheduleCommandResult,
  ScheduleCommandContext
>({
  businessActionKey: "work.tasks.item.create",
  validatorKey: "packages/work/server/task-approval-adapter.validateCreateItemApprovalPayload",
  commitKey: "packages/work/server/task-approval-adapter.commitWorkItemApproval",
  validate: (payload, context) => validateCreateItemApprovalPayload(context.actorUserId, payload),
  commit: (prepared, context) => commitWorkItemApproval(context.actorUserId, context.actorUserId, "create", prepared.payload),
});

export async function executeCreateWorkPeriodScheduleItemRouteCommand(
  command: CreateWorkPeriodScheduleItemRouteCommand,
) {
  const target = await resolveScheduleTarget(command.rootPlanId);
  if (!target.ok) return target;
  const payload = {
    entityType: "item" as const,
    targetType: target.data.targetType,
    targetId: target.data.targetId,
    workId: null,
    data: {
      content: command.content,
      periodSchedule: withoutActor(command),
    },
  } as unknown as WorkTaskItemApprovalPayload;
  const result = await executeBusinessActionCommand({
    command: createScheduleCommand,
    input: payload,
    context: { actorUserId: command.actorUserId },
    actorUserId: command.actorUserId,
    authorize: () => canCreateWorkTaskAction(
        command.actorUserId,
        target.data.targetType,
        target.data.targetId,
      ),
    forbiddenMessage: "无权限编辑工作计划",
    workflow: {
      applicable: target.data.targetType !== "personal",
      adapter: workTaskApprovalAdapter,
      operation: "create",
      prepare: (prepared) => prepared,
    },
  });
  if (!result.ok) return result;
  return result.data.executionMode === "direct"
    ? serviceOk({ executionMode: "direct" as const, schedule: result.data.result.entity })
    : serviceOk({ executionMode: "workflow" as const, request: result.data.request });
}

async function resolveScheduleTarget(rootPlanId: number) {
  const plan = await prisma.workPlan.findUnique({
    where: { id: rootPlanId },
    select: { targetType: true, targetId: true, kind: true, isArchived: true },
  });
  if (!plan || plan.kind !== "okr" || plan.isArchived) {
    return serviceError("上级计划不存在", 404);
  }
  return serviceOk({ targetType: plan.targetType, targetId: plan.targetId });
}

function withoutActor(command: CreateWorkPeriodScheduleItemRouteCommand) {
  const { actorUserId: _actorUserId, mutationAuthorization: _authorization, ...data } = command;
  return data;
}
