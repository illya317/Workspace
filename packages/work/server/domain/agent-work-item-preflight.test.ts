import assert from "node:assert/strict";
import test from "node:test";

import { validateWorkItemCompletion } from "./work-completion-policy";
import { validateKrEvidenceTasks } from "../work-kr-evidence";

test("Agent evidence preflight reuses the canonical same-plan and same-objective rule", async () => {
  const validStore = {
    workItem: {
      findMany: async () => [{ id: 7, planId: 3, itemType: "task", parentWorkItemId: 5 }],
    },
  };
  assert.equal(await validateKrEvidenceTasks(validStore as never, {
    planId: 3,
    objectiveId: 5,
    evidenceTaskIds: [7],
  }), null);

  const invalidStore = {
    workItem: {
      findMany: async () => [{ id: 7, planId: 4, itemType: "task", parentWorkItemId: 5 }],
    },
  };
  assert.match(await validateKrEvidenceTasks(invalidStore as never, {
    planId: 3,
    objectiveId: 5,
    evidenceTaskIds: [7],
  }) ?? "", /同一目标/);
});

test("completion preflight evaluates the proposed evidence set without writing it", async () => {
  let storedEvidenceReads = 0;
  const store = {
    workItem: {
      findUnique: async () => ({ itemType: "key_result", routineTaskType: null }),
      count: async ({ where }: { where: Record<string, unknown> }) => (
        "parentWorkItemId" in where ? 0 : 1
      ),
    },
    workKrEvidence: {
      count: async () => {
        storedEvidenceReads += 1;
        return 0;
      },
    },
  };

  assert.match(await validateWorkItemCompletion(store as never, 42, [7]) ?? "", /未完成证据任务/);
  assert.equal(storedEvidenceReads, 0);
  assert.equal(await validateWorkItemCompletion(store as never, 42, []), null);
});
