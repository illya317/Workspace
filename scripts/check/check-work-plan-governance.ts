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
      "parseBoundWorkOkrControl",
      "不能读取当前全局日期规则补齐",
      "if (stored) return serviceOk(stored);",
    ],
    excludes: ["stored && plan.targetType !== \"personal\""],
  },
  {
    file: "packages/work/server/domain/work-okr-bound-control.ts",
    includes: ["isBoundWorkOkrTimeControlEnabled", "objective_submit"],
  },
  {
    file: "packages/work/server/domain/work-plan-maintenance-policy.ts",
    includes: ["validateWorkPlanReopenTransition", "timeControlEnabled"],
  },
  {
    file: "packages/work/server/work-okr-stage.ts",
    includes: ["timeControlEnabled: isBoundWorkOkrTimeControlEnabled(plan.governanceSnapshotJson)"],
  },
  {
    file: "packages/work/server/work-plan-dto.ts",
    includes: ["timeControlEnabled: isBoundWorkOkrTimeControlEnabled(row.governanceSnapshotJson)"],
  },
  {
    file: "packages/work/server/work-plans.ts",
    includes: ["validateWorkPlanReopenTransition({"],
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
      "workPlanPreparedWorkflowBinding(existing, \"objective_submit\")",
      "workPlanPreparedWorkflowBinding(existing, \"report_submit\")",
    ],
  },
  {
    file: "packages/work/server/task-approval-adapter.ts",
    includes: [
      "workPlanPreparedWorkflowBinding(existing, \"objective_revise\")",
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
      "不能按当前全局设置推断",
      "不能按当前全局设置补齐",
      "approvalPayloadReferencesWorkPlan",
      "\"workPlanId\"",
    ],
    excludes: ["const current = await resolveWorkflowPolicy"],
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
