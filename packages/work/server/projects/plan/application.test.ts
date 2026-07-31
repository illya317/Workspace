import assert from "node:assert/strict";
import test, { mock } from "node:test";

const accessCalls = { create: 0, delete: 0 };
const createInputs: Record<string, unknown>[] = [];

mock.module("../../access", {
  namedExports: {
    canCreateProjectAction: async () => {
      accessCalls.create += 1;
      return true;
    },
    canDeleteProjectSubresourceAction: async () => {
      accessCalls.delete += 1;
      return false;
    },
    canUpdateProjectAction: async () => true,
    canViewProject: async () => true,
    getProjectPermissionsById: async () => ({ canView: true }),
  },
} as never);

mock.module("./domain/project-plan-validation", {
  namedExports: {
    isValidProjectPlanDateValue: () => true,
    normalizeProjectPlanText: (value: unknown) => String(value ?? "").trim(),
    validateProjectPlanCommand: (action: string) => ({ ok: true, data: action }),
  },
} as never);

mock.module("../../project-normalization", {
  namedExports: {
    formatDate: (value: Date | null) => value?.toISOString().slice(0, 10) ?? null,
    parseDate: (value: string | null) => value ? new Date(`${value}T00:00:00.000Z`) : null,
  },
} as never);

mock.module("@workspace/platform/server/api", {
  namedExports: {
    serviceError: (error: string, status = 400) => ({ ok: false, error, status }),
    serviceOk: (data: unknown) => ({ ok: true, data }),
  },
} as never);
mock.module("@workspace/platform/server/delete-guard", { namedExports: { guardedDelete: async () => ({ ok: true }) } } as never);
mock.module("@workspace/platform/server/history", {
  namedExports: {
    ensureEditHistoryBaseline: async () => undefined,
    snapshotHistory: async () => undefined,
  },
} as never);
mock.module("@workspace/platform/completion-date-policy", { namedExports: { validateCompletionSchedule: () => null } } as never);
mock.module("@workspace/platform/server/business-date", { namedExports: { workspaceBusinessDate: () => "2026-07-30" } } as never);
mock.module("../../project-access-temporal", { namedExports: { projectMemberHasActiveEmploymentOnDate: () => true } } as never);
mock.module("../../project-notification-signals", {
  namedExports: {
    bestEffortDrainProjectNotificationSignals: async () => undefined,
    enqueueProjectNotificationSignal: async () => undefined,
    PROJECT_NOTIFICATION_SIGNAL_PROJECT_SELECT: {},
  },
} as never);

mock.module("@workspace/platform/server/prisma", {
  namedExports: {
    Prisma: { sql: () => ({}) },
    prisma: {
      projectPlanPhase: {
        create: async (input: Record<string, unknown>) => {
          createInputs.push(input);
          return {
            id: 31,
            version: 1,
            projectId: 7,
            sequenceNo: 1,
            name: "设计",
            plannedStartDate: null,
            plannedEndDate: null,
            note: null,
          };
        },
        findFirst: async () => null,
        findMany: async () => [],
      },
    },
  },
} as never);

const { createProjectPlanPhase } = await import("./application");

test("创建项目阶段只使用项目创建权限，并返回已创建阶段", async () => {
  accessCalls.create = 0;
  accessCalls.delete = 0;
  createInputs.length = 0;

  const result = await createProjectPlanPhase({
    userId: 9,
    projectId: 7,
    body: { name: "  设计  " },
  });

  assert.equal(result.ok, true);
  assert.equal(accessCalls.create, 1);
  assert.equal(accessCalls.delete, 0);
  assert.deepEqual(createInputs, [{
    data: {
      projectId: 7,
      name: "设计",
      sequenceNo: 1,
      createdBy: 9,
      editedBy: 9,
    },
  }]);
  if (result.ok) assert.equal(result.data.phase.name, "设计");
});
