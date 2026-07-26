import assert from "node:assert/strict";
import test, { mock } from "node:test";

let requesterSeesOwner = false;
const searchedKeys: string[] = [];
const searchedKeywords: string[] = [];

mock.module("@workspace/platform/server/prisma", {
  namedExports: {
    Prisma: {},
    prisma: {
      employee: {
        findUnique: async ({ where }: { where: { id: number } }) => ({
          name: `员工 ${where.id}`,
          employeeId: `E${where.id}`,
        }),
      },
      departmentCollaboration: { findUnique: async () => null },
      position: { findUnique: async ({ where }: { where: { id: number } }) => ({ name: `岗位 ${where.id}` }) },
      workItem: { findFirst: async () => null, findMany: async () => [] },
      workPlan: { findMany: async () => [] },
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
      searchedKeys.push(fkKey);
      searchedKeywords.push(keyword);
      if (fkKey === "work.tasks.owner.employee") {
        const matchesKeyword = !keyword || keyword === "E99" || keyword === "员工 99";
        return {
          items: matchesKeyword && (userId === 2 || requesterSeesOwner)
            ? [{ id: 99, name: "员工 99" }]
            : [],
        };
      }
      if (fkKey === "work.tasks.owner.position") {
        return { items: !keyword || keyword === "岗位 100" ? [{ id: 100, name: "敏感岗位" }] : [] };
      }
      return { items: [] };
    },
  },
} as never);

mock.module("./work-item-agent-space-access", {
  namedExports: {
    sharedAgentWorkSpace: async () => ({
      targetType: "department",
      targetId: 825,
      name: "运营部",
      actionPermissions: { canUpdate: true },
    }),
  },
} as never);

mock.module("./work-responsibility-references", {
  namedExports: {
    workResponsibilityReferenceSummarySelect: {},
    summarizeWorkResponsibilityReference: () => ({
      responsibilityNodeId: null,
      responsibilityPositionId: null,
      responsibilityPositionName: null,
    }),
  },
} as never);

const { searchWorkReferenceOptionsTool } = await import("./work-item-agent-read-tools");
const execution = { requester: { id: 1 }, actor: { id: 2 }, profile: null } as never;

test("reference search rejects an arbitrary owner ID excluded from the requester candidate list", async () => {
  requesterSeesOwner = false;
  searchedKeys.length = 0;
  searchedKeywords.length = 0;
  const result = await searchWorkReferenceOptionsTool.execute({
    fkKey: "work.tasks.owner.position",
    targetType: "department",
    targetId: 825,
    ownerEmployeeId: 99,
  }, execution);

  assert.equal(result.type, "error");
  assert.match(result.message, /上下文无效或无权访问/);
  assert.deepEqual(searchedKeys, ["work.tasks.owner.employee", "work.tasks.owner.employee"]);
  assert.deepEqual(searchedKeywords, ["E99", "E99"]);
});

test("reference search proceeds only after both identities share the owner context", async () => {
  requesterSeesOwner = true;
  searchedKeys.length = 0;
  searchedKeywords.length = 0;
  const result = await searchWorkReferenceOptionsTool.execute({
    fkKey: "work.tasks.owner.position",
    targetType: "department",
    targetId: 825,
    ownerEmployeeId: 99,
  }, execution);

  assert.equal(result.type, "data");
  assert.deepEqual(searchedKeys, [
    "work.tasks.owner.employee",
    "work.tasks.owner.employee",
    "work.tasks.owner.position",
    "work.tasks.owner.position",
  ]);
  assert.deepEqual(searchedKeywords, ["E99", "E99", "", ""]);
});
