import assert from "node:assert/strict";
import test from "node:test";

import {
  AGENT_RESOURCE_KEY,
  MANAGED_WORKSPACE_RESOURCE_GRANTS,
  PROVISIONER_LEDGER_SOURCE,
  WORKFORCE,
  agentBusinessDate,
  isAgentDateTimeEndActive,
  isProvisionerCreatedGrantLedgerEvent,
} from "./agent-workforce-specs.mjs";

test("Workspace assistant grants use the canonical Agent resource", () => {
  assert.equal(AGENT_RESOURCE_KEY, "agent");
  assert.ok(WORKFORCE.length > 0);
  for (const grant of MANAGED_WORKSPACE_RESOURCE_GRANTS) {
    assert.notEqual(grant.resourceKey, "agent.assistant");
  }
  for (const member of WORKFORCE) {
    assert.ok(member.runtimeBindings.length > 0);
    assert.ok(Array.isArray(member.workspaceResourceGrants));
    for (const grant of member.workspaceResourceGrants) {
      assert.notEqual(grant.resourceKey, "agent.assistant");
    }
  }
});

test("workforce lifecycle uses the inclusive configured business date", () => {
  const now = new Date("2026-07-15T12:00:00.000Z");
  assert.equal(agentBusinessDate(now), "2026-07-15");
  assert.equal(isAgentDateTimeEndActive(new Date("2026-07-16T00:00:00.000Z"), "2026-07-16"), true);
  assert.equal(isAgentDateTimeEndActive(new Date("2026-07-16T00:00:00.000Z"), "2026-07-17"), false);
});

test("only an explicit provisioner grant proves grant ownership", () => {
  assert.equal(isProvisionerCreatedGrantLedgerEvent({
    source: PROVISIONER_LEDGER_SOURCE,
    eventType: "grant",
    afterValue: true,
  }), true);

  assert.equal(isProvisionerCreatedGrantLedgerEvent({
    source: PROVISIONER_LEDGER_SOURCE,
    eventType: "baseline",
    afterValue: true,
  }), false);
  assert.equal(isProvisionerCreatedGrantLedgerEvent({
    source: "permission_matrix",
    eventType: "grant",
    afterValue: true,
  }), false);
  assert.equal(isProvisionerCreatedGrantLedgerEvent({
    source: PROVISIONER_LEDGER_SOURCE,
    eventType: "revoke",
    afterValue: false,
  }), false);
  assert.equal(isProvisionerCreatedGrantLedgerEvent(null), false);
});
