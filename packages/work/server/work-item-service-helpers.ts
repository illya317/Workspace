import { Prisma } from "@workspace/platform/server/prisma";
import { validateWorkResponsibilitySelection } from "./work-responsibility-references";

export async function validateWorkItemResponsibility(input: {
  planId: number | null | undefined;
  itemType: string;
  category: string;
  routineTaskType?: string | null;
  ownerEmployeeId?: number | null;
  responsibilityNodeId?: number | null;
  responsibilityPositionId?: number | null;
  responsibilityTouched: boolean;
}) {
  if (input.itemType !== "task") {
    if (input.itemType !== "objective") return input.responsibilityTouched && input.responsibilityNodeId ? "只有目标和任务可以直接关联职责" : null;
    return validateWorkResponsibilitySelection({
      responsibilityNodeId: input.responsibilityNodeId, ownerEmployeeId: input.ownerEmployeeId, positionId: input.responsibilityPositionId,
      required: false, expectedNodeType: "duty_group", label: "目标",
    });
  }
  const required = input.category === "routine" && input.routineTaskType === "standing";
  return validateWorkResponsibilitySelection({
    responsibilityNodeId: input.responsibilityNodeId, ownerEmployeeId: input.ownerEmployeeId, positionId: input.responsibilityPositionId,
    required: required && input.responsibilityTouched, expectedNodeType: "duty_item", label: "任务",
  });
}

export function buildStatusPatch(
  status?: string | null,
  isArchived?: boolean,
  current?: { status: string | null; completedAt: Date | null },
): Prisma.WorkItemUncheckedUpdateInput {
  if (status !== undefined) {
    if (status === null) return { status: null, completedAt: null };
    if (status === "done") return current?.status === "done" ? { status } : { status, completedAt: new Date() };
    return current?.status === "done" ? { status, completedAt: null } : { status };
  }
  if (isArchived !== undefined) return { isArchived };
  return {};
}

export function validateWorkItemPeriodPatch(
  existing: { periodType: string | null; periodStart: Date | null; periodEnd: Date | null },
  patch: { periodType?: string | null; periodStart?: Date | string | null; periodEnd?: Date | string | null },
) {
  const periodType = patch.periodType === undefined ? existing.periodType : patch.periodType;
  const periodStart = patch.periodStart === undefined ? existing.periodStart : toDateOrNull(patch.periodStart);
  const periodEnd = patch.periodEnd === undefined ? existing.periodEnd : toDateOrNull(patch.periodEnd);
  if (!periodType) return periodStart || periodEnd ? "设置周期起止时必须选择周期类型" : null;
  if (!periodStart || !periodEnd) return "计划周期起止不能为空";
  if (periodEnd < periodStart) return "周期结束不能早于周期开始";
  return null;
}

function toDateOrNull(value: Date | string | null | undefined) {
  return value ? value instanceof Date ? value : new Date(value) : null;
}
