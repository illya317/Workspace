import assert from "node:assert/strict";
import test from "node:test";

import { createTreasuryRequestGate, treasuryWorkspaceMatchesScope } from "./treasury-request-scope";

test("rejects a Treasury workspace response from an obsolete scope", () => {
  const response = { scope: { companyCode: "OLD", year: 2026, month: 6 } };
  assert.equal(treasuryWorkspaceMatchesScope(response, { companyCode: "NEW", year: 2026, month: 6 }), false);
  assert.equal(treasuryWorkspaceMatchesScope(response, { companyCode: "OLD", year: 2026, month: 6 }), true);
});

test("an old response cannot commit after the selected scope changes", async () => {
  const gate = createTreasuryRequestGate();
  const oldRequest = gate.begin({ companyCode: "OLD", year: 2026, month: 6 });
  const oldResponsePromise = Promise.resolve({ scope: { companyCode: "OLD", year: 2026, month: 6 } });
  gate.invalidate();

  let committed = false;
  const oldResponse = await oldResponsePromise;
  if (gate.accepts(oldRequest, oldResponse)) committed = true;

  assert.equal(committed, false);
  assert.equal(gate.isCurrent(oldRequest), false);
});
