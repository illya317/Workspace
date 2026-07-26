import assert from "node:assert/strict";
import test, { mock } from "node:test";

type ResourceRow = { id: number; key: string; parentId: number | null };

const resourceRows: ResourceRow[] = [
  { id: 1, key: "work", parentId: null },
  { id: 2, key: "work.projects", parentId: 1 },
  { id: 3, key: "work.projects.initiate", parentId: null },
  { id: 4, key: "hr", parentId: null },
  { id: 5, key: "hr.performance", parentId: 4 },
  { id: 6, key: "work.meetings", parentId: 1 },
  { id: 7, key: "work.meetings.viewAll", parentId: null },
  { id: 8, key: "work.tasks", parentId: 1 },
  { id: 9, key: "work.tasks.cycleFlow", parentId: null },
];

function makeClient(
  grants: Array<{ resourceId: number; actionKey: string }>,
  options: { rootAdmin?: boolean; implicitAdmin?: boolean } = {},
) {
  return {
    user: {
      findUnique: async () => ({ username: options.rootAdmin ? "admin" : "employee", canLogin: true }),
    },
    employee: {
      findFirst: async () => options.implicitAdmin ? { id: 1 } : null,
    },
    eDP: {
      findMany: async () => [],
    },
    department: {
      findMany: async () => [],
    },
    resource: {
      findUnique: async ({ where }: { where: { key: string } }) => {
        const row = resourceRows.find((resource) => resource.key === where.key);
        return row ? { id: row.id } : null;
      },
      findMany: async () => resourceRows.map(({ id, parentId }) => ({ id, parentId })),
    },
    userResourceActionGrant: {
      findFirst: async ({ where }: {
        where: { resourceId: { in: number[] }; actionKey: { in: string[] } };
      }) => grants.find((grant) => (
        where.resourceId.in.includes(grant.resourceId)
        && where.actionKey.in.includes(grant.actionKey)
      )) ?? null,
    },
    positionResourceActionGrant: {
      findFirst: async () => null,
    },
    departmentResourceActionGrant: {
      findFirst: async () => null,
    },
  };
}

const globalPrisma = makeClient([]);

mock.module("server-only", { namedExports: {} } as never);
mock.module("@workspace/platform/server/prisma", {
  namedExports: { Prisma: {}, prisma: globalPrisma },
} as never);

const { evaluatePermissionAction } = await import("./action-grants");

test("project initiation capability evaluates an explicit submit grant while the space root rejects submit", async () => {
  const client = makeClient([
    { resourceId: 2, actionKey: "entry" },
    { resourceId: 3, actionKey: "submit" },
  ]);
  assert.equal(await evaluatePermissionAction(7, "work.projects.initiate", "submit", { client: client as never }), true);
  assert.equal(await evaluatePermissionAction(7, "work.projects", "submit", { client: client as never }), false);
});

test("cycle-flow configuration requires owner entry and an explicit configure grant", async () => {
  const client = makeClient([
    { resourceId: 8, actionKey: "entry" },
    { resourceId: 9, actionKey: "configure" },
  ]);
  assert.equal(await evaluatePermissionAction(7, "work.tasks.cycleFlow", "configure", { client: client as never }), true);

  const missingOwnerEntry = makeClient([{ resourceId: 9, actionKey: "configure" }]);
  assert.equal(await evaluatePermissionAction(7, "work.tasks.cycleFlow", "configure", { client: missingOwnerEntry as never }), false);
});

test("exact action matching distinguishes a direct read grant from workflow actions that imply read", async () => {
  const client = makeClient([{ resourceId: 5, actionKey: "approve" }]);
  assert.equal(await evaluatePermissionAction(7, "hr.performance", "read", { client: client as never }), true);
  assert.equal(await evaluatePermissionAction(7, "hr.performance", "read", {
    client: client as never,
    grantMatch: { action: "exact" },
  }), false);
});

test("performance summary exact matching rejects parent read while preserving direct and admin access", async () => {
  const parentRead = makeClient([{ resourceId: 4, actionKey: "read" }]);
  assert.equal(await evaluatePermissionAction(7, "hr.performance", "read", { client: parentRead as never }), true);
  assert.equal(await evaluatePermissionAction(7, "hr.performance", "read", {
    client: parentRead as never,
    grantMatch: { action: "exact", resource: "exact" },
  }), false);

  const directRead = makeClient([{ resourceId: 5, actionKey: "read" }]);
  assert.equal(await evaluatePermissionAction(7, "hr.performance", "read", {
    client: directRead as never,
    grantMatch: { action: "exact", resource: "exact" },
  }), true);

  const rootAdmin = makeClient([], { rootAdmin: true });
  assert.equal(await evaluatePermissionAction(7, "hr.performance", "read", {
    client: rootAdmin as never,
    grantMatch: { action: "exact", resource: "exact" },
  }), true);

  const implicitAdmin = makeClient([], { implicitAdmin: true });
  assert.equal(await evaluatePermissionAction(7, "hr.performance", "read", {
    client: implicitAdmin as never,
    grantMatch: { action: "exact", resource: "exact" },
  }), true);
});

test("meeting full-list capability evaluates only with owner entry and an explicit read grant", async () => {
  const client = makeClient([
    { resourceId: 6, actionKey: "entry" },
    { resourceId: 7, actionKey: "read" },
  ]);
  assert.equal(await evaluatePermissionAction(7, "work.meetings.viewAll", "read", { client: client as never }), true);

  const effectiveOwnerEntry = makeClient([
    { resourceId: 6, actionKey: "read" },
    { resourceId: 7, actionKey: "read" },
  ]);
  assert.equal(await evaluatePermissionAction(7, "work.meetings.viewAll", "read", {
    client: effectiveOwnerEntry as never,
    grantMatch: { action: "exact", resource: "exact" },
  }), true);

  const missingOwnerEntry = makeClient([{ resourceId: 7, actionKey: "read" }]);
  assert.equal(await evaluatePermissionAction(7, "work.meetings.viewAll", "read", { client: missingOwnerEntry as never }), false);
});
