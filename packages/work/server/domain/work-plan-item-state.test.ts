import assert from "node:assert/strict";
import test from "node:test";
import {
  applyWorkPlanItemLifecycle,
  closeOkrPlanIfAllItemsComplete,
  listWorkPlanItemStatusCounts,
} from "./work-plan-item-state";

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

test("completing a plan completes every unfinished item", async () => {
  const calls: unknown[] = [];
  const now = new Date("2026-07-15T08:00:00.000Z");
  const store = {
    workItem: {
      updateMany: async (input: unknown) => {
        calls.push(input);
        return { count: 2 };
      },
    },
  } as never;

  await applyWorkPlanItemLifecycle(store, 11, "done", now);

  assert.deepEqual(calls, [{
    where: { planId: 11, OR: [{ status: null }, { status: { not: "done" } }] },
    data: { status: "done", completedAt: now },
  }]);
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

  await applyWorkPlanItemLifecycle(store, 11, "archived");

  assert.deepEqual(calls, [{
    where: { planId: 11, isArchived: false },
    data: { isArchived: true },
  }]);
});

test("automatic completion waits for every visible item and closes atomically through the store", async () => {
  const itemUpdates: unknown[] = [];
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
      updateMany: async (input: unknown) => {
        itemUpdates.push(input);
        return { count: 1 };
      },
    },
  } as never;

  assert.equal(await closeOkrPlanIfAllItemsComplete(store, 13), true);
  assert.equal(itemUpdates.length, 1);
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
      updateMany: async () => {
        updated = true;
        return { count: 0 };
      },
    },
  } as never;

  assert.equal(await closeOkrPlanIfAllItemsComplete(store, 13), false);
  assert.equal(updated, false);
});
