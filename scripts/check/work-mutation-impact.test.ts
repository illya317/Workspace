import assert from "node:assert/strict";
import test from "node:test";

import type { Prisma } from "../../packages/platform/server/prisma";
import {
  buildWorkMutationImpactEngine,
  type WorkMutationImpactContext,
} from "../../packages/work/server/work-mutation-impact";

const item = (id: number, status: string | null = "active") => ({
  id,
  content: `工作项 ${id}`,
  updatedAt: new Date(Date.UTC(2026, 6, 17, 0, 0, id)),
  status,
  isArchived: false,
  planId: 9,
  parentWorkItemId: null,
});

test("WorkPlan archive exposes owned items as a server-confirmed cascade", async () => {
  const context = fakeContext(({ where }) => "planId" in where ? [item(1), item(2)] : []);
  const impact = await engine().plan({
    context,
    actorKey: "user:7",
    scopeKey: "personal:7",
    root: { entity: "WorkPlan", id: "9", label: "年度计划", intent: "archive", expectedVersion: "v1" },
  });

  assert.equal(impact.blockers.length, 0);
  assert.deepEqual(impact.confirmableEffects.map((group) => ({
    relationKey: group.relationKey,
    count: group.count,
    allowedResolutions: group.allowedResolutions,
  })), [{ relationKey: "work.plan.items", count: 2, allowedResolutions: ["cascade"] }]);
});

test("WorkPlan cascade recursively applies each WorkItem hierarchy policy", async () => {
  const context = fakeContext(({ where }) => {
    if ("planId" in where && "isArchived" in where) return [item(1), item(2)];
    if (where.parentWorkItemId === 1) return [item(2)];
    return [];
  });
  const impact = await engine().plan({
    context,
    actorKey: "user:7",
    scopeKey: "personal:7",
    root: { entity: "WorkPlan", id: "9", label: "年度计划", intent: "archive", expectedVersion: "v1" },
  });

  assert.deepEqual(impact.blockers.map((group) => group.relationKey), ["work.tasks.item.parent"]);
});

test("WorkPlan completion reports unfinished items as blockers", async () => {
  const context = fakeContext(() => [item(3)]);
  const impact = await engine().plan({
    context,
    actorKey: "user:7",
    scopeKey: "personal:7",
    root: { entity: "WorkPlan", id: "9", label: "年度计划", intent: "transition", expectedVersion: "v1" },
  });

  assert.deepEqual(impact.blockers.map((group) => [group.relationKey, group.count]), [
    ["work.plan.incomplete-items", 1],
  ]);
  assert.deepEqual(impact.allowedResolutions, ["return"]);
});

test("WorkItem completion reports unfinished children and KR evidence separately", async () => {
  const context = fakeContext(({ where }) => (
    "parentWorkItemId" in where ? [item(4)] : "taskEvidenceForKrs" in where ? [item(5)] : []
  ));
  const impact = await engine().plan({
    context,
    actorKey: "user:7",
    scopeKey: "personal:7",
    root: { entity: "WorkItem", id: "8", label: "目标", intent: "transition", expectedVersion: "v1" },
  });

  assert.deepEqual(impact.blockers.map((group) => [group.relationKey, group.count]), [
    ["work.item.incomplete-children", 1],
    ["work.item.incomplete-evidence", 1],
  ]);
});

test("WorkItem archive reports every hierarchy and KR evidence blocker through the shared engine", async () => {
  const context = fakeContext(({ where }) => (
    "parentWorkItemId" in where ? [item(11)]
      : "parentPeriodWorkItemId" in where ? [item(12)]
        : "previousPeriodWorkItemId" in where ? [item(13)]
          : []
  ), () => [{ id: 21 }]);
  const impact = await engine().plan({
    context,
    actorKey: "user:7",
    scopeKey: "personal:7",
    root: { entity: "WorkItem", id: "8", label: "目标", intent: "archive", expectedVersion: "v1" },
  });

  assert.deepEqual(impact.blockers.map((group) => group.relationKey).sort(), [
    "work.tasks.item.parent",
    "work.tasks.kr-evidence.kr",
    "work.tasks.kr-evidence.task",
    "work.tasks.parent.item",
    "work.tasks.previous.item",
  ]);
});

test("WorkPlan restore blocks when an item from the archive batch no longer exists", async () => {
  const context = fakeContext(() => []);
  context.archiveSource = { batchId: "archive-1", itemRevisions: new Map([[23, "revision-23"]]) };
  const impact = await engine().plan({
    context,
    actorKey: "user:7",
    scopeKey: "personal:7",
    root: { entity: "WorkPlan", id: "9", label: "年度计划", intent: "restore", expectedVersion: "v1" },
  });

  assert.deepEqual(impact.blockers.map((group) => [group.relationKey, group.samples[0]?.label]), [
    ["work.plan.restore-stale-items", "已删除工作项 #23"],
  ]);
});

test("Project delete separates owned technical rows from blocking Work references", async () => {
  const context = fakeContext(({ where }) => "linkedProjectId" in where ? [item(6)] : []);
  (context.tx.projectEnablingDepartment.findMany as unknown as (
    input: { where: Record<string, unknown> },
  ) => Promise<Array<{ id: number }>>) = async () => [{ id: 31 }];
  const impact = await engine().plan({
    context,
    actorKey: "user:7",
    scopeKey: "project:12",
    root: { entity: "Project", id: "12", label: "治理项目", intent: "delete", expectedVersion: 4 },
  });

  assert.deepEqual(impact.blockers.map((group) => group.relationKey), ["work.tasks.linked.project"]);
  assert.deepEqual(impact.informationalEffects.map((group) => [group.relationKey, group.policy, group.count]), [
    ["work.project.owned-children", "auto_cascade_owned", 1],
  ]);
});

test("WorkItem delete exposes a KPI assignment as a business blocker", async () => {
  const context = fakeContext(() => []);
  const assignmentStore = context.tx.workKpiAssignment as unknown as {
    findUnique: () => Promise<{ id: number; version: number; workItem: { content: string } } | null>;
  };
  assignmentStore.findUnique = async () => ({
    id: 41,
    version: 2,
    workItem: { content: "KPI 工作项" },
  });
  const impact = await engine().plan({
    context,
    actorKey: "user:7",
    scopeKey: "personal:7",
    root: { entity: "WorkItem", id: "8", label: "目标", intent: "delete", expectedVersion: "v1" },
  });

  assert.deepEqual(impact.blockers.map((group) => group.relationKey), ["work.tasks.kpi-assignment.item"]);
});

test("WorkPlan delete confirms owned KPI assignments and blocks their result snapshots", async () => {
  const context = fakeContext(() => []);
  const assignmentStore = context.tx.workKpiAssignment as unknown as {
    findMany: (input: { where: Record<string, unknown> }) => Promise<Array<{
      id: number; version: number; workItem: { content: string };
    }>>;
  };
  assignmentStore.findMany = async (input) => (
    "sourceAssignmentId" in input.where
      ? []
      : "workPlanId" in input.where
        ? [{ id: 42, version: 3, workItem: { content: "销售达成" } }]
        : []
  );
  const resultStore = context.tx.workKpiResultSnapshot as unknown as {
    findMany: () => Promise<Array<{ id: number; version: number }>>;
  };
  resultStore.findMany = async () => [{ id: 51, version: 1 }];
  const impact = await engine().plan({
    context,
    actorKey: "user:7",
    scopeKey: "personal:7",
    root: { entity: "WorkPlan", id: "9", label: "年度计划", intent: "delete", expectedVersion: "v1" },
  });

  assert.deepEqual(impact.confirmableEffects.map((group) => group.relationKey), ["work.plan.kpi-assignments"]);
  assert.deepEqual(impact.blockers.map((group) => group.relationKey), ["work.kpi.assignment.results"]);
});

function engine() {
  return buildWorkMutationImpactEngine({ secret: "work-impact-test-secret" });
}

function fakeContext(
  findItems: (input: { where: Record<string, unknown> }) => ReturnType<typeof item>[],
  findEvidence: (input: { where: Record<string, unknown> }) => Array<{ id: number }> = () => [],
): WorkMutationImpactContext {
  return {
    actorUserId: 7,
    scopeType: "personal",
    scopeId: "7",
    tx: {
      projectNotificationRule: { findFirst: async () => null },
      projectNotificationEvaluation: { findFirst: async () => null },
      projectNotificationSignal: { findFirst: async () => null },
      $queryRaw: async () => [],
      relationPolicyConfig: { findMany: async () => [] },
      workItem: { findMany: async (input: { where: Record<string, unknown> }) => findItems(input) },
      workKrEvidence: { findMany: async (input: { where: Record<string, unknown> }) => findEvidence(input) },
      workPlan: { findMany: async () => [] },
      workKpiAssignment: { findMany: async () => [], findUnique: async () => null },
      workKpiResultSnapshot: { findMany: async () => [] },
      meetingActionCandidate: { findMany: async () => [] },
      workPlanAlignment: { findMany: async () => [] },
      workParticipant: { findMany: async () => [] },
      workResponsibilityReference: { findMany: async () => [] },
      workReportItem: { findMany: async () => [] },
      workPlanGovernanceEvent: { findMany: async () => [] },
      employeeProject: { findMany: async () => [] },
      projectMembershipChange: { findMany: async () => [] },
      projectEnablingDepartment: { findMany: async () => [] },
      projectPlanPhase: { findMany: async () => [] },
      projectPlanDependency: { findMany: async () => [] },
      projectPlanBaseline: { findMany: async () => [] },
      projectWorkAssignee: { findMany: async () => [] },
    } as unknown as Prisma.TransactionClient,
  };
}
