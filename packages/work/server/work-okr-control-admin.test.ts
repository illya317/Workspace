import assert from "node:assert/strict";
import test, { mock } from "node:test";

let canConfigureCycleFlow = false;
let transactionCalls = 0;
const permissionChecks: Array<{ userId: number; resourceKey: string; actionKey: string }> = [];

const transactionClient = {
  systemConfig: { upsert: async () => ({}) },
  workOkrControlRevision: {
    findFirst: async () => null,
    create: async () => ({}),
  },
};

mock.module("@workspace/platform/action-contract-registry", {
  namedExports: { getActionContractMetadata: () => null },
} as never);
mock.module("@workspace/platform/server/api", {
  namedExports: {
    serviceError: (error: string, status: number) => ({ ok: false, error, status }),
    serviceOk: <T>(data: T) => ({ ok: true, data }),
  },
} as never);
mock.module("@workspace/platform/server/rbac/action-grants", {
  namedExports: {
    evaluatePermissionAction: async (userId: number, resourceKey: string, actionKey: string) => {
      permissionChecks.push({ userId, resourceKey, actionKey });
      return canConfigureCycleFlow;
    },
  },
} as never);
mock.module("@workspace/platform/server/prisma", {
  namedExports: {
    Prisma: {},
    prisma: {
      $transaction: async (callback: (tx: typeof transactionClient) => unknown) => {
        transactionCalls += 1;
        return callback(transactionClient);
      },
    },
  },
} as never);
mock.module("@workspace/platform/server/workflows", {
  namedExports: { resolveWorkflowPolicy: async () => ({ mode: "direct" }) },
} as never);
mock.module("./domain/work-okr-control-validation", {
  namedExports: { validateWorkOkrControlCommand: (action: string) => ({ ok: true, data: action }) },
} as never);
mock.module("./task-approval-helpers", {
  namedExports: {
    workOkrBusinessActionLabel: () => "",
    workOkrWorkflowBusinessActionKey: () => "",
  },
} as never);
mock.module("./work-okr-control-config", {
  namedExports: {
    getWorkOkrControlSettingsState: async () => ({ settings: {}, version: 1 }),
    normalizeWorkOkrControlSettings: (value: unknown) => value,
    WORK_OKR_CONTROL_SETTINGS_KEY: "work.okr.control.settings",
  },
} as never);
mock.module("./work-okr-cycles", {
  namedExports: { listWorkOkrCycleOptions: async () => [] },
} as never);

const { updateWorkOkrControlSettings, upsertWorkOkrControlPolicy } = await import("./work-okr-control-admin");

test("users without the cycle-flow configure capability cannot mutate global Work settings", async () => {
  canConfigureCycleFlow = false;
  transactionCalls = 0;
  permissionChecks.length = 0;

  const settingsResult = await updateWorkOkrControlSettings({ settings: {}, actorUserId: 7 });
  const policyResult = await upsertWorkOkrControlPolicy({ cycleId: 1, actorUserId: 7 });

  assert.deepEqual(settingsResult, { ok: false, error: "无权限管理周期与流程", status: 403 });
  assert.deepEqual(policyResult, { ok: false, error: "无权限管理周期与流程", status: 403 });
  assert.equal(transactionCalls, 0);
  assert.deepEqual(permissionChecks, [
    { userId: 7, resourceKey: "work.tasks.cycleFlow", actionKey: "configure" },
    { userId: 7, resourceKey: "work.tasks.cycleFlow", actionKey: "configure" },
  ]);
});

test("cycle-flow configure grantees can persist global Work settings", async () => {
  canConfigureCycleFlow = true;
  transactionCalls = 0;
  permissionChecks.length = 0;

  const result = await updateWorkOkrControlSettings({ settings: {}, actorUserId: 1 });

  assert.equal(result.ok, true);
  assert.equal(transactionCalls, 1);
  assert.deepEqual(permissionChecks, [{ userId: 1, resourceKey: "work.tasks.cycleFlow", actionKey: "configure" }]);
});
