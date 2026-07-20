#!/usr/bin/env tsx

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");

type Check = {
  file: string;
  includes?: string[];
  excludes?: string[];
};

const checks: Check[] = [
  {
    file: "prisma/models/works.prisma",
    includes: [
      "governanceMode",
      "governanceRevision",
      "governanceSnapshotJson",
      "governanceEvents",
    ],
  },
  {
    file: "prisma/models/work-okr.prisma",
    includes: [
      "model WorkOkrControlRevision",
      "model WorkOkrControlPolicyRevision",
      "model WorkPlanGovernanceEvent",
    ],
  },
  {
    file: "prisma/models/approvals.prisma",
    includes: [
      "sourceWorkflowPolicyId",
      "sourceWorkflowPolicyVersion",
      "sourceActionContractVersion",
      "sourceOkrControlVersion",
    ],
  },
  {
    file: "packages/work/server/work-okr-control-admin.ts",
    includes: [
      "workOkrControlRevision.create",
      "workOkrControlPolicyRevision.create",
      "listWorkOkrWorkflowActions",
    ],
    excludes: ["workOkrControlPolicy.deleteMany"],
  },
  {
    file: "packages/work/server/work-okr-control.ts",
    includes: [
      "resolveEffectiveWorkOkrControl",
      "resolveWorkflowPolicy({",
      "目标申报尚未开放",
      "结果申报尚未开放",
      "if (stored) return serviceOk(stored);",
    ],
    excludes: [
      "stored && plan.targetType !== \"personal\"",
      "当前 OKR 周期已锁定",
      "getWorkOkrCyclePlanningWindow",
    ],
  },
  {
    file: "packages/work/server/domain/work-okr-bound-control.ts",
    includes: ["isBoundWorkOkrTimeControlEnabled", "objective_submit"],
  },
  {
    file: "packages/work/server/domain/work-plan-maintenance-policy.ts",
    includes: ["validateWorkPlanReopenTransition"],
    excludes: ["timeControlEnabled", "input.status === \"done\"", "input.stage === \"closed\""],
  },
  {
    file: "packages/work/server/work-plans.ts",
    includes: ["validateWorkPlanReopenTransition({", "directTargetRevision:"],
    excludes: ["resolveReopenedWorkPlanLifecycle"],
  },
  {
    file: "packages/work/server/work-plan-route-command.ts",
    excludes: [
      "isOnlyKrReviewOpenDatePatch",
      "adjustWorkPlanKrReviewOpensAt",
    ],
  },
  {
    file: "app/api/modules/work/tasks/plans/[id]/route.ts",
    excludes: ["krReviewOpensAt:"],
  },
  {
    file: "packages/work/ui/works/api.ts",
    excludes: ["updateWorkPlanKrReviewOpenDate"],
  },
  {
    file: "packages/work/server/task-approval-okr.ts",
    includes: [
      "const actionKind = targetFacet.action?.kind",
      "const actionKind = resultFacet.action?.kind",
      "workPlanPreparedWorkflowBinding(existing, actionKind)",
    ],
    excludes: ["governance.governance.mode !== \"free_edit\""],
  },
  {
    file: "packages/work/server/task-approval-adapter.ts",
    includes: [
      "const actionKind = targetFacet.action?.kind",
      "workPlanPreparedWorkflowBinding(existing, actionKind)",
      "validateReportApprovalPayload(reportPayload, { actionKind })",
    ],
  },
  {
    file: "packages/work/server/task-approval-reports.ts",
    includes: [
      "workPlanPreparedWorkflowBinding(boundPlan, actionKind)",
      "kind: actionKind",
    ],
  },
  {
    file: "packages/platform/server/approvals/workflow.ts",
    includes: [
      "workflowPolicyFromPreparedSnapshot",
      "sourceWorkflowPolicyId",
      "sourceActionContractVersion",
      "sourceOkrControlVersion",
    ],
  },
  {
    file: "packages/platform/ui/admin/tabs/WorkflowPoliciesTab.tsx",
    excludes: ["accessMode === \"workflow\" ? workflowNodes : []"],
  },
  {
    file: "prisma/migrations/20260715062000_workflow_okr_governance/migration.sql",
    includes: [
      "CREATE TABLE \"WorkPlanGovernanceEvent\"",
      "CREATE TABLE \"WorkOkrControlRevision\"",
      "legacy_inferred",
      "sourceWorkflowPolicyVersion",
      "'workflowWhenDisabled', 'unavailable'",
      "'workflowWhenDisabled', 'direct_write'",
      "CREATE FUNCTION \"_workspace_workflow_okr_try_jsonb\"",
      "'workflowNodes', COALESCE(",
      "DROP FUNCTION \"_workspace_workflow_okr_try_jsonb\"",
    ],
    excludes: [
      "\"value\"::jsonb FROM \"SystemConfig\"",
      "\"workflowNodesJson\"::jsonb",
    ],
  },
  {
    file: "packages/work/server/work-plan-governance.ts",
    includes: [
      "resolveBusinessActionRuntime",
      "resolveWorkflowPolicy({",
      "resolveWorkOkrGovernancePolicy",
      "approvalPayloadReferencesWorkPlan",
      "\"workPlanId\"",
    ],
  },
  {
    file: "packages/work/server/work-okr-stage.ts",
    includes: ["objectiveApprovedAt: new Date()", "krApprovedAt: new Date()"],
    excludes: [
      "data: { okrStage: \"objective_submitted\"",
      "data: { okrStage: \"kr_submitted\"",
      "okrStage: \"closed\"",
      "status: \"done\"",
      "syncDueKrReview",
      "当前阶段为",
      "目标审查后计划头已锁定",
    ],
  },
  {
    file: "packages/work/server/work-plan-system-periods.ts",
    excludes: ["getWorkOkrCyclePlanningWindow"],
  },
  {
    file: "packages/work/ui/works/WorkReportPeriods.ts",
    excludes: ["isLocked", "autoLock", "objectiveSubmitDeadline", "krSubmitDeadline", "okrStage"],
  },
  {
    file: "packages/work/ui/works/WorkReportsPanel.tsx",
    excludes: ["canUpdate", "isLocked", "autoLock"],
  },
  {
    file: "packages/work/server/task-reports.ts",
    includes: ["canEdit: actionRuntime.data.editability === \"editable\""],
  },
  {
    file: "packages/work/ui/works/WorkKpiPanel.tsx",
    excludes: ["actionPermissions.canUpdate && plan?.governance?.facets"],
  },
  {
    file: "packages/work/ui/works/useOkrStageControls.ts",
    excludes: ["targetEditable && resultEditable"],
  },
  {
    file: "packages/work/ui/works/works-client-helpers.tsx",
    excludes: ["facets.target.editable && facets.result.editable"],
  },
  {
    file: "packages/work/ui/works/WorkOkrSettingsPanel.tsx",
    excludes: ["governanceMigration", "计划可编辑范围仍由计划阶段"],
  },
];

function source(file: string) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

function staticContractIssues() {
  const issues: string[] = [];
  for (const check of checks) {
    const text = source(check.file);
    for (const expected of check.includes ?? []) {
      if (!text.includes(expected)) issues.push(`${check.file}: missing ${expected}`);
    }
    for (const forbidden of check.excludes ?? []) {
      if (text.includes(forbidden)) issues.push(`${check.file}: forbidden ${forbidden}`);
    }
  }
  return issues;
}

function workPlanCreationIssues() {
  const root = path.join(ROOT, "packages/work/server");
  const issues: string[] = [];
  for (const entry of walk(root)) {
    const text = fs.readFileSync(entry, "utf8");
    if (!/workPlan\.create\s*\(/.test(text)) continue;
    if (text.includes("buildWorkPlanGovernanceBinding")) continue;
    issues.push(`${path.relative(ROOT, entry)}: WorkPlan create path must bind governance`);
  }
  return issues;
}

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.isFile() && /\.ts$/.test(entry.name) ? [full] : [];
  });
}

const issues = [...staticContractIssues(), ...workPlanCreationIssues()];
if (issues.length) {
  console.error(`✗ Work plan governance gate failed with ${issues.length} issue(s):`);
  for (const issue of issues) console.error(`  - ${issue}`);
  process.exit(1);
}

console.log("✓ Work plan governance gate passed: bound workflow/time rules, audit provenance, and non-destructive settings are enforced.");
