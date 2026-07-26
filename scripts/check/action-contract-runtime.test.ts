import assert from "node:assert/strict";
import test from "node:test";

import { enforceWorkflowPolicyModeForRegistration } from "../../packages/platform/server/workflow-contract-defaults";
import { listWorkflowBusinessActions } from "../../packages/platform/server/workflow-action-settings";
import {
  resolveActionRuntime,
  type ActionRuntimeAction,
  type ActionRuntimeRequestSnapshot,
} from "../../packages/platform/workflow-action-runtime";
import {
  actionRuntimeCommands,
  actionRuntimeCreateSubmission,
} from "../../packages/platform/ui/workflow/action-runtime-commands";

const request = (overrides: Partial<ActionRuntimeRequestSnapshot>): ActionRuntimeRequestSnapshot => ({
  id: 1,
  status: "draft",
  submitterUserId: 10,
  handlerCanRevise: false,
  requestCanWithdraw: true,
  requestCanResubmit: true,
  requestCanCancel: true,
  requestCanRevise: true,
  ...overrides,
});

const runtime = (input: {
  mode?: "permission_only" | "required";
  whenDisabled?: "direct_write" | "unavailable";
  actorUserId?: number;
  canDirectWrite?: boolean;
  canStartWorkflow?: boolean;
  canProcessWorkflow?: boolean;
  request?: ActionRuntimeRequestSnapshot | null;
}) => resolveActionRuntime({
  businessActionKey: "test.record.save",
  workflowPolicyMode: input.mode ?? "required",
  workflowWhenDisabled: input.whenDisabled ?? "direct_write",
  actor: {
    userId: input.actorUserId ?? 10,
    canDirectWrite: input.canDirectWrite,
    canStartWorkflow: input.canStartWorkflow,
    canProcessWorkflow: input.canProcessWorkflow,
  },
  request: input.request,
});

test("workflow policy mode honors whether an ActionContract can be disabled", () => {
  const actions = listWorkflowBusinessActions();
  const cannotDisable = actions.find((action) => {
    const workflow = action.actionContract?.workflow;
    return workflow?.kind !== "not_applicable" && workflow?.canDisable === false;
  });
  const canDisable = actions.find((action) => {
    const workflow = action.actionContract?.workflow;
    return workflow?.kind !== "not_applicable" && workflow?.canDisable === true;
  });

  assert.ok(cannotDisable, "fixture requires a non-disableable workflow ActionContract");
  assert.ok(canDisable, "fixture requires a disableable workflow ActionContract");
  assert.equal(enforceWorkflowPolicyModeForRegistration(cannotDisable, "permission_only", "required"), "required");
  assert.equal(enforceWorkflowPolicyModeForRegistration(cannotDisable, "direct", "required"), "required");
  assert.equal(enforceWorkflowPolicyModeForRegistration(canDisable, "permission_only", "required"), "permission_only");
});

test("action runtime maps workflow policy, actor, and request state to user capabilities", async (t) => {
  const cases: Array<{
    label: string;
    actual: ReturnType<typeof runtime>;
    expected: {
      availability: "available" | "unavailable";
      executionMode: "direct" | "workflow" | null;
      persistenceMode: "active" | "workflowDraft";
      role: "none" | "submitter" | "processor" | "observer";
      editability: "editable" | "readonly";
      actions: ActionRuntimeAction[];
    };
  }> = [
    {
      label: "direct record write",
      actual: runtime({ mode: "permission_only", canDirectWrite: true }),
      expected: {
        availability: "available",
        executionMode: "direct",
        persistenceMode: "active",
        role: "none",
        editability: "editable",
        actions: ["record.save", "form.cancel"],
      },
    },
    {
      label: "workflow entry",
      actual: runtime({ canStartWorkflow: true }),
      expected: {
        availability: "available",
        executionMode: "workflow",
        persistenceMode: "workflowDraft",
        role: "submitter",
        editability: "editable",
        actions: ["workflow.request.submit", "form.cancel"],
      },
    },
    {
      label: "disabled explicit workflow entry",
      actual: runtime({
        mode: "permission_only",
        whenDisabled: "unavailable",
        canDirectWrite: true,
        canStartWorkflow: true,
      }),
      expected: {
        availability: "unavailable",
        executionMode: null,
        persistenceMode: "workflowDraft",
        role: "none",
        editability: "readonly",
        actions: [],
      },
    },
    {
      label: "submitted owner can withdraw without record permission",
      actual: runtime({
        mode: "permission_only",
        request: request({ status: "submitted", requestCanWithdraw: true }),
      }),
      expected: {
        availability: "available",
        executionMode: "workflow",
        persistenceMode: "workflowDraft",
        role: "submitter",
        editability: "readonly",
        actions: ["workflow.request.withdraw"],
      },
    },
    {
      label: "withdraw and revise are independent",
      actual: runtime({
        request: request({ status: "withdrawn", requestCanWithdraw: false, requestCanRevise: true }),
      }),
      expected: {
        availability: "available",
        executionMode: "workflow",
        persistenceMode: "workflowDraft",
        role: "submitter",
        editability: "editable",
        actions: ["workflow.request.revise", "workflow.request.resubmit"],
      },
    },
    {
      label: "revise does not imply resubmit",
      actual: runtime({
        request: request({ status: "rejected", requestCanRevise: true, requestCanResubmit: false }),
      }),
      expected: {
        availability: "available",
        executionMode: "workflow",
        persistenceMode: "workflowDraft",
        role: "submitter",
        editability: "editable",
        actions: ["workflow.request.revise"],
      },
    },
    {
      label: "processor actions",
      actual: runtime({
        actorUserId: 20,
        canProcessWorkflow: true,
        request: request({ status: "submitted", handlerCanRevise: false }),
      }),
      expected: {
        availability: "available",
        executionMode: "workflow",
        persistenceMode: "workflowDraft",
        role: "processor",
        editability: "readonly",
        actions: ["workflow.request.approve", "workflow.request.reject"],
      },
    },
    {
      label: "unrelated observer",
      actual: runtime({ actorUserId: 30, request: request({ status: "submitted" }) }),
      expected: {
        availability: "available",
        executionMode: "workflow",
        persistenceMode: "workflowDraft",
        role: "observer",
        editability: "readonly",
        actions: [],
      },
    },
  ];

  for (const item of cases) {
    await t.test(item.label, () => {
      assert.deepEqual({
        availability: item.actual.availability,
        executionMode: item.actual.executionMode,
        persistenceMode: item.actual.persistenceMode,
        role: item.actual.workflowRole,
        editability: item.actual.editability,
        actions: item.actual.actions,
      }, item.expected);
    });
  }
});

test("workflow request mutation capabilities stay independently policy-controlled", () => {
  const submittedNoWithdraw = runtime({
    request: request({ status: "submitted", requestCanWithdraw: false, requestCanRevise: true }),
  });
  assert.equal(submittedNoWithdraw.capabilities.workflowRequest.withdraw.reason, "policy_disabled");

  const rejectedNoResubmit = runtime({
    request: request({ status: "rejected", requestCanRevise: true, requestCanResubmit: false }),
  });
  assert.equal(rejectedNoResubmit.capabilities.workflowRequest.revise.allowed, true);
  assert.equal(rejectedNoResubmit.capabilities.workflowRequest.resubmit.reason, "policy_disabled");

  const withdrawnNoRevise = runtime({
    request: request({ status: "withdrawn", requestCanWithdraw: true, requestCanRevise: false }),
  });
  assert.equal(withdrawnNoRevise.capabilities.workflowRequest.revise.reason, "policy_disabled");
  assert.equal(withdrawnNoRevise.capabilities.workflowRequest.resubmit.allowed, true);
});

test("runtime actions map to semantic UI commands", () => {
  const handler = { onClick: () => undefined };
  const commandsFor = (resolved: ReturnType<typeof resolveActionRuntime>) => actionRuntimeCommands(resolved, {
    "record.save": handler,
    "form.cancel": handler,
    "workflow.request.submit": handler,
    "workflow.request.approve": handler,
    "workflow.request.reject": handler,
  });
  const direct = commandsFor(resolveActionRuntime({
    businessActionKey: "test.record.save",
    workflowPolicyMode: "permission_only",
    workflowWhenDisabled: "direct_write",
    actor: { userId: 1, canDirectWrite: true },
  }));
  const workflow = commandsFor(resolveActionRuntime({
    businessActionKey: "test.record.save",
    workflowPolicyMode: "required",
    workflowWhenDisabled: "direct_write",
    actor: { userId: 1, canStartWorkflow: true },
  }));
  const processor = commandsFor(resolveActionRuntime({
    businessActionKey: "test.record.save",
    workflowPolicyMode: "required",
    workflowWhenDisabled: "unavailable",
    actor: { userId: 2, canProcessWorkflow: true },
    request: request({ status: "submitted", submitterUserId: 1 }),
  }));

  assert.deepEqual(
    [direct, workflow, processor].map((commands) => commands.map((command) => command.kind)),
    [["save", "cancel"], ["submit", "cancel"], ["approve", "reject"]],
  );
  assert.equal(
    [...direct, ...workflow, ...processor].some((command) => "icon" in command || "variant" in command),
    false,
    "Core owns command icon and variant",
  );
});

test("CreateSurface submission follows the resolved runtime execution mode", () => {
  const execute = () => undefined;
  const direct = actionRuntimeCreateSubmission(resolveActionRuntime({
    businessActionKey: "test.record.create",
    workflowPolicyMode: "permission_only",
    workflowWhenDisabled: "direct_write",
    actor: { userId: 1, canDirectWrite: true },
  }), { execute });
  const workflow = actionRuntimeCreateSubmission(resolveActionRuntime({
    businessActionKey: "test.record.create",
    workflowPolicyMode: "required",
    workflowWhenDisabled: "direct_write",
    actor: { userId: 1, canStartWorkflow: true },
  }), { execute });
  const unavailable = actionRuntimeCreateSubmission(resolveActionRuntime({
    businessActionKey: "test.record.create",
    workflowPolicyMode: "required",
    workflowWhenDisabled: "direct_write",
    actor: { userId: 1 },
  }), { execute });

  assert.equal(direct?.action, "save");
  assert.equal(workflow?.action, "submit");
  assert.equal(unavailable, null);
});
