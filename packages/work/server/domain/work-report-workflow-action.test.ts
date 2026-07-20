import assert from "node:assert/strict";
import test from "node:test";
import { resolveActionRuntime } from "@workspace/platform/workflow-action-runtime";
import { resolveWorkReportWorkflowActionKind } from "./work-report-workflow-action";

test("report submit and correction resolve distinct workflow actions", () => {
  assert.equal(resolveWorkReportWorkflowActionKind("kr", "submit"), "objective_submit");
  assert.equal(resolveWorkReportWorkflowActionKind("final", "submit"), "report_submit");
  assert.equal(resolveWorkReportWorkflowActionKind("kr", "correct"), "objective_revise");
  assert.equal(resolveWorkReportWorkflowActionKind("final", "correct"), "report_correct");
});

test("submit-only permission edits workflow reports but never grants direct write", () => {
  const actor = { userId: 7, canDirectWrite: false, canStartWorkflow: true };
  const workflow = resolveActionRuntime({
    businessActionKey: "work.tasks.goal.department.report.submit",
    workflowPolicyMode: "optional",
    workflowWhenDisabled: "direct_write",
    actor,
  });
  const direct = resolveActionRuntime({
    businessActionKey: "work.tasks.goal.department.report.submit",
    workflowPolicyMode: "permission_only",
    workflowWhenDisabled: "direct_write",
    actor,
  });

  assert.equal(workflow.executionMode, "workflow");
  assert.equal(workflow.editability, "editable");
  assert.equal(workflow.capabilities.workflowRequest.submit.allowed, true);
  assert.equal(workflow.capabilities.record.save.allowed, false);
  assert.equal(direct.executionMode, "direct");
  assert.equal(direct.editability, "readonly");
  assert.equal(direct.capabilities.record.save.allowed, false);
});
