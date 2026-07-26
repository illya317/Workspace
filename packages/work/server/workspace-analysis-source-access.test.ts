import assert from "node:assert/strict";
import test, { mock } from "node:test";

import type { WorkspaceAnalysisSourceDefinition } from "@workspace/platform/workspace-analysis-source-contract";

mock.module("server-only", { namedExports: {} } as never);

const calls: string[] = [];
let allowed = true;
let gatewayAllowed = true;
mock.module("@workspace/platform/server/auth", {
  namedExports: {
    canEnterResource: async () => { calls.push("gateway-entry"); return gatewayAllowed; },
    evaluatePermissionAction: async () => { calls.push("gateway-read"); return gatewayAllowed; },
  },
} as never);
mock.module("./access", {
  namedExports: {
    canUseProject: async () => { calls.push("projects"); return allowed; },
    canViewProject: async () => { calls.push("project-members"); return allowed; },
    canViewWorkTaskTarget: async () => { calls.push("tasks"); return allowed; },
  },
} as never);
mock.module("./meeting-access", {
  namedExports: {
    canUseMeetings: async () => { calls.push("meetings"); return allowed; },
  },
} as never);

const {
  buildWorkWorkspaceAnalysisSourceCatalog,
  canDiscoverWorkWorkspaceAnalysisSource,
} = await import("./workspace-analysis-source-access");

test("Work discovery delegates to the same business object visibility modules", async () => {
  const catalog = buildWorkWorkspaceAnalysisSourceCatalog();
  calls.length = 0;
  allowed = true;
  gatewayAllowed = true;

  assert.equal(await discover(catalog.get("work.items", 1)!, "department", 12), true);
  assert.equal(await discover(catalog.get("work.item-evidence", 1)!, "department", 12), true);
  assert.equal(await discover(catalog.get("work.item-participants", 1)!, "department", 12), true);
  assert.equal(await discover(catalog.get("work.plans", 1)!, "personal", 7), true);
  assert.equal(await discover(catalog.get("work.plan-approval-snapshot-values", 1)!, "personal", 7), true);
  assert.equal(await discover(catalog.get("work.department-collaborations", 1)!, "department", 12), true);
  assert.equal(await discover(catalog.get("work.department-collaboration-enabling-departments", 1)!, "department", 12), true);
  assert.equal(await discover(catalog.get("work.department-collaboration-responsible-positions", 1)!, "department", 12), true);
  assert.equal(await discover(catalog.get("work.department-collaboration-executor-positions", 1)!, "department", 12), true);
  assert.equal(await discover(catalog.get("work.department-collaboration-plans", 1)!, "department", 12), true);
  assert.equal(await discover(catalog.get("work.department-collaboration-items", 1)!, "department", 12), true);
  assert.equal(await discover(catalog.get("work.kpi-definitions", 1)!, "project", 21), true);
  assert.equal(await discover(catalog.get("work.kpi-definition-scoring-rule-values", 1)!, "personal", 7), true);
  assert.equal(await discover(catalog.get("work.reports", 1)!, "department", 12), true);
  assert.equal(await discover(catalog.get("work.report-items", 1)!, "project", 21), true);
  assert.equal(await discover(catalog.get("work.projects", 1)!, "department", 12), true);
  assert.equal(await discover(catalog.get("work.project-enabling-departments", 1)!, "project", 21), true);
  assert.equal(await discover(catalog.get("work.project-members", 1)!, "project", 21), true);
  assert.equal(await discover(catalog.get("work.meetings", 1)!, "personal", 7), true);
  assert.equal(await discover(catalog.get("work.meeting-participants", 1)!, "department", 12), true);
  assert.deepEqual(calls, [
    "tasks",
    "tasks",
    "tasks",
    "tasks",
    "tasks",
    "tasks",
    "tasks",
    "tasks",
    "tasks",
    "tasks",
    "tasks",
    "tasks",
    "tasks",
    "projects",
    "projects",
    "project-members",
    "gateway-read",
    "meetings",
    "gateway-read",
    "meetings",
  ]);
});

test("viewer and parameter-bound Work sources delegate object filtering to their original services", async () => {
  const catalog = buildWorkWorkspaceAnalysisSourceCatalog();
  calls.length = 0;
  allowed = false;
  gatewayAllowed = false;

  assert.equal(await discover(catalog.get("work.reports", 1)!, "department", 999), true);
  assert.equal(await discover(catalog.get("work.report-items", 1)!, "project", 999), true);
  assert.equal(await discover(catalog.get("work.assigned-plan-groups", 1)!, "department", 999), true);
  assert.equal(await discover(catalog.get("work.assigned-items", 1)!, "project", 999), true);
  for (const sourceKey of [
    "work.project-plan-phases",
    "work.project-plan-baselines",
    "work.project-plan-gantt-items",
    "work.project-plan-gantt-owners",
    "work.project-plan-dependencies",
    "work.project-plan-baseline-items",
    "work.kpi-scorecard-plans",
    "work.kpi-scorecard-assignments",
    "work.kpi-scorecard-definitions",
    "work.kpi-scorecard-source-assignments",
    "work.kpi-scorecard-definition-snapshot-values",
    "work.kpi-scorecard-scoring-rule-values",
    "work.kpi-scorecard-definition-scoring-rule-values",
    "work.kpi-scorecard-evidence-tasks",
    "work.kpi-scorecard-latest-results",
    "work.kpi-result-summaries",
    "work.kpi-result-previews",
    "work.kpi-result-work-reports",
    "work.kpi-result-definition-snapshot-values",
    "work.kpi-result-assignment-snapshot-values",
    "work.kpi-result-scoring-rule-values",
    "work.kpi-result-evidence-values",
  ]) {
    assert.equal(await discover(catalog.get(sourceKey, 1)!, "department", 999), true, sourceKey);
  }
  assert.deepEqual(calls, []);

  allowed = true;
  gatewayAllowed = true;
});

test("supplementary Work sources preserve their original viewer and target access seams", async () => {
  const catalog = buildWorkWorkspaceAnalysisSourceCatalog();
  calls.length = 0;
  allowed = true;
  gatewayAllowed = true;

  assert.equal(await discover(catalog.get("work.project-gantt-projects", 1)!, "personal", 7), true);
  assert.equal(await discover(catalog.get("work.project-gantt-leaders", 1)!, "department", 12), true);
  assert.equal(await discover(catalog.get("work.period-collection-cycles", 1)!, "department", 12), true);
  assert.equal(await discover(catalog.get("work.period-collection-plans", 1)!, "department", 12), true);
  assert.equal(await discover(catalog.get("work.period-collection-items", 1)!, "project", 21), true);
  assert.equal(await discover(catalog.get("work.period-collection-overlaps", 1)!, "personal", 7), true);
  assert.deepEqual(calls, ["projects", "projects", "tasks", "tasks", "tasks", "tasks"]);
});

test("Work discovery rejects unsupported scope, foreign owners and denied business access", async () => {
  const catalog = buildWorkWorkspaceAnalysisSourceCatalog();
  calls.length = 0;
  allowed = false;

  assert.equal(await discover(catalog.get("work.project-members", 1)!, "department", 12), false);
  assert.equal(await discover(catalog.get("work.department-collaborations", 1)!, "personal", 7), false);
  assert.equal(await discover(catalog.get("work.items", 1)!, "department", 12), false);
  const foreign = {
    ...catalog.get("work.items", 1)!,
    ownerModuleKey: "finance",
  } satisfies WorkspaceAnalysisSourceDefinition;
  assert.equal(await discover(foreign, "department", 12), false);
  assert.deepEqual(calls, ["tasks"]);
  allowed = true;
});

test("Work meeting discovery preserves its inherited gateway read action", async () => {
  const catalog = buildWorkWorkspaceAnalysisSourceCatalog();
  calls.length = 0;
  gatewayAllowed = false;

  const sourceKeys = [
    "work.meetings",
    "work.meeting-participants",
    "work.meeting-details",
    "work.meeting-detail-participants",
    "work.meeting-agenda-items",
    "work.meeting-minute-entries",
    "work.meeting-proposals",
    "work.meeting-proposal-votes",
    "work.meeting-decisions",
    "work.meeting-action-candidates",
  ];
  for (const sourceKey of sourceKeys) {
    assert.equal(await discover(catalog.get(sourceKey, 1)!, "personal", 7), false);
  }
  assert.deepEqual(calls, sourceKeys.map(() => "gateway-read"));
  gatewayAllowed = true;
});

function discover(
  source: WorkspaceAnalysisSourceDefinition,
  targetType: "personal" | "department" | "project",
  targetId: number,
) {
  return canDiscoverWorkWorkspaceAnalysisSource({
    requesterId: 7,
    targetType,
    targetId,
    source,
  });
}
