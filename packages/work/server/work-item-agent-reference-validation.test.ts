import assert from "node:assert/strict";
import test, { mock } from "node:test";

let candidatesByUser = new Map<number, number[]>();
let deniedStageUsers = new Set<number>();
let localParentStatus: string | null = "active";
let searchedKeywords: string[] = [];

mock.module("@workspace/platform/server/prisma", {
  namedExports: {
    prisma: {
      employee: { findUnique: async ({ where }: { where: { id: number } }) => ({ name: `员工 ${where.id}`, employeeId: `E${where.id}` }) },
      departmentCollaboration: { findUnique: async () => null },
      position: { findUnique: async ({ where }: { where: { id: number } }) => ({ name: `岗位 ${where.id}` }) },
      positionResponsibilityNode: {
        findUnique: async ({ where }: { where: { id: number } }) => ({
          pathLabel: `职责路径 ${where.id}`,
          title: `职责 ${where.id}`,
          content: "",
        }),
      },
      workItem: {
        findUnique: async () => null,
        findFirst: async ({ where }: { where: { id: number } }) => ({
          id: where.id,
          content: "常设职责",
          itemType: "task",
          routineTaskType: "standing",
          parentWorkItemId: null,
          status: localParentStatus,
        }),
        findMany: async () => [],
      },
    },
  },
} as never);

mock.module("./work-task-route-command", {
  namedExports: {
    executeWorkReferenceOptionsRouteCommand: async ({
      fkKey,
      keyword,
      userId,
    }: {
      fkKey: string;
      keyword: string;
      userId: number;
    }) => {
      searchedKeywords.push(keyword);
      const option = (id: number) => {
        const name = fkKey === "work.tasks.owner.employee"
          ? `员工 ${id}`
          : fkKey === "work.tasks.owner.position"
            ? `岗位 ${id}`
            : `职责路径 ${id} · 职责 ${id}`;
        return {
          id,
          name,
          lockedEmployeeId: 6,
          lockedEmployeeName: "员工 6",
          lockedPositionId: 9,
          lockedPositionName: "岗位 9",
        };
      };
      const matches = (id: number) => {
        if (!keyword) return true;
        if (fkKey === "work.tasks.owner.employee") return keyword === `E${id}` || keyword === `员工 ${id}`;
        return keyword === option(id).name;
      };
      return { items: (candidatesByUser.get(userId) ?? []).filter(matches).map(option) };
    },
  },
} as never);
mock.module("./work-okr-stage", {
  namedExports: {
    assertWorkItemStageAllowed: async ({ actorUserId }: { actorUserId: number }) => (
      deniedStageUsers.has(actorUserId)
        ? { ok: false, error: `stage denied for ${actorUserId}`, status: 403 }
        : { ok: true, data: { stage: "execution" } }
    ),
  },
} as never);

const { validateAgentWorkItemReferenceChanges } = await import("./work-item-agent-reference-validation");
const { assertSharedAgentWorkItemStageAllowed } = await import("./work-item-agent-stage-access");

const snapshot = {
  id: 42,
  targetType: "department",
  targetId: 825,
  planId: 3,
  category: "non-routine",
  itemType: "task",
  routineTaskType: null,
  ownerEmployeeId: 6,
  collaborationId: null,
  parentWorkItemId: 5,
};
const execution = {
  requester: { id: 1 },
  actor: { id: 2 },
  profile: null,
} as never;

test("touched FK is rejected when only the Agent actor can see the candidate", async () => {
  candidatesByUser = new Map([[1, []], [2, [7]]]);
  searchedKeywords = [];
  const result = await validateAgentWorkItemReferenceChanges({
    execution,
    snapshot,
    changes: { workId: 42, ownerEmployeeId: 7 },
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /共同可用/);
});

test("touched FK is accepted and labeled when requester and actor share the candidate", async () => {
  candidatesByUser = new Map([[1, [7]], [2, [7]]]);
  searchedKeywords = [];
  const result = await validateAgentWorkItemReferenceChanges({
    execution,
    snapshot,
    changes: { workId: 42, ownerEmployeeId: 7 },
  });

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.labels.ownerEmployeeId, "员工 7 (#7)");
  assert.deepEqual(searchedKeywords, ["E7", "E7"]);
});

test("responsibility reference label includes the locked employee and position context", async () => {
  candidatesByUser = new Map([[1, [9, 10]], [2, [9, 10]]]);
  const result = await validateAgentWorkItemReferenceChanges({
    execution,
    snapshot: { ...snapshot, category: "routine", routineTaskType: "standing" },
    changes: { workId: 42, responsibilityPositionId: 9, responsibilityNodeId: 10 },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(
      result.labels.responsibilityNodeId,
      "职责路径 10 · 职责 10 (#10) · 负责人 员工 6 (#6) · 岗位 岗位 9 (#9)",
    );
  }
});

test("standing collaboration change requires responsibility reselection even when owner id stays the same", async () => {
  candidatesByUser = new Map([[1, [6]], [2, [6]]]);
  const result = await validateAgentWorkItemReferenceChanges({
    execution,
    snapshot: { ...snapshot, category: "routine", routineTaskType: "standing", collaborationId: 5 },
    changes: { workId: 42, collaborationId: 7, ownerEmployeeId: 6 },
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /重新确认岗位和岗位职责/);
});

test("ordinary routine parent must have an explicit active status like the manual candidate list", async () => {
  const ordinarySnapshot = { ...snapshot, category: "routine", routineTaskType: "task" };
  localParentStatus = null;
  const legacyNullStatus = await validateAgentWorkItemReferenceChanges({
    execution,
    snapshot: ordinarySnapshot,
    changes: { workId: 42, parentWorkItemId: 5 },
  });
  assert.equal(legacyNullStatus.ok, false);

  localParentStatus = "active";
  const active = await validateAgentWorkItemReferenceChanges({
    execution,
    snapshot: ordinarySnapshot,
    changes: { workId: 42, parentWorkItemId: 5 },
  });
  assert.equal(active.ok, true);
});

test("proposal stage preflight rejects when requester facet is denied but actor is allowed", async () => {
  deniedStageUsers = new Set([1]);
  const result = await assertSharedAgentWorkItemStageAllowed({
    execution,
    planId: 3,
    itemType: "task",
    changesKrCurrentValue: false,
  });

  assert.equal(result?.ok, false);
  if (result && !result.ok) assert.match(result.error, /stage denied for 1/);
});
