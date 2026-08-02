import assert from "node:assert/strict";
import test, { mock } from "node:test";

type MockModule = (specifier: string, options: { namedExports: Record<string, unknown> }) => void;
const mockModule = (mock as unknown as { module: MockModule }).module.bind(mock);

let granted = false;
let naturalProfile: "read" | "allBusiness" | null = null;

mockModule("@workspace/platform/permission-resource-policy", {
  namedExports: {
    getSpaceChildResourceKeyForTargetType: (targetType: string) => `space.${targetType}.analytics`,
  },
});
mockModule("@workspace/platform/service-result", {
  namedExports: {
    serviceError: (error: string, status: number) => ({ ok: false, error, status }),
    serviceOk: <T>(data: T) => ({ ok: true, data }),
  },
});
mockModule("@workspace/platform/server/business-space-permissions", {
  namedExports: {
    businessSpaceScopeId: (targetType: string, targetId: number) => `${targetType}:${targetId}`,
    canManageScopedPermissionGrant: async () => false,
    getNaturalSpaceActionProfile: async () => naturalProfile,
    isDepartmentResponsiblePositionUser: async () => false,
  },
});
mockModule("@workspace/platform/server/auth", {
  namedExports: {
    evaluatePermissionAction: async () => granted,
  },
});
mockModule("@workspace/platform/server/prisma", {
  namedExports: { prisma: {} },
});
mockModule("./shipment-analytics", {
  namedExports: { getShipmentAnalytics: async () => ({}) },
});
mockModule("./shipment-department-scope", {
  namedExports: { resolveShipmentDepartmentScope: async () => ({}) },
});
mockModule("./shipments", {
  namedExports: { listShipments: async () => ({}) },
});

const { canReadOperationalAnalytics } = await import("./operational-analytics");

test("department natural read grants operational analytics read", async () => {
  granted = false;
  naturalProfile = "read";
  assert.equal(await canReadOperationalAnalytics(10, "department", 20), true);
});

test("project natural read grants operational analytics read", async () => {
  granted = false;
  naturalProfile = "read";
  assert.equal(await canReadOperationalAnalytics(10, "project", 30), true);
});

test("operational analytics still denies users without natural or scoped read", async () => {
  granted = false;
  naturalProfile = null;
  assert.equal(await canReadOperationalAnalytics(10, "department", 20), false);
});

test("explicit scoped read remains valid without natural access", async () => {
  granted = true;
  naturalProfile = null;
  assert.equal(await canReadOperationalAnalytics(10, "project", 30), true);
});
