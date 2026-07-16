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

test("Workspace assistant grants stay outside the Agent management resource", () => {
  assert.equal(AGENT_RESOURCE_KEY, "agent.assistant");
  assert.deepEqual(MANAGED_WORKSPACE_RESOURCE_GRANTS, [
    { resourceKey: "agent.assistant", actions: ["entry", "read", "submit"] },
    { resourceKey: "agent.source", actions: ["read", "submit"] },
  ]);

  const byEmployeeId = new Map(WORKFORCE.map((employee) => [employee.employeeId, employee]));
  for (const employeeId of ["AI0001", "AI0002", "AI0003"]) {
    assert.deepEqual(byEmployeeId.get(employeeId)?.workspaceResourceGrants, []);
  }
  assert.deepEqual(
    byEmployeeId.get("AI0004")?.workspaceResourceGrants,
    MANAGED_WORKSPACE_RESOURCE_GRANTS,
  );
  assert.equal(
    byEmployeeId.get("AI0004")?.workspaceResourceGrants.some(
      (grant) => grant.resourceKey === "agent.config",
    ),
    false,
  );
});

test("workforce lifecycle uses the inclusive Shanghai business date", () => {
  const now = new Date("2026-07-15T16:30:00.000Z");
  assert.equal(agentBusinessDate(now), "2026-07-16");
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
