import assert from "node:assert/strict";
import test, { mock } from "node:test";

let proposalRecord: Record<string, unknown> | null = null;
let lastFindFirstWhere: Record<string, unknown> | null = null;
let allowExecution = false;
let lastFailureOutcomeUnknown: boolean | null = null;
let failFailureFinalization = false;
let settlementPersistenceError: Error | null = null;
let updateManyRace: { attemptedStatus: string; winnerStatus: string } | null = null;
let reconcileWinnerStatus: string | null = null;
let failNextFindFirst = false;
let executionContextHook: (() => Promise<void> | void) | null = null;
let executionContextError: Error | null = null;
let accessResolutionHook: (() => Promise<void> | void) | null = null;
let winnerAfterNextFindFirst: { status: string } | null = null;
let updateManyFailureWithWinner: { attemptedStatus: string; winnerStatus: string } | null = null;
let settlements: Array<{
  sessionId: string | null | undefined;
  input: Record<string, unknown>;
}> = [];

mock.module("@workspace/platform/server/prisma", {
  namedExports: {
    prisma: {
      agentProposal: {
        findFirst: async (input: { where: Record<string, unknown> }) => {
          lastFindFirstWhere = input.where;
          if (failNextFindFirst) {
            failNextFindFirst = false;
            throw new Error("authoritative proposal read unavailable");
          }
          const snapshot = proposalRecord ? { ...proposalRecord } : null;
          const winner = winnerAfterNextFindFirst;
          if (winner && proposalRecord) {
            winnerAfterNextFindFirst = null;
            proposalRecord = { ...proposalRecord, status: winner.status };
            settlements.push({
              sessionId: "sess_00000000000000000000000000000001",
              input: {
                role: "agent",
                content: "winner terminal settlement",
                responseType: "answer",
                proposalStatus: winner.status,
              },
            });
          }
          return snapshot;
        },
        findUnique: async () => null,
        updateMany: async (input: { data?: { status?: string } }) => {
          if (failFailureFinalization && input.data?.status === "failed") {
            throw new Error("audit database unavailable");
          }
          const failingRace = updateManyFailureWithWinner;
          if (failingRace && failingRace.attemptedStatus === input.data?.status) {
            updateManyFailureWithWinner = null;
            winnerAfterNextFindFirst = { status: failingRace.winnerStatus };
            throw new Error("proposal CAS interrupted before authoritative recovery");
          }
          const race = updateManyRace;
          if (race && race.attemptedStatus === input.data?.status) {
            const winnerStatus = race.winnerStatus;
            updateManyRace = null;
            if (proposalRecord) proposalRecord = { ...proposalRecord, status: winnerStatus };
            return { count: 0 };
          }
          if (proposalRecord && input.data?.status) {
            proposalRecord = { ...proposalRecord, status: input.data.status };
          }
          return { count: 1 };
        },
      },
    },
  },
} as never);
mock.module("./sessions", {
  namedExports: {
    appendAgentSessionMessageForUser: async (
      sessionId: string | null | undefined,
      input: Record<string, unknown>,
    ) => {
      if (settlementPersistenceError) throw settlementPersistenceError;
      settlements.push({ sessionId, input });
      return null;
    },
  },
} as never);
mock.module("./capabilities", {
  namedExports: {
    resolveAgentToolAccess: async (execution: unknown) => {
      await accessResolutionHook?.();
      return {
        execution,
        tools: allowExecution ? [{}] : [],
      };
    },
  },
} as never);
mock.module("./execution-context", {
  namedExports: {
    AgentExecutionError: class AgentExecutionError extends Error {
      constructor(message: string, readonly status = 400) {
        super(message);
      }
    },
    resolveStoredAgentExecutionContext: async (requester: unknown) => {
      await executionContextHook?.();
      if (executionContextError) throw executionContextError;
      return {
        requester,
        actor: requester,
        profile: null,
      };
    },
  },
} as never);
mock.module("./proposal-execution-lease", {
  namedExports: {
    agentProposalFailureResult: (_error: unknown, outcomeUnknown: boolean) => {
      lastFailureOutcomeUnknown = outcomeUnknown;
      return { outcomeUnknown };
    },
    reconcileStaleAgentProposalExecutions: async () => {
      if (reconcileWinnerStatus && proposalRecord) {
        proposalRecord = { ...proposalRecord, status: reconcileWinnerStatus };
        reconcileWinnerStatus = null;
      }
      return { count: 0 };
    },
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
    sessionId: "sess_00000000000000000000000000000001",
    targetType: "Employee",
    targetId: "12",
    diffJson: JSON.stringify({ name: "updated" }),
    createdAt: new Date(),
    confirmedAt: null,
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
  settlements = [];
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

test("repeat confirm and cancel attempts persist errors with the existing terminal state", async () => {
  settlements = [];
  proposalRecord = proposal("confirmed");
  await assert.rejects(confirmProposalAction(88, requester, executors), /无法重复确认/);
  assert.equal(settlements.at(-1)?.input.responseType, "error");
  assert.equal(settlements.at(-1)?.input.proposalStatus, "confirmed");
  assert.equal(settlements.at(-1)?.input.content, "变更已处理，无法重复确认");
  settlements = [];
  proposalRecord = proposal("cancelled");
  await assert.rejects(cancelProposal(88, requester), /只能取消待确认的变更/);
  assert.equal(settlements.at(-1)?.input.responseType, "error");
  assert.equal(settlements.at(-1)?.input.proposalStatus, "cancelled");
  assert.equal(settlements.at(-1)?.input.content, "只能取消待确认的变更");
});

test("confirm race loser refreshes the winner's terminal status before settlement", async () => {
  settlements = [];
  proposalRecord = proposal("pending");
  allowExecution = true;
  updateManyRace = { attemptedStatus: "executing", winnerStatus: "confirmed" };
  await assert.rejects(
    confirmProposalAction(88, requester, executors),
    (error: unknown) => agentProposalActionErrorStatus(error) === 409,
  );
  assert.deepEqual(lastFindFirstWhere, { id: 88, userId: 17 });
  assert.equal(settlements.at(-1)?.input.responseType, "error");
  assert.equal(settlements.at(-1)?.input.proposalStatus, "confirmed");
  assert.notEqual(settlements.at(-1)?.input.proposalStatus, "pending");
});

test("executing repeat confirm refreshes a worker that just reached terminal state", async () => {
  settlements = [];
  proposalRecord = proposal("executing");
  reconcileWinnerStatus = "confirmed";
  await assert.rejects(
    confirmProposalAction(88, requester, executors),
    (error: unknown) => agentProposalActionErrorStatus(error) === 409,
  );
  assert.deepEqual(lastFindFirstWhere, { id: 88, userId: 17 });
  assert.equal(settlements.at(-1)?.input.responseType, "error");
  assert.equal(settlements.at(-1)?.input.proposalStatus, "confirmed");
  assert.notEqual(settlements.at(-1)?.input.proposalStatus, "executing");
});

test("execution-context failure persists the status reached while authorization was waiting", async () => {
  settlements = [];
  proposalRecord = proposal("pending");
  executionContextHook = async () => {
    await Promise.resolve();
    if (proposalRecord) proposalRecord = { ...proposalRecord, status: "confirmed" };
  };
  executionContextError = new Error("actor binding changed during authorization");
  try {
    await assert.rejects(
      confirmProposalAction(88, requester, executors),
      /actor binding changed during authorization/,
    );
    assert.equal(settlements.at(-1)?.input.proposalStatus, "confirmed");
    assert.notEqual(settlements.at(-1)?.input.proposalStatus, "pending");
  } finally {
    executionContextHook = null;
    executionContextError = null;
  }
});

test("access denial persists the status reached while permission resolution was waiting", async () => {
  settlements = [];
  proposalRecord = proposal("pending");
  allowExecution = false;
  accessResolutionHook = async () => {
    await Promise.resolve();
    if (proposalRecord) proposalRecord = { ...proposalRecord, status: "confirmed" };
  };
  try {
    await assert.rejects(
      confirmProposalAction(88, requester, executors),
      (error: unknown) => agentProposalActionErrorStatus(error) === 403,
    );
    assert.equal(settlements.at(-1)?.input.proposalStatus, "confirmed");
    assert.notEqual(settlements.at(-1)?.input.proposalStatus, "pending");
  } finally {
    accessResolutionHook = null;
  }
});

test("failed authoritative read skips pre-claim settlement instead of appending stale pending", async (t) => {
  settlements = [];
  proposalRecord = proposal("pending");
  allowExecution = false;
  accessResolutionHook = async () => {
    if (proposalRecord) proposalRecord = { ...proposalRecord, status: "confirmed" };
    failNextFindFirst = true;
  };
  const consoleError = t.mock.method(console, "error", () => undefined);
  try {
    await assert.rejects(
      confirmProposalAction(88, requester, executors),
      (error: unknown) => agentProposalActionErrorStatus(error) === 403,
    );
    assert.equal(consoleError.mock.callCount(), 1);
    assert.equal(settlements.length, 0);
  } finally {
    accessResolutionHook = null;
    failNextFindFirst = false;
  }
});

test("confirm loser cannot append pending after winner commits between status read and append", async () => {
  settlements = [];
  proposalRecord = proposal("pending");
  allowExecution = false;
  accessResolutionHook = async () => {
    winnerAfterNextFindFirst = { status: "confirmed" };
  };
  try {
    await assert.rejects(
      confirmProposalAction(88, requester, executors),
      (error: unknown) => agentProposalActionErrorStatus(error) === 403,
    );
    assert.equal(settlements.length, 1);
    assert.equal(settlements.at(-1)?.input.proposalStatus, "confirmed");
    assert.notEqual(settlements.at(-1)?.input.proposalStatus, "pending");
    assert.notEqual(settlements.at(-1)?.input.proposalStatus, "executing");
  } finally {
    accessResolutionHook = null;
    winnerAfterNextFindFirst = null;
  }
});

test("cancel loser cannot append pending after winner commits between status read and append", async () => {
  settlements = [];
  proposalRecord = proposal("pending");
  updateManyFailureWithWinner = { attemptedStatus: "cancelled", winnerStatus: "cancelled" };
  try {
    await assert.rejects(cancelProposal(88, requester), /proposal CAS interrupted/);
    assert.equal(settlements.length, 1);
    assert.equal(settlements.at(-1)?.input.proposalStatus, "cancelled");
    assert.notEqual(settlements.at(-1)?.input.proposalStatus, "pending");
    assert.notEqual(settlements.at(-1)?.input.proposalStatus, "executing");
  } finally {
    updateManyFailureWithWinner = null;
    winnerAfterNextFindFirst = null;
  }
});

test("cancel race loser refreshes the winner's terminal status before settlement", async () => {
  settlements = [];
  proposalRecord = proposal("pending");
  updateManyRace = { attemptedStatus: "cancelled", winnerStatus: "cancelled" };
  await assert.rejects(
    cancelProposal(88, requester),
    (error: unknown) => agentProposalActionErrorStatus(error) === 409,
  );
  assert.deepEqual(lastFindFirstWhere, { id: 88, userId: 17 });
  assert.equal(settlements.at(-1)?.input.responseType, "error");
  assert.equal(settlements.at(-1)?.input.proposalStatus, "cancelled");
  assert.notEqual(settlements.at(-1)?.input.proposalStatus, "pending");
});

test("expiry race loser records the concurrent winner instead of a false expired state", async () => {
  settlements = [];
  proposalRecord = {
    ...proposal("pending"),
    createdAt: new Date(Date.now() - (31 * 60 * 1_000)),
  };
  updateManyRace = { attemptedStatus: "expired", winnerStatus: "confirmed" };
  await assert.rejects(
    confirmProposalAction(88, requester, executors),
    (error: unknown) => agentProposalActionErrorStatus(error) === 409,
  );
  assert.deepEqual(lastFindFirstWhere, { id: 88, userId: 17 });
  assert.equal(settlements.at(-1)?.input.proposalStatus, "confirmed");
  assert.notEqual(settlements.at(-1)?.input.proposalStatus, "expired");
});

test("confirm and cancel settlements persist status and mode-specific user messages", async () => {
  settlements = [];
  allowExecution = true;
  proposalRecord = proposal("pending");
  const direct = await confirmProposalAction(88, requester, {
    "hr.employee.update": {
      toolKey: "hr.employee.update",
      requiredPermissions: [],
      execute: async () => ({ executionMode: "direct", entity: { id: 12 } }),
    },
  });
  assert.equal(direct.message, "已保存");
  assert.equal(settlements.at(-1)?.sessionId, "sess_00000000000000000000000000000001");
  assert.deepEqual(settlements.at(-1)?.input, {
    role: "agent",
    content: "已保存",
    responseType: "answer",
    proposal: {
      id: 88,
      actionKey: "hr.employee.update",
      targetType: "Employee",
      targetId: "12",
      diff: { name: "updated" },
    },
    proposalStatus: "confirmed",
  });
  settlements = [];
  proposalRecord = proposal("pending");
  const workflow = await confirmProposalAction(88, requester, {
    "hr.employee.update": {
      toolKey: "hr.employee.update",
      requiredPermissions: [],
      execute: async () => ({ executionMode: "workflow", request: { id: 7 } }),
    },
  });
  assert.equal(workflow.message, "已提交审批");
  assert.equal(settlements.at(-1)?.input.content, "已提交审批");
  assert.equal(settlements.at(-1)?.input.proposalStatus, "confirmed");
  settlements = [];
  proposalRecord = proposal("pending");
  const cancelled = await cancelProposal(88, requester);
  assert.equal(cancelled.message, "变更已取消");
  assert.equal(settlements.at(-1)?.input.proposalStatus, "cancelled");
});

test("expired and failed proposals append terminal settlement feedback", async () => {
  settlements = [];
  proposalRecord = {
    ...proposal("pending"),
    createdAt: new Date(Date.now() - (31 * 60 * 1_000)),
  };
  await assert.rejects(cancelProposal(88, requester), /已过期/);
  assert.equal(settlements.at(-1)?.input.proposalStatus, "expired");
  assert.equal(settlements.at(-1)?.input.responseType, "error");
  settlements = [];
  proposalRecord = proposal("pending");
  allowExecution = true;
  await assert.rejects(confirmProposalAction(88, requester, {
    "hr.employee.update": {
      toolKey: "hr.employee.update",
      requiredPermissions: [],
      execute: async () => {
        throw new Error("manual validator rejected title");
      },
    },
  }), /manual validator rejected title/);
  assert.equal(settlements.at(-1)?.input.proposalStatus, "failed");
  assert.equal(settlements.at(-1)?.input.content, "manual validator rejected title");
});

test("failed audit finalization never masks the original executor error", async (t) => {
  settlements = [];
  proposalRecord = proposal("pending");
  allowExecution = true;
  failFailureFinalization = true;
  const consoleError = t.mock.method(console, "error", () => undefined);
  try {
    await assert.rejects(confirmProposalAction(88, requester, {
      "hr.employee.update": {
        toolKey: "hr.employee.update",
        requiredPermissions: [],
        execute: async () => {
          throw new Error("original executor failure");
        },
      },
    }), /original executor failure/);
    assert.equal(consoleError.mock.callCount(), 1);
    assert.equal(settlements.length, 0);
  } finally {
    failFailureFinalization = false;
  }
});

test("session persistence failure never masks the original executor error", async (t) => {
  settlements = [];
  proposalRecord = proposal("pending");
  allowExecution = true;
  settlementPersistenceError = new Error("session filesystem unavailable");
  const consoleError = t.mock.method(console, "error", () => undefined);
  try {
    await assert.rejects(confirmProposalAction(88, requester, {
      "hr.employee.update": {
        toolKey: "hr.employee.update",
        requiredPermissions: [],
        execute: async () => {
          throw new Error("manual validator original error");
        },
      },
    }), /manual validator original error/);
    assert.equal(consoleError.mock.callCount(), 1);
  } finally {
    settlementPersistenceError = null;
  }
});

test("explicit remote dispatch boundary distinguishes known preflight failures from uncertain remote failures", async () => {
  settlements = [];
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
