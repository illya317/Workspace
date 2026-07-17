import type { Prisma } from "@workspace/platform/server/prisma";

export type WorkPlanItemStatusCounts = {
  active: number;
  done: number;
  archived: number;
};

export function shouldRecalculateOkrPlanCompletion(
  previousStatus: string | null | undefined,
  nextStatus: string | null | undefined,
) {
  return previousStatus !== "done" && nextStatus === "done";
}

type WorkPlanItemStateStore = Pick<Prisma.TransactionClient, "workItem" | "workPlan">;

export type WorkCompletionBlocker = {
  id: number;
  itemType: string;
  content: string;
};

export class WorkCompletionBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkCompletionBlockedError";
  }
}

export async function listWorkPlanItemStatusCounts(
  store: Pick<WorkPlanItemStateStore, "workItem">,
  planIds: number[],
) {
  const ids = Array.from(new Set(planIds.filter((id) => Number.isInteger(id) && id > 0)));
  const result = new Map<number, WorkPlanItemStatusCounts>(ids.map((id) => [id, emptyStatusCounts()]));
  if (ids.length === 0) return result;

  const rows = await store.workItem.groupBy({
    by: ["planId", "status", "isArchived"],
    where: { planId: { in: ids } },
    _count: { _all: true },
  });
  for (const row of rows) {
    if (!row.planId) continue;
    const counts = result.get(row.planId);
    if (!counts) continue;
    counts[itemStatusCategory(row)] += row._count._all;
  }
  return result;
}

export async function archiveWorkPlanItems(
  store: Pick<WorkPlanItemStateStore, "workItem">,
  planId: number,
) {
  return store.workItem.updateMany({
    where: { planId, isArchived: false },
    data: { isArchived: true },
  });
}

export async function assertWorkItemCanComplete(
  store: Pick<WorkPlanItemStateStore, "workItem">,
  workItemId: number,
) {
  const blockers = await store.workItem.findMany({
    where: {
      isArchived: false,
      OR: [{ status: null }, { status: { not: "done" } }],
      AND: [{
        OR: [
          { parentWorkItemId: workItemId },
          { taskEvidenceForKrs: { some: { krWorkItemId: workItemId } } },
        ],
      }],
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: { id: true, itemType: true, content: true },
  });
  if (blockers.length > 0) {
    throw new WorkCompletionBlockedError(completionBlockedMessage("当前工作项", blockers));
  }
}

export async function assertWorkPlanCanComplete(
  store: Pick<WorkPlanItemStateStore, "workItem">,
  planId: number,
) {
  const blockers = await store.workItem.findMany({
    where: {
      planId,
      isArchived: false,
      OR: [{ status: null }, { status: { not: "done" } }],
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: { id: true, itemType: true, content: true },
  });
  if (blockers.length > 0) {
    throw new WorkCompletionBlockedError(completionBlockedMessage("计划", blockers));
  }
}

export async function closeOkrPlanIfAllItemsComplete(
  store: WorkPlanItemStateStore,
  planId: number,
) {
  const plan = await store.workPlan.findUnique({
    where: { id: planId },
    select: { kind: true, status: true, isArchived: true },
  });
  if (!plan || plan.kind !== "okr" || plan.status === "done" || plan.isArchived) return false;

  const [totalItems, incompleteItems] = await Promise.all([
    store.workItem.count({ where: { planId, isArchived: false } }),
    store.workItem.count({
      where: {
        planId,
        isArchived: false,
        OR: [{ status: null }, { status: { not: "done" } }],
      },
    }),
  ]);
  if (totalItems === 0 || incompleteItems > 0) return false;

  await store.workPlan.update({
    where: { id: planId },
    data: { status: "done" },
  });
  return true;
}

function completionBlockedMessage(subject: string, blockers: WorkCompletionBlocker[]) {
  const visible = blockers.slice(0, 5).map((blocker) => `${workItemTypeLabel(blocker.itemType)}「${truncateContent(blocker.content)}」`);
  const remainder = blockers.length - visible.length;
  const blockerText = remainder > 0 ? `${visible.join("、")}等 ${blockers.length} 项` : visible.join("、");
  return `还有 ${blockers.length} 个下级节点尚未完成：${blockerText}；请先完成后再完成${subject}`;
}

function workItemTypeLabel(itemType: string) {
  if (itemType === "objective") return "目标";
  if (itemType === "key_result") return "KR";
  return "任务";
}

function truncateContent(content: string) {
  const normalized = content.trim() || "未命名";
  return normalized.length > 24 ? `${normalized.slice(0, 24)}…` : normalized;
}

function itemStatusCategory(input: { status: string | null; isArchived: boolean }): keyof WorkPlanItemStatusCounts {
  if (input.isArchived) return "archived";
  if (input.status === "done") return "done";
  return "active";
}

function emptyStatusCounts(): WorkPlanItemStatusCounts {
  return { active: 0, done: 0, archived: 0 };
}
