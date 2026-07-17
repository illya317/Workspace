import assert from "node:assert/strict";
import test from "node:test";

import {
  validateWorkItemCompletion,
  validateWorkItemRestore,
} from "../../packages/work/server/domain/work-completion-policy";

test("objective and standing completion block on unfinished children", async () => {
  const objectiveStore = completionStore({ itemType: "objective", routineTaskType: null }, 1, 0);
  const standingStore = completionStore({ itemType: "task", routineTaskType: "standing" }, 3, 0);

  assert.equal(await validateWorkItemCompletion(objectiveStore as never, 11), "工作项仍有 1 个未完成子项，不能完成");
  assert.equal(await validateWorkItemCompletion(standingStore as never, 12), "常设职责仍有 3 个未完成子项，不能完成");
});

test("KR completion blocks on unfinished evidence tasks", async () => {
  const store = completionStore({ itemType: "key_result", routineTaskType: null }, 0, 2);

  assert.equal(
    await validateWorkItemCompletion(store as never, 13),
    "KR 仍有 2 个未完成证据任务，不能完成",
  );
});

test("terminal children and evidence allow completion", async () => {
  const store = completionStore({ itemType: "key_result", routineTaskType: null }, 0, 0);
  assert.equal(await validateWorkItemCompletion(store as never, 14), null);
});

test("restore blocks unfinished children under completed or archived parents", async () => {
  const completedPlanStore = restoreStore({
    status: "active",
    plan: { status: "done", isArchived: false },
    parentWorkItem: null,
  });
  const archivedParentStore = restoreStore({
    status: "done",
    plan: { status: "active", isArchived: false },
    parentWorkItem: { status: "done", isArchived: true },
  });

  assert.equal(await validateWorkItemRestore(completedPlanStore as never, 21), "已完成计划下不能恢复未完成工作项");
  assert.equal(await validateWorkItemRestore(archivedParentStore as never, 22), "上级工作项仍处于归档状态，不能恢复子项");
});

function completionStore(
  item: { itemType: string; routineTaskType: string | null },
  incompleteChildren: number,
  incompleteEvidence: number,
) {
  return {
    workItem: {
      findUnique: async () => item,
      count: async () => incompleteChildren,
    },
    workKrEvidence: {
      count: async () => incompleteEvidence,
    },
  };
}

function restoreStore(item: {
  status: string | null;
  plan: { status: string; isArchived: boolean } | null;
  parentWorkItem: { status: string | null; isArchived: boolean } | null;
}) {
  return { workItem: { findUnique: async () => item } };
}
