import assert from "node:assert/strict";
import test, { mock } from "node:test";

let proposalRecord: Record<string, unknown> | null = null;
let lastFindFirstWhere: Record<string, unknown> | null = null;
let allowExecution = false;
let lastFailureOutcomeUnknown: boolean | null = null;

mock.module("@workspace/platform/server/prisma", {
  namedExports: {
    prisma: {
      agentProposal: {
        findFirst: async (input: { where: Record<string, unknown> }) => {
          lastFindFirstWhere = input.where;
          return proposalRecord;
        },
        findUnique: async () => null,
        updateMany: async () => ({ count: 1 }),
      },
    },
  },
} as never);
mock.module("./capabilities", {
  namedExports: {
    resolveAgentToolAccess: async (execution: unknown) => ({
      execution,
      tools: allowExecution ? [{}] : [],
    }),
  },
} as never);
mock.module("./execution-context", {
  namedExports: {
    AgentExecutionError: class AgentExecutionError extends Error {
      constructor(message: string, readonly status = 400) {
        super(message);
      }
    },
    resolveStoredAgentExecutionContext: async (requester: unknown) => ({
      requester,
      actor: requester,
      profile: null,
    }),
  },
} as never);
mock.module("./proposal-execution-lease", {
  namedExports: {
    agentProposalFailureResult: (_error: unknown, outcomeUnknown: boolean) => {
      lastFailureOutcomeUnknown = outcomeUnknown;
      return { outcomeUnknown };
    },
    reconcileStaleAgentProposalExecutions: async () => ({ count: 0 }),
    serializeAgentProposalExecutionResult: (value: unknown) => JSON.stringify(value),
    STALE_PROPOSAL_EXECUTION_MESSAGE: "stale execution",
  },
} as never);

const {
  AgentProposalActionError,
  agentProposalActionErrorStatus,
  cancelProposal,
  confirmProposalAction,
} = await import("./proposals");

const requester = { id: 17, username: "requester" } as never;
const executors = {
  "hr.employee.update": {
    toolKey: "hr.employee.update",
    requiredPermissions: [],
    execute: async () => ({ ok: true }),
  },
};

function proposal(status: string) {
  return {
    id: 88,
    userId: 17,
    actorUserId: 17,
    agentProfileId: null,
    status,
    actionKey: "hr.employee.update",
    toolKey: "hr.employee.update",
    payloadJson: "{}",
    createdAt: new Date(),
  };
}

test("proposal ids are always looked up inside the requester ownership scope", async () => {
  proposalRecord = null;
  await assert.rejects(
    confirmProposalAction(88, requester, executors),
    (error: unknown) => error instanceof AgentProposalActionError
      && error.status === 404
      && error.message === "变更记录不存在",
  );
  assert.deepEqual(lastFindFirstWhere, { id: 88, userId: 17 });

  await assert.rejects(
    cancelProposal(88, requester),
    (error: unknown) => error instanceof AgentProposalActionError
      && error.status === 404
      && error.message === "变更记录不存在",
  );
  assert.deepEqual(lastFindFirstWhere, { id: 88, userId: 17 });
});

test("proposal lifecycle failures expose deliberate HTTP status classes", async () => {
  proposalRecord = proposal("confirmed");
  await assert.rejects(
    confirmProposalAction(88, requester, executors),
    (error: unknown) => agentProposalActionErrorStatus(error) === 409,
  );

  proposalRecord = proposal("expired");
  await assert.rejects(
    cancelProposal(88, requester),
    (error: unknown) => agentProposalActionErrorStatus(error) === 410,
  );

  proposalRecord = proposal("pending");
  allowExecution = false;
  await assert.rejects(
    confirmProposalAction(88, requester, executors),
    (error: unknown) => agentProposalActionErrorStatus(error) === 403,
  );
  assert.equal(agentProposalActionErrorStatus(new Error("executor failed")), 500);
});

test("explicit remote dispatch boundary distinguishes known preflight failures from uncertain remote failures", async () => {
  const actionKey = "source.submitRemoteEffect";
  proposalRecord = {
    ...proposal("pending"),
    actionKey,
    toolKey: actionKey,
  };
  allowExecution = true;
  lastFailureOutcomeUnknown = null;
  const preflightFailure = {
    [actionKey]: {
      toolKey: actionKey,
      requiredPermissions: [],
      failureMayHaveSideEffects: true,
      uncertainFailureBoundary: "external_dispatch" as const,
      execute: async () => {
        throw new Error("validation failed before dispatch");
      },
    },
  };

  await assert.rejects(
    confirmProposalAction(88, requester, preflightFailure),
    /validation failed before dispatch/,
  );
  assert.equal(lastFailureOutcomeUnknown, false);

  proposalRecord = {
    ...proposal("pending"),
    actionKey,
    toolKey: actionKey,
  };
  lastFailureOutcomeUnknown = null;
  const postDispatchFailure = {
    [actionKey]: {
      ...preflightFailure[actionKey],
      execute: async (
        _payload: Record<string, unknown>,
        _execution: unknown,
        control: { markExternalDispatchStarted(): void },
      ) => {
        control.markExternalDispatchStarted();
        throw new Error("connection lost after dispatch");
      },
    },
  };

  await assert.rejects(
    confirmProposalAction(88, requester, postDispatchFailure as never),
    /connection lost after dispatch/,
  );
  assert.equal(lastFailureOutcomeUnknown, true);
});
