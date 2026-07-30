import assert from "node:assert/strict";
import test, { mock } from "node:test";

const updatedAt = new Date("2026-07-31T06:00:00.000Z");
const plan = {
  id: 41,
  targetType: "department",
  targetId: 7,
  kind: "okr",
  title: "目标计划",
  status: "active",
  isArchived: false,
  okrStage: "draft",
  objectiveApprovedAt: null,
  okrCycleId: 3,
  governanceRevision: 2,
};
const existingAssignment = {
  id: 101,
  workItemId: 201,
  version: 4,
  _count: { resultSnapshots: 0 },
  workItem: {
    id: 201,
    content: "收入增长率",
    updatedAt,
    status: "active",
    isArchived: false,
    planId: plan.id,
    parentWorkItemId: null,
  },
};

let blockWorkItemDeletion = false;
let pendingActions: string[] = [];
let committedActions: string[] = [];
let serializableTransactionCalls = 0;
const engineRoots: Array<{ entity: string; id: string }> = [];
const engineContexts: unknown[] = [];
const policyBlockError = new Error("工作项仍有受策略保护的关联数据");

const transactionClient = {
  workKpiAssignment: {
    findMany: async () => [existingAssignment],
    deleteMany: async () => {
      pendingActions.push("delete-assignment:101");
      return { count: 1 };
    },
  },
  workItem: {
    deleteMany: async () => {
      pendingActions.push("delete-work-item:201");
      return { count: 1 };
    },
  },
};

mock.module("@workspace/platform/server/api", {
  namedExports: {
    serviceError: (error: string, status = 400, details?: Record<string, unknown>) => ({
      ok: false,
      error,
      status,
      ...(details ? { details } : {}),
    }),
    serviceOk: <T>(data: T) => ({ ok: true, data }),
  },
} as never);
mock.module("@workspace/platform/server/serializable-transaction", {
  namedExports: {
    async runSerializableTransaction(callback: (tx: typeof transactionClient) => Promise<unknown>) {
      serializableTransactionCalls += 1;
      pendingActions = [];
      try {
        const result = await callback(transactionClient);
        committedActions = [...pendingActions];
        return result;
      } catch (error) {
        committedActions = [];
        throw error;
      }
    },
  },
} as never);
mock.module("@workspace/platform/server/prisma", {
  namedExports: {
    prisma: {
      workPlan: { findUnique: async () => plan },
      workKpiDefinition: { findMany: async () => [] },
      workKpiAssignment: { findMany: async () => [] },
    },
  },
} as never);
mock.module("./domain/work-kpi-scorecard-validation", {
  namedExports: {
    validateWorkKpiScorecardCommand: (input: { planId: number }) => ({
      ok: true,
      data: { planId: input.planId, entries: [], intent: "draft" },
    }),
  },
} as never);
mock.module("./domain/work-kpi-result-validation", {
  namedExports: { validateWorkKpiMeasurementsCommand: () => ({ ok: false }) },
} as never);
mock.module("./access", {
  namedExports: {
    canUpdateWorkTaskAction: async () => true,
    canViewWorkTaskTarget: async () => true,
  },
} as never);
mock.module("./work-owner-eligibility", {
  namedExports: { validateWorkOwnerAssignment: async () => null },
} as never);
mock.module("./work-kpi-scoring", {
  namedExports: { parseWorkKpiScoringRuleJson: () => ({ ok: true, data: {} }) },
} as never);
mock.module("./work-kpi-dto", {
  namedExports: {
    toWorkKpiAssignmentDto: (value: unknown) => value,
    workKpiAssignmentInclude: {},
  },
} as never);
mock.module("./work-okr-stage", {
  namedExports: {
    approveObjectiveReview: async () => ({ ok: true }),
    recordDirectObjectiveConfirmation: async () => ({ ok: true }),
  },
} as never);
mock.module("./work-plan-governance", {
  namedExports: {
    getWorkPlanOkrGovernance: async () => ({
      governance: { facets: { target: { editable: true } } },
    }),
  },
} as never);
mock.module("./work-mutation-impact", {
  namedExports: {
    buildAuditedWorkMutationImpactEngine: (context: unknown) => {
      engineContexts.push(context);
      return {
        async execute(request: {
          context: unknown;
          root: { entity: string; id: string };
          commitRoot: (context: unknown) => Promise<unknown>;
        }) {
          engineRoots.push({ entity: request.root.entity, id: request.root.id });
          if (blockWorkItemDeletion && request.root.entity === "WorkItem") {
            throw policyBlockError;
          }
          return request.commitRoot(request.context);
        },
      };
    },
    mutationImpactServiceError: (error: unknown) => error === policyBlockError
      ? {
          ok: false,
          error: policyBlockError.message,
          status: 409,
          details: { code: "MUTATION_IMPACT_REQUIRED", policy: "block" },
        }
      : null,
    workItemMutationRoot: (input: { item: { id: number }; intent: string }) => ({
      entity: "WorkItem",
      id: String(input.item.id),
      label: "KPI 工作项",
      intent: input.intent,
    }),
  },
} as never);

const { saveKpiScorecardDraft } = await import("./work-kpi-scorecard");

function resetState() {
  blockWorkItemDeletion = false;
  pendingActions = [];
  committedActions = [];
  serializableTransactionCalls = 0;
  engineRoots.length = 0;
  engineContexts.length = 0;
}

test("scorecard removal runs assignment and WorkItem impact roots in one serializable transaction", async () => {
  resetState();

  const result = await saveKpiScorecardDraft({
    actorUserId: 9,
    planId: plan.id,
    entries: [],
  });

  assert.equal(result.ok, true);
  assert.equal(serializableTransactionCalls, 1);
  assert.deepEqual(engineRoots, [
    { entity: "WorkKpiAssignment", id: "101" },
    { entity: "WorkItem", id: "201" },
  ]);
  assert.equal(engineContexts.length, 1);
  assert.equal((engineContexts[0] as { tx: unknown }).tx, transactionClient);
  assert.deepEqual(committedActions, ["delete-assignment:101", "delete-work-item:201"]);
});

test("a Settings block policy aborts the atomic removal and is returned as 409", async () => {
  resetState();
  blockWorkItemDeletion = true;

  const result = await saveKpiScorecardDraft({
    actorUserId: 9,
    planId: plan.id,
    entries: [],
  });

  assert.equal(serializableTransactionCalls, 1);
  assert.deepEqual(result, {
    ok: false,
    error: policyBlockError.message,
    status: 409,
    details: { code: "MUTATION_IMPACT_REQUIRED", policy: "block" },
  });
  assert.deepEqual(engineRoots, [
    { entity: "WorkKpiAssignment", id: "101" },
    { entity: "WorkItem", id: "201" },
  ]);
  assert.deepEqual(committedActions, []);
});
