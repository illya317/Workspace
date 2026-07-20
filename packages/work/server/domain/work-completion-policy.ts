import type { Prisma } from "@workspace/platform/server/prisma";

type WorkCompletionStore = Pick<
  Prisma.TransactionClient,
  "workItem" | "workKrEvidence"
>;

const INCOMPLETE_ITEM_WHERE: Prisma.WorkItemWhereInput = {
  isArchived: false,
  OR: [{ status: null }, { status: { not: "done" } }],
};

export class WorkCompletionPolicyError extends Error {}

export async function validateWorkItemCompletion(
  store: WorkCompletionStore,
  workItemId: number,
  pendingEvidenceTaskIds?: readonly number[],
) {
  const item = await store.workItem.findUnique({
    where: { id: workItemId },
    select: { itemType: true, routineTaskType: true },
  });
  if (!item) return "工作项不存在";

  const [incompleteChildCount, incompleteEvidenceCount] = await Promise.all([
    store.workItem.count({
      where: { parentWorkItemId: workItemId, ...INCOMPLETE_ITEM_WHERE },
    }),
    item.itemType === "key_result"
      ? pendingEvidenceTaskIds === undefined
        ? store.workKrEvidence.count({
          where: {
            krWorkItemId: workItemId,
            taskWorkItem: { ...INCOMPLETE_ITEM_WHERE },
          },
        })
        : pendingEvidenceTaskIds.length === 0
          ? Promise.resolve(0)
          : store.workItem.count({
            where: { id: { in: [...pendingEvidenceTaskIds] }, ...INCOMPLETE_ITEM_WHERE },
          })
      : Promise.resolve(0),
  ]);

  if (incompleteChildCount > 0) {
    const subject = item.routineTaskType === "standing" ? "常设职责" : "工作项";
    return `${subject}仍有 ${incompleteChildCount} 个未完成子项，不能完成`;
  }
  if (incompleteEvidenceCount > 0) {
    return `KR 仍有 ${incompleteEvidenceCount} 个未完成证据任务，不能完成`;
  }
  return null;
}

export async function validateWorkItemRestore(
  store: Pick<WorkCompletionStore, "workItem">,
  workItemId: number,
) {
  const item = await store.workItem.findUnique({
    where: { id: workItemId },
    select: {
      status: true,
      plan: { select: { status: true, isArchived: true } },
      parentWorkItem: { select: { status: true, isArchived: true } },
    },
  });
  if (!item) return "工作项不存在";
  if (item.plan?.isArchived) return "所属计划仍处于归档状态，不能恢复工作项";
  if (item.parentWorkItem?.isArchived) return "上级工作项仍处于归档状态，不能恢复子项";
  if (item.status !== "done" && item.plan?.status === "done") return "已完成计划下不能恢复未完成工作项";
  if (item.status !== "done" && item.parentWorkItem?.status === "done") return "已完成上级工作项下不能恢复未完成子项";
  return null;
}

/** Transaction-authoritative reverse invariant check for create, reparent, and reopen writes. */
export async function validateWorkItemParentStateInvariant(
  store: Pick<Prisma.TransactionClient, "workPlan" | "workItem">,
  input: {
    planId: number | null;
    parentWorkItemId: number | null;
    targetType: string;
    targetId: number;
    status: string | null;
  },
) {
  if (!input.planId) return "必须选择工作计划";
  const [plan, parent] = await Promise.all([
    store.workPlan.findUnique({
      where: { id: input.planId },
      select: { targetType: true, targetId: true, status: true, isArchived: true },
    }),
    input.parentWorkItemId
      ? store.workItem.findUnique({
        where: { id: input.parentWorkItemId },
        select: { planId: true, targetType: true, targetId: true, status: true, isArchived: true },
      })
      : Promise.resolve(null),
  ]);
  if (!plan) return "工作计划不存在";
  if (plan.targetType !== input.targetType || plan.targetId !== input.targetId) return "工作计划不属于当前空间";
  if (plan.isArchived) return "已归档计划不能新增、恢复或调整工作项";
  if (plan.status === "done" && input.status !== "done") return "已完成计划下不能保留未完成工作项";
  if (input.parentWorkItemId && !parent) return "上级工作项不存在";
  if (parent) {
    if (parent.planId !== input.planId || parent.targetType !== input.targetType || parent.targetId !== input.targetId) {
      return "上级工作项不属于当前计划或空间";
    }
    if (parent.isArchived) return "上级工作项已归档";
    if (parent.status === "done" && input.status !== "done") return "已完成上级工作项下不能保留未完成子项";
  }
  return null;
}
