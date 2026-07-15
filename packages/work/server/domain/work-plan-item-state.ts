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

export async function applyWorkPlanItemLifecycle(
  store: Pick<WorkPlanItemStateStore, "workItem">,
  planId: number,
  lifecycle: "done" | "archived",
  now = new Date(),
) {
  if (lifecycle === "archived") {
    return store.workItem.updateMany({
      where: { planId, isArchived: false },
      data: { isArchived: true },
    });
  }
  return store.workItem.updateMany({
    where: {
      planId,
      OR: [{ status: null }, { status: { not: "done" } }],
    },
    data: { status: "done", completedAt: now },
  });
}

export async function closeOkrPlanIfAllItemsComplete(
  store: WorkPlanItemStateStore,
  planId: number,
  now = new Date(),
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

  await applyWorkPlanItemLifecycle(store, planId, "done", now);
  await store.workPlan.update({
    where: { id: planId },
    data: { status: "done", okrStage: "closed" },
  });
  return true;
}

function itemStatusCategory(input: { status: string | null; isArchived: boolean }): keyof WorkPlanItemStatusCounts {
  if (input.isArchived) return "archived";
  if (input.status === "done") return "done";
  return "active";
}

function emptyStatusCounts(): WorkPlanItemStatusCounts {
  return { active: 0, done: 0, archived: 0 };
}
