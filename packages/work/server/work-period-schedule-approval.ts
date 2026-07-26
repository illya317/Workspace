import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { prisma } from "@workspace/platform/server/prisma";
import { getWorkTaskPermissionResourceKey } from "./access";
import type { WorkTaskItemApprovalPayload } from "./task-approval-helpers";
import { workTaskScopeId } from "./task-spaces";
import {
  createWorkPeriodScheduleItem,
  type CreateWorkPeriodScheduleItemCommand,
} from "./work-period-schedule";

type PeriodScheduleData = Omit<
  CreateWorkPeriodScheduleItemCommand,
  "actorUserId" | "mutationAuthorization"
>;

export function isWorkPeriodScheduleApprovalPayload(
  payload: WorkTaskItemApprovalPayload,
) {
  return Boolean(periodScheduleData(payload));
}

export async function validateWorkPeriodScheduleApprovalPayload(
  payload: WorkTaskItemApprovalPayload,
) {
  const schedule = periodScheduleData(payload);
  if (!schedule) return serviceError("时间安排审批参数无效", 400);
  const rootPlan = await prisma.workPlan.findUnique({
    where: { id: schedule.rootPlanId },
    select: {
      targetType: true,
      targetId: true,
      kind: true,
      isArchived: true,
    },
  });
  if (!rootPlan || rootPlan.kind !== "okr" || rootPlan.isArchived) {
    return serviceError("上级计划不存在", 404);
  }
  if (
    rootPlan.targetType !== payload.targetType
    || rootPlan.targetId !== payload.targetId
  ) {
    return serviceError("时间安排不属于当前工作空间", 400);
  }
  return serviceOk({
    resourceKey: getWorkTaskPermissionResourceKey(payload.targetType),
    scopeId: workTaskScopeId(payload.targetType, payload.targetId),
    subjectId: `period-schedule:${schedule.rootPlanId}:${schedule.cycleId}:${schedule.sourceItemId}`,
    businessActionKey: "work.tasks.item.create",
    workflowScopeType: payload.targetType,
    flowType: "approval" as const,
    separationPolicy: "auto_pass_if_authorized" as const,
    payload: {
      ...payload,
      workId: null,
      data: {
        ...payload.data,
        content: schedule.content,
        periodSchedule: schedule,
      },
    },
  });
}

export async function commitWorkPeriodScheduleApproval(
  submitterUserId: number,
  payload: WorkTaskItemApprovalPayload,
  authorization: "direct" | "workflow-approved",
) {
  const schedule = periodScheduleData(payload);
  if (!schedule) return serviceError("时间安排审批参数无效", 400);
  const result = await createWorkPeriodScheduleItem({
    ...schedule,
    actorUserId: submitterUserId,
    mutationAuthorization: authorization,
  });
  if (!result.ok) return serviceError(result.error, result.status || 400);
  return serviceOk({
    entityType: "work.task",
    entityId: String(result.data.workId),
    entity: result.data,
  });
}

function periodScheduleData(
  payload: WorkTaskItemApprovalPayload,
): PeriodScheduleData | null {
  const raw = payload.data.periodSchedule;
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Record<string, unknown>;
  const rootPlanId = positiveId(input.rootPlanId);
  const cycleId = positiveId(input.cycleId);
  const sourceItemId = positiveId(input.sourceItemId);
  const itemType = input.itemType === "objective" || input.itemType === "key_result"
    ? input.itemType
    : null;
  const content = String(input.content ?? "").trim();
  if (!rootPlanId || !cycleId || !sourceItemId || !itemType || !content) return null;
  return {
    ...input,
    rootPlanId,
    cycleId,
    sourceItemId,
    itemType,
    content,
  } as PeriodScheduleData;
}

function positiveId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}
