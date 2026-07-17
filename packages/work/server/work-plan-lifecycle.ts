import { guardedDelete } from "@workspace/platform/server/delete-guard";
import type { DomainServiceResult } from "@workspace/platform/server/domain-validation";
import { prisma } from "@workspace/platform/server/prisma";
import { archiveWorkPlanItems } from "./domain/work-plan-item-state";
import { validateWorkPlanCommand } from "./domain/work-plan-validation";

function positiveId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function archiveWorkPlan(planId: number, actorUserId: number): Promise<DomainServiceResult<{ success: true }>> {
  const guard = validateWorkPlanCommand("archiveWorkPlan");
  if (!guard.ok) return { ok: false, error: guard.issue.message, status: guard.issue.status };
  const id = positiveId(planId);
  if (!id) return { ok: false, error: "工作计划 ID 无效", status: 400 };
  const plan = await prisma.workPlan.findUnique({ where: { id }, select: { kind: true, isArchived: true } });
  if (!plan) return { ok: false, error: "工作计划不存在", status: 404 };
  if (plan.kind === "routine") return { ok: false, error: "日常工作是空间预留入口，不能归档", status: 400 };
  if (plan.isArchived) {
    await prisma.workPlan.update({ where: { id }, data: { isArchived: false } });
    return { ok: true, data: { success: true } };
  }
  const result = await guardedDelete({
    entityType: "WorkPlan", modelKey: "workPlan", id, userId: actorUserId,
    actionLabel: "归档工作计划", deleteMode: "archive",
    archiveField: { field: "isArchived", value: true }, referencePolicy: "retained",
    onBeforeDelete: async (_id, { tx }) => {
      await archiveWorkPlanItems(tx, id);
      return { ok: true };
    },
  });
  return result.ok ? { ok: true, data: { success: true } } : result;
}

export async function deleteWorkPlan(planId: number, actorUserId: number): Promise<DomainServiceResult<{ success: true }>> {
  const guard = validateWorkPlanCommand("deleteWorkPlan");
  if (!guard.ok) return { ok: false, error: guard.issue.message, status: guard.issue.status };
  const id = positiveId(planId);
  if (!id) return { ok: false, error: "工作计划 ID 无效", status: 400 };
  const plan = await prisma.workPlan.findUnique({ where: { id }, select: { kind: true, isSystemGenerated: true } });
  if (plan?.kind === "routine") return { ok: false, error: "日常工作是空间预留入口，不能删除", status: 400 };
  if (plan?.kind === "okr" && plan.isSystemGenerated) return { ok: false, error: "固定周期计划由系统维护，不能删除", status: 400 };
  const result = await guardedDelete({
    entityType: "WorkPlan", modelKey: "workPlan", id, userId: actorUserId,
    actionLabel: "删除工作计划", deleteMode: "hard",
    references: [
      { label: "工作项", count: (tx) => tx.workItem.count({ where: { planId: id } }) },
      { label: "派生计划", count: (tx) => tx.workPlan.count({ where: { sourcePlanId: id } }) },
      { label: "下级周期计划", count: (tx) => tx.workPlan.count({ where: { parentPeriodPlanId: id } }) },
      { label: "后续周期计划", count: (tx) => tx.workPlan.count({ where: { previousPeriodPlanId: id } }) },
    ],
    referencePolicy: "checked",
  });
  return result.ok ? { ok: true, data: { success: true } } : result;
}
