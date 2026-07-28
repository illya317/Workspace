import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExternalRelatedPartyCreateCommand,
  buildExternalRelatedPartyDeleteCommand,
} from "./related-party-validation";

test("builds a related-party create command for an existing Party FK", () => {
  const result = buildExternalRelatedPartyCreateCommand(
    { partyId: 42, relatedPartyType: "group" },
    7,
    3,
    " related-party-create-1 ",
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.data, {
    partyId: 42,
    userId: 7,
    expectedVersion: 3,
    relatedPartyType: "group",
    idempotencyKey: "related-party-create-1",
  });
});

test("rejects a related-party create command without an optimistic version", () => {
  const result = buildExternalRelatedPartyCreateCommand(
    { partyId: 42, relatedPartyType: "other_related" },
    7,
    undefined,
    "related-party-create-2",
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.issue.field, "expectedVersion");
});

test("builds a related-party delete command with optimistic locking", () => {
  const result = buildExternalRelatedPartyDeleteCommand(42, 7, 3, " related-party-delete-1 ");

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.data, {
    partyId: 42,
    userId: 7,
    expectedVersion: 3,
    idempotencyKey: "related-party-delete-1",
  });
});
