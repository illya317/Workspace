import assert from "node:assert/strict";
import test, { mock } from "node:test";

const NOW = new Date("2026-07-16T08:00:00.000Z");

mock.module("server-only", { exports: {} } as never);
mock.module("@workspace/platform/server/prisma", {
  exports: {
    prisma: {
      agentRun: {
        findMany: async () => [
          { sessionId: "session-1", proposalId: 10 },
          { sessionId: "session-1", proposalId: 11 },
          { sessionId: "session-2", proposalId: 12 },
        ],
      },
      agentProposal: {
        findMany: async () => [
          { id: 10, status: "pending", createdAt: new Date(NOW.getTime() - 1_000) },
          { id: 11, status: "executing", createdAt: new Date(NOW.getTime() - 2_000) },
          { id: 12, status: "pending", createdAt: new Date("2026-07-16T06:00:00.000Z") },
        ],
      },
    },
  },
} as never);

const { loadSessionProposalStates } = await import("./management-proposal-state");

test("all live proposals in a session participate in management status", async () => {
  const result = await loadSessionProposalStates({
    sessionIds: ["session-1", "session-2"],
    latestProposalIds: [null, null],
    fromDate: new Date("2026-07-16T00:00:00.000Z"),
    now: NOW,
  });

  assert.equal(result.activeProposalStatusBySession.get("session-1"), "executing");
  assert.equal(result.activeProposalStatusBySession.has("session-2"), false);
  assert.equal(result.proposalStatusById.get(10)?.status, "pending");
});
