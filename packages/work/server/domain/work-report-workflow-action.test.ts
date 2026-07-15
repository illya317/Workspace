import assert from "node:assert/strict";
import test from "node:test";
import { resolveWorkReportWorkflowActionKind } from "./work-report-workflow-action";

test("report submit and correction resolve distinct workflow actions", () => {
  assert.equal(resolveWorkReportWorkflowActionKind("kr", "submit"), "objective_submit");
  assert.equal(resolveWorkReportWorkflowActionKind("final", "submit"), "report_submit");
  assert.equal(resolveWorkReportWorkflowActionKind("kr", "correct"), "objective_revise");
  assert.equal(resolveWorkReportWorkflowActionKind("final", "correct"), "report_correct");
});
