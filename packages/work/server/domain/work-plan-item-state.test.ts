import assert from "node:assert/strict";
import test from "node:test";
import {
  archiveWorkPlanItems,
  assertWorkItemCanComplete,
  assertWorkPlanCanComplete,
  closeOkrPlanIfAllItemsComplete,
  listWorkPlanItemStatusCounts,
  shouldRecalculateOkrPlanCompletion,
  WorkCompletionBlockedError,
} from "./work-plan-item-state";

test("only a transition into done requests OKR completion recalculation", () => {
  assert.equal(shouldRecalculateOkrPlanCompletion("active", "done"), true);
  assert.equal(shouldRecalculateOkrPlanCompletion("paused", "done"), true);
  assert.equal(shouldRecalculateOkrPlanCompletion(null, "done"), true);
  assert.equal(shouldRecalculateOkrPlanCompletion("done", "done"), false);
  assert.equal(shouldRecalculateOkrPlanCompletion("done", "active"), false);
  assert.equal(shouldRecalculateOkrPlanCompletion("active", "active"), false);
});

test("summarizes active, completed, and archived plan items", async () => {
  const store = {
    workItem: {
      groupBy: async () => [
        { planId: 7, status: "active", isArchived: false, _count: { _all: 2 } },
        { planId: 7, status: "paused", isArchived: false, _count: { _all: 1 } },
        { planId: 7, status: "done", isArchived: false, _count: { _all: 3 } },
        { planId: 7, status: "active", isArchived: true, _count: { _all: 4 } },
      ],
    },
  } as never;

  const result = await listWorkPlanItemStatusCounts(store, [7]);

  assert.deepEqual(result.get(7), { active: 3, done: 3, archived: 4 });
});

test("work item completion is blocked by unfinished direct children and KR evidence tasks", async () => {
  let query: unknown;
  const store = {
    workItem: {
      findMany: async (input: unknown) => {
        query = input;
        return [
          { id: 21, itemType: "task", content: "完成接口联调" },
          { id: 22, itemType: "key_result", content: "错误率降至 1%" },
        ];
      },
    },
  } as never;

  await assert.rejects(
    () => assertWorkItemCanComplete(store, 11),
    (error) => error instanceof WorkCompletionBlockedError
      && error.message === "还有 2 个下级节点尚未完成：任务「完成接口联调」、KR「错误率降至 1%」；请先完成后再完成当前工作项",
  );

  assert.deepEqual(query, {
    where: {
      isArchived: false,
      OR: [{ status: null }, { status: { not: "done" } }],
      AND: [{
        OR: [
          { parentWorkItemId: 11 },
          { taskEvidenceForKrs: { some: { krWorkItemId: 11 } } },
        ],
      }],
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: { id: true, itemType: true, content: true },
  });
});

test("plan completion is blocked instead of silently completing unfinished nodes", async () => {
  const store = {
    workItem: {
      findMany: async () => [{ id: 31, itemType: "objective", content: "提升运维效率" }],
    },
  } as never;

  await assert.rejects(
    () => assertWorkPlanCanComplete(store, 11),
    (error) => error instanceof WorkCompletionBlockedError
      && error.message === "还有 1 个下级节点尚未完成：目标「提升运维效率」；请先完成后再完成计划",
  );
});

test("archiving a plan archives every visible item", async () => {
  const calls: unknown[] = [];
  const store = {
    workItem: {
      updateMany: async (input: unknown) => {
        calls.push(input);
        return { count: 2 };
      },
    },
  } as never;

  await archiveWorkPlanItems(store, 11);

  assert.deepEqual(calls, [{
    where: { planId: 11, isArchived: false },
    data: { isArchived: true },
  }]);
});

test("automatic completion waits for every visible item and closes the plan without mutating nodes", async () => {
  const planUpdates: unknown[] = [];
  const counts = [3, 0];
  const store = {
    workPlan: {
      findUnique: async () => ({ kind: "okr", status: "active", isArchived: false }),
      update: async (input: unknown) => {
        planUpdates.push(input);
        return {};
      },
    },
    workItem: {
      count: async () => counts.shift() ?? 0,
    },
  } as never;

  assert.equal(await closeOkrPlanIfAllItemsComplete(store, 13), true);
  assert.deepEqual(planUpdates, [{
    where: { id: 13 },
    data: { status: "done", okrStage: "closed" },
  }]);
});

test("automatic completion leaves a plan active while any visible item is unfinished", async () => {
  let updated = false;
  const counts = [3, 1];
  const store = {
    workPlan: {
      findUnique: async () => ({ kind: "okr", status: "active", isArchived: false }),
      update: async () => {
        updated = true;
        return {};
      },
    },
    workItem: {
      count: async () => counts.shift() ?? 0,
    },
  } as never;

  assert.equal(await closeOkrPlanIfAllItemsComplete(store, 13), false);
  assert.equal(updated, false);
});
