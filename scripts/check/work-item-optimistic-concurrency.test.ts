import assert from "node:assert/strict";
import test, { mock } from "node:test";

class KnownRequestError extends Error {
  code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

const revision = new Date("2026-07-21T02:03:04.005Z");
const concurrentRevision = new Date("2026-07-21T02:03:05.005Z");
let injectConcurrentWrite = false;
let stored = workItem("人工原值", revision);

const workItemStore = {
  findUnique: async () => ({ ...stored }),
  findUniqueOrThrow: async () => ({ ...stored }),
  update: async (input: { where: { id: number; updatedAt?: Date }; data: { content?: string } }) => {
    if (injectConcurrentWrite) {
      injectConcurrentWrite = false;
      stored = workItem("并发人工修改", concurrentRevision);
    }
    if (input.where.updatedAt && input.where.updatedAt.getTime() !== stored.updatedAt.getTime()) {
      throw new KnownRequestError("P2025");
    }
    stored = {
      ...stored,
      ...(input.data.content !== undefined && { content: input.data.content }),
      updatedAt: new Date(stored.updatedAt.getTime() + 1),
    };
    return { ...stored };
  },
};

const planStore = {
  findUnique: async () => ({
    targetType: "personal",
    targetId: 7,
    kind: "okr",
    collaborationId: null,
    status: "active",
    isArchived: false,
  }),
};

const prisma = { workItem: workItemStore, workPlan: planStore };
const transaction = { workItem: workItemStore, workPlan: planStore, workKrEvidence: {} };

mock.module("server-only", { namedExports: {} } as never);
mock.module("@workspace/platform/server/prisma", {
  namedExports: {
    Prisma: { PrismaClientKnownRequestError: KnownRequestError },
    prisma,
  },
} as never);
mock.module("@workspace/platform/server/serializable-transaction", {
  namedExports: { runSerializableTransaction: async (operation: (tx: unknown) => unknown) => operation(transaction) },
} as never);
mock.module("../../packages/work/server/domain/work-item-relation-validation", {
  namedExports: { validateWorkItemRelations: async () => null },
} as never);
mock.module("../../packages/work/server/work-period-relations", {
  namedExports: { validateWorkItemPeriodRelations: async () => null },
} as never);
mock.module("../../packages/work/server/work-okr-stage", {
  namedExports: { assertWorkItemStageAllowed: async () => ({ ok: true, data: {} }) },
} as never);
mock.module("../../packages/work/server/work-item-mutation-guard", {
  namedExports: { assertWorkItemMutationCommitAllowed: async () => ({ ok: true, data: {} }) },
} as never);
mock.module("../../packages/work/server/domain/work-completion-policy", {
  namedExports: {
    WorkCompletionPolicyError: class WorkCompletionPolicyError extends Error {},
    validateWorkItemCompletion: async () => null,
    validateWorkItemParentStateInvariant: async () => null,
  },
} as never);
mock.module("../../packages/work/server/work-kr-evidence", {
  namedExports: {
    WorkKrEvidenceValidationError: class WorkKrEvidenceValidationError extends Error {},
    normalizeEvidenceTaskIds: () => undefined,
    replaceKrEvidenceTasks: async () => null,
  },
} as never);
mock.module("../../packages/work/server/work-item-dto", {
  namedExports: { toWorkItemDto: (value: unknown) => value, workItemInclude: {} },
} as never);
mock.module("../../packages/work/server/work-responsibility-references", {
  namedExports: { replaceWorkResponsibilityReference: async () => undefined },
} as never);
mock.module("../../packages/work/server/work-item-service-helpers", {
  namedExports: {
    buildStatusPatch: () => ({}),
    validateWorkItemPeriodPatch: () => null,
    validateWorkItemResponsibility: async () => null,
  },
} as never);
mock.module("../../packages/work/server/work-item-archive", {
  namedExports: {
    archiveWorkItem: async () => ({ ok: true, data: {} }),
    deleteWorkItemRecord: async () => ({ ok: true, data: {} }),
    restoreArchivedWorkItem: async () => ({ ok: true, data: {} }),
  },
} as never);
mock.module("../../packages/work/server/work-mutation-impact", {
  namedExports: {
    buildAuditedWorkMutationImpactEngine: () => { throw new Error("impact engine is not expected"); },
    mutationImpactServiceError: () => null,
    workItemMutationRoot: () => ({}),
  },
} as never);
mock.module("../../packages/work/server/domain/work-plan-item-state", {
  namedExports: {
    closeOkrPlanIfAllItemsComplete: async () => false,
    shouldRecalculateOkrPlanCompletion: () => false,
  },
} as never);

async function updateWorkItem(
  workId: number,
  input: Parameters<typeof import("../../packages/work/server/works")["updateWorkItem"]>[1],
) {
  const works = await import("../../packages/work/server/works");
  return works.updateWorkItem(workId, input);
}

test("Work item optimistic update rejects a version already stale at validation time", async () => {
  stored = workItem("并发人工修改", concurrentRevision);
  const result = await updateWorkItem(17, updateInput(revision));

  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.equal(stored.content, "并发人工修改");
});

test("Work item optimistic update rejects a race at the final Prisma write without overwriting it", async () => {
  stored = workItem("人工原值", revision);
  injectConcurrentWrite = true;
  const result = await updateWorkItem(17, updateInput(revision));

  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.equal(stored.content, "并发人工修改");
});

test("Work item update keeps the human route behavior when no version is supplied", async () => {
  stored = workItem("人工原值", revision);
  injectConcurrentWrite = true;
  const result = await updateWorkItem(17, {
    content: "人工保存结果",
    actorUserId: 7,
    mutationAuthorization: "direct",
  });

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(stored.content, "人工保存结果");
});

test("Work item ordinary updates reject archived records at the domain boundary", async () => {
  stored = { ...workItem("归档内容", revision), isArchived: true };

  const result = await updateWorkItem(17, {
    content: "绕过页面提交的修改",
    actorUserId: 7,
    mutationAuthorization: "direct",
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.equal(stored.content, "归档内容");
});

test("Work item archived records still allow the explicit restore lifecycle", async () => {
  stored = { ...workItem("归档内容", revision), isArchived: true };

  const result = await updateWorkItem(17, {
    isArchived: false,
    actorUserId: 7,
    mutationAuthorization: "direct",
  });

  assert.equal(result.ok, true, JSON.stringify(result));
});

function updateInput(expectedUpdatedAt: Date) {
  return {
    content: "Agent 修改结果",
    actorUserId: 7,
    mutationAuthorization: "direct" as const,
    expectedUpdatedAt: expectedUpdatedAt.toISOString(),
  };
}

function workItem(content: string, updatedAt: Date) {
  return {
    id: 17,
    targetType: "personal",
    targetId: 7,
    planId: 4,
    category: "okr",
    itemType: "objective",
    routineTaskType: null,
    routineRecurrenceType: null,
    routineRecurrenceTime: null,
    routineRecurrenceWeekday: null,
    routineRecurrenceMonthDay: null,
    routineRecurrenceQuarterDay: null,
    routineRecurrenceYearMonth: null,
    routineRecurrenceYearDay: null,
    actualStartDate: null,
    actualEndDate: null,
    plannedStartDate: null,
    plannedEndDate: null,
    sourceType: "other",
    sourceKind: null,
    sourceMeetingId: null,
    sourceMeetingDecisionId: null,
    sourceMeetingActionCandidateId: null,
    sourceDepartmentId: null,
    linkedProjectId: null,
    linkedProjectPhaseId: null,
    parentWorkItemId: null,
    parentPeriodWorkItemId: null,
    previousPeriodWorkItemId: null,
    periodType: null,
    periodStart: null,
    periodEnd: null,
    ownerEmployeeId: null,
    collaborationId: null,
    status: "active",
    completedAt: null,
    content,
    isArchived: false,
    updatedAt,
    krCurrentValue: null,
    isMilestone: false,
    milestoneDate: null,
  };
}
