import assert from "node:assert/strict";
import test from "node:test";

import {
  validateAgentActionCeilingUpdate,
  validateAgentPermissionGrantBatch,
} from "./permission-management-validation";

test("Agent action ceiling is deduplicated into canonical action order", () => {
  const result = validateAgentActionCeilingUpdate({
    editorUserId: 7,
    actionKeys: ["submit", "read", "submit", "entry"],
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.data.actionKeys, ["entry", "read", "submit"]);
});

test("Agent grant batch preserves user, position, and department subjects", () => {
  const result = validateAgentPermissionGrantBatch({
    actorUserId: 7,
    changes: [
      { subjectType: "user", subjectId: 11, resourceKey: "agent.assistant", actionKey: "read", value: true },
      { subjectType: "position", subjectId: 12, resourceKey: "agent.source", actionKey: "submit", value: true },
      { subjectType: "department", subjectId: 13, resourceKey: "agent.source", actionKey: "read", value: false },
    ],
  }, {
    registeredAgentResourceKeys: ["agent.assistant", "agent.source"],
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.data.changes.map((change) => change.subjectType), [
    "user",
    "position",
    "department",
  ]);
});

test("Agent grant batch rejects non-Agent resources and duplicate targets", () => {
  const outside = validateAgentPermissionGrantBatch({
    actorUserId: 7,
    changes: [{ subjectType: "user", subjectId: 11, resourceKey: "finance.ledger", actionKey: "read", value: true }],
  }, {
    registeredAgentResourceKeys: ["agent.assistant", "agent.source"],
  });
  assert.equal(outside.ok, false);

  const duplicate = validateAgentPermissionGrantBatch({
    actorUserId: 7,
    changes: [
      { subjectType: "department", subjectId: 13, resourceKey: "agent.source", actionKey: "read", value: true },
      { subjectType: "department", subjectId: 13, resourceKey: "agent.source", actionKey: "read", value: false },
    ],
  }, {
    registeredAgentResourceKeys: ["agent.assistant", "agent.source"],
  });
  assert.equal(duplicate.ok, false);
});
