import assert from "node:assert/strict";
import test, { mock } from "node:test";

const resourceRows = [
  { id: 1, key: "settings", parentId: null },
  { id: 2, key: "settings.account", parentId: 1 },
  { id: 3, key: "agent", parentId: null },
  { id: 5, key: "agent.assistant", parentId: null },
  { id: 6, key: "agent.source", parentId: null },
];

function globalDelegate(name: string) {
  return new Proxy({}, {
    get() {
      return async () => { throw new Error(`global prisma delegate used: ${name}`); };
    },
  });
}

const globalPrisma = {
  user: globalDelegate("user"),
  employee: globalDelegate("employee"),
  eDP: globalDelegate("eDP"),
  department: globalDelegate("department"),
  resource: globalDelegate("resource"),
  userResourceActionGrant: globalDelegate("userResourceActionGrant"),
  positionResourceActionGrant: globalDelegate("positionResourceActionGrant"),
  departmentResourceActionGrant: globalDelegate("departmentResourceActionGrant"),
};

const tx = {
  user: {
    findUnique: async () => ({ username: "grant-manager", canLogin: true }),
  },
  employee: {
    findFirst: async () => null,
  },
  eDP: {
    findMany: async () => [],
  },
  department: {
    findMany: async () => [],
  },
  resource: {
    findUnique: async ({ where }: { where: { key: string } }) => {
      const row = resourceRows.find((item) => item.key === where.key);
      return row ? { id: row.id } : null;
    },
    findMany: async (args: {
      where?: { id?: { in: number[] }; key?: { in: string[] } };
      select: Record<string, boolean>;
    }) => {
      const selected = args.where?.id?.in
        ? resourceRows.filter((row) => args.where?.id?.in.includes(row.id))
        : args.where?.key?.in
          ? resourceRows.filter((row) => args.where?.key?.in.includes(row.key))
          : resourceRows;
      return selected.map((row) => Object.fromEntries(
        Object.keys(args.select).map((key) => [key, row[key as keyof typeof row]]),
      ));
    },
  },
  userResourceActionGrant: {
    findMany: async () => [{ resourceId: 5 }],
    findFirst: async () => ({ id: 1 }),
  },
  positionResourceActionGrant: {
    findMany: async () => [],
    findFirst: async () => null,
  },
  departmentResourceActionGrant: {
    findMany: async () => [],
    findFirst: async () => null,
  },
};

mock.module("server-only", { exports: {} } as never);
mock.module("@workspace/platform/server/prisma", {
  exports: { Prisma: {}, prisma: globalPrisma },
} as never);

const { evaluatePermissionAction } = await import("./action-grants");
const { canManageResourceGrant, getManageableResourceKeys } = await import("./admin-scope");
const { authorizePermissionGrantRequest } = await import("./action-grant-request");

test("lock-time Agent authorization uses only the injected transaction client through the full RBAC chain", async () => {
  assert.equal(await evaluatePermissionAction(7, "agent.assistant", "read", { client: tx as never }), true);
  const manageable = await getManageableResourceKeys(7, tx as never);
  assert.equal(manageable.has("agent.assistant"), true);
  assert.equal(manageable.has("agent.source"), true);
  assert.equal(await canManageResourceGrant(7, "agent.source", "grant", tx as never), true);

  const authorization = await authorizePermissionGrantRequest({
    actorUserId: 7,
    subjectType: "user",
    subjectId: 9,
    resourceKey: "agent.source",
    actionKey: "read",
    value: true,
    isSystemAdmin: false,
  }, { client: tx as never });
  assert.equal(authorization.ok, true);
});
