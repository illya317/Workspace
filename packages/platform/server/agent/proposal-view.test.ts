import assert from "node:assert/strict";
import test from "node:test";

import { AGENT_PROPOSAL_TTL_MS, createAgentProposalView } from "./proposal-view";

const createdAt = new Date("2026-07-13T00:00:00.000Z");

test("proposal view omits payload and parses only object diffs", () => {
  const view = createAgentProposalView({
    id: 17,
    status: "pending",
    actionKey: "hr.employee.update",
    targetType: "Employee",
    targetId: "42",
    diffJson: JSON.stringify({ department: { from: "A", to: "B" } }),
    createdAt,
    confirmedAt: null,
  }, createdAt.getTime() + 1);

  assert.deepEqual(view.diff, { department: { from: "A", to: "B" } });
  assert.equal(view.expiresAt, new Date(createdAt.getTime() + AGENT_PROPOSAL_TTL_MS).toISOString());
  assert.ok(!("payload" in view));
});

test("proposal view reports an elapsed pending proposal as expired", () => {
  const view = createAgentProposalView({
    id: 18,
    status: "pending",
    actionKey: "source.submitCnbPullRequest",
    targetType: "CnbPullRequest",
    targetId: null,
    diffJson: "not-json",
    createdAt,
    confirmedAt: null,
  }, createdAt.getTime() + AGENT_PROPOSAL_TTL_MS + 1);

  assert.equal(view.status, "expired");
  assert.deepEqual(view.diff, {});
});
