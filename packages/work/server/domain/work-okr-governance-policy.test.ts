import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveWorkOkrGovernancePolicy,
  workOkrRequestBindingPriority,
  type WorkOkrGovernancePolicyInput,
  type WorkOkrGovernanceRuntime,
} from "./work-okr-governance-policy";

test("active request binding outranks a newer editable draft", () => {
  assert.ok(workOkrRequestBindingPriority("committing") > workOkrRequestBindingPriority("submitted"));
  assert.ok(workOkrRequestBindingPriority("submitted") > workOkrRequestBindingPriority("draft"));
  assert.ok(workOkrRequestBindingPriority("draft") > workOkrRequestBindingPriority("rejected"));
  assert.ok(workOkrRequestBindingPriority("rejected") > workOkrRequestBindingPriority("withdrawn"));
});

function runtime(
  businessActionKey: string,
  executionMode: WorkOkrGovernanceRuntime["executionMode"],
  status: WorkOkrGovernanceRuntime["status"] = null,
  requestId: WorkOkrGovernanceRuntime["requestId"] = null,
  editability: WorkOkrGovernanceRuntime["editability"] = requestId !== null && (status === "submitted" || status === "committing") ? "readonly" : "editable",
): WorkOkrGovernanceRuntime {
  return {
    businessActionKey,
    executionMode,
    editability,
    status,
    requestId,
  };
}

function input(
  overrides: Partial<WorkOkrGovernancePolicyInput> = {},
): WorkOkrGovernancePolicyInput {
  return {
    canUpdate: true,
    isArchived: false,
    lifecycleStatus: "active",
    targetConfirmed: false,
    resultConfirmed: false,
    actionRuntimes: {
      objectiveSubmit: runtime("objective.submit", "direct"),
      objectiveRevise: runtime("objective.revise", "direct"),
      reportSubmit: runtime("report.submit", "direct"),
      reportCorrect: runtime("report.correct", "direct"),
    },
    ...overrides,
  };
}

test("selects initial submission actions before facts are confirmed", () => {
  const policy = resolveWorkOkrGovernancePolicy(input());

  assert.equal(policy.facets.target.action?.kind, "objective_submit");
  assert.equal(policy.facets.result.action?.kind, "report_submit");
});

test("selects revision actions from confirmed target and result facts", () => {
  const policy = resolveWorkOkrGovernancePolicy(input({
    targetConfirmed: true,
    resultConfirmed: true,
  }));

  assert.equal(policy.facets.target.action?.kind, "objective_revise");
  assert.equal(policy.facets.result.action?.kind, "report_correct");
});

test("direct mode stays freely editable when windows are closed and lifecycle is done", () => {
  const policy = resolveWorkOkrGovernancePolicy(input({
    lifecycleStatus: "done",
    submissionWindows: { targetOpen: false, resultOpen: false },
  }));

  assert.equal(policy.mode, "free_edit");
  assert.deepEqual(policy.badges, [{ key: "free_edit", label: "流程关闭" }]);
  assert.equal(policy.facets.target.editable, true);
  assert.equal(policy.facets.execution.editable, true);
  assert.equal(policy.facets.result.editable, true);
  assert.deepEqual(policy.facets.target.submissionWindow, { enforced: false, open: false });
  assert.deepEqual(policy.facets.result.submissionWindow, { enforced: false, open: false });
});

test("a submitted target request locks only the target facet", () => {
  const base = input();
  const policy = resolveWorkOkrGovernancePolicy(input({
    actionRuntimes: {
      ...base.actionRuntimes,
      objectiveSubmit: runtime("objective.submit", "workflow", "submitted", 41),
      reportSubmit: runtime("report.submit", "workflow"),
    },
  }));

  assert.equal(policy.facets.target.editable, false);
  assert.equal(policy.facets.target.lockReason, "request_in_flight");
  assert.equal(policy.facets.target.lockRequestId, 41);
  assert.equal(policy.facets.execution.editable, true);
  assert.equal(policy.facets.result.editable, true);
});

test("a committing result request locks only the result facet", () => {
  const base = input();
  const policy = resolveWorkOkrGovernancePolicy(input({
    actionRuntimes: {
      ...base.actionRuntimes,
      reportSubmit: runtime("report.submit", "workflow", "committing", 52),
    },
  }));

  assert.equal(policy.facets.target.editable, true);
  assert.equal(policy.facets.execution.editable, true);
  assert.equal(policy.facets.result.editable, false);
  assert.equal(policy.facets.result.lockReason, "request_in_flight");
  assert.equal(policy.facets.result.lockRequestId, 52);
});

test("workflow drafts, rejections, and withdrawals remain editable", () => {
  for (const status of ["draft", "rejected", "withdrawn"] as const) {
    const base = input();
    const policy = resolveWorkOkrGovernancePolicy(input({
      actionRuntimes: {
        ...base.actionRuntimes,
        objectiveSubmit: runtime("objective.submit", "workflow", status, 61),
      },
    }));

    assert.equal(policy.facets.target.editable, true, status);
    assert.equal(policy.facets.target.lockReason, null, status);
  }
});

test("workflow windows are surfaced for submission without locking field editing", () => {
  const base = input();
  const policy = resolveWorkOkrGovernancePolicy(input({
    actionRuntimes: {
      ...base.actionRuntimes,
      objectiveSubmit: runtime("objective.submit", "workflow"),
    },
    submissionWindows: { targetOpen: false, resultOpen: true },
  }));

  assert.equal(policy.facets.target.editable, true);
  assert.deepEqual(policy.facets.target.submissionWindow, { enforced: true, open: false });
});

test("mixed target and result workflow modes stay independently editable", () => {
  const base = input();
  const policy = resolveWorkOkrGovernancePolicy(input({
    actionRuntimes: {
      ...base.actionRuntimes,
      objectiveSubmit: runtime("objective.submit", "workflow"),
    },
  }));

  assert.equal(policy.mode, "workflow");
  assert.deepEqual(policy.badges, [{ key: "workflow", label: "目标：流程 · 结果：自由编辑" }]);
  assert.equal(policy.facets.target.editable, true);
  assert.equal(policy.facets.result.editable, true);
});

test("workflow submit permission does not require direct update permission", () => {
  const base = input();
  const policy = resolveWorkOkrGovernancePolicy(input({
    canUpdate: false,
    actionRuntimes: {
      ...base.actionRuntimes,
      objectiveSubmit: runtime("objective.submit", "workflow"),
      reportSubmit: runtime("report.submit", "workflow"),
    },
  }));

  assert.equal(policy.facets.target.editable, true);
  assert.equal(policy.facets.execution.lockReason, "permission_required");
  assert.equal(policy.facets.result.editable, true);
});

test("only the selected action request can lock its facet", () => {
  const base = input();
  const policy = resolveWorkOkrGovernancePolicy(input({
    targetConfirmed: false,
    actionRuntimes: {
      ...base.actionRuntimes,
      objectiveSubmit: runtime("objective.submit", "workflow"),
      objectiveRevise: runtime("objective.revise", "workflow", "submitted", 70),
    },
  }));

  assert.equal(policy.facets.target.action?.kind, "objective_submit");
  assert.equal(policy.facets.target.editable, true);
});

test("permissions and archival state lock all facets while done alone does not", () => {
  const base = input();
  const readonly = resolveWorkOkrGovernancePolicy(input({
    canUpdate: false,
    lifecycleStatus: "done",
    actionRuntimes: {
      objectiveSubmit: runtime("objective.submit", "direct", null, null, "readonly"),
      objectiveRevise: runtime("objective.revise", "direct", null, null, "readonly"),
      reportSubmit: runtime("report.submit", "direct", null, null, "readonly"),
      reportCorrect: runtime("report.correct", "direct", null, null, "readonly"),
    },
  }));
  assert.equal(readonly.facets.target.lockReason, "permission_required");
  assert.equal(readonly.facets.execution.lockReason, "permission_required");
  assert.equal(readonly.facets.result.lockReason, "permission_required");

  const archived = resolveWorkOkrGovernancePolicy(input({
    actionRuntimes: base.actionRuntimes,
    isArchived: true,
    lifecycleStatus: "done",
  }));
  assert.deepEqual(archived.badges, [{ key: "archived", label: "已归档" }]);
  assert.equal(archived.facets.target.lockReason, "archived");
  assert.equal(archived.facets.execution.lockReason, "archived");
  assert.equal(archived.facets.result.lockReason, "archived");
});
