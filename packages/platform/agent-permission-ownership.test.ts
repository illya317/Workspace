import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { getActionContractMetadata } from "./action-contract-registry";
import { getBusinessActionRegistration } from "./business-action-registry";
import { resolvePermissionApiActionPolicy } from "./permission-api-action-policy";

test("Agent permission routes keep configure and grant authority independent", () => {
  const grantRead = resolvePermissionApiActionPolicy({
    method: "GET",
    apiPath: "/api/modules/agent/config/permission-grants",
    resourceKey: "agent.config",
  });
  const grantWrite = resolvePermissionApiActionPolicy({
    method: "PUT",
    apiPath: "/api/modules/agent/config/permission-grants",
    resourceKey: "agent.config",
  });
  const ceilingWrite = resolvePermissionApiActionPolicy({
    method: "PUT",
    apiPath: "/api/modules/agent/config/action-ceiling",
    resourceKey: "agent.config",
  });

  assert.deepEqual(grantRead.requiredActions, ["read"]);
  assert.equal(grantRead.runtimeEnforcement, "gateway");
  assert.deepEqual(grantWrite.requiredActions, ["read"]);
  assert.equal(grantWrite.runtimeEnforcement, "gateway");
  assert.deepEqual(ceilingWrite.requiredActions, ["configure"]);
  assert.equal(ceilingWrite.runtimeEnforcement, "gateway");
});

test("Agent action ceiling is a history-audited governance action", () => {
  const registration = getBusinessActionRegistration("agent.config.actionCeiling.configure");
  const contract = getActionContractMetadata("agent.config.actionCeiling.configure");
  assert.equal(registration?.resourceKey, "agent.config");
  assert.equal(registration?.directPermissionAction, "configure");
  assert.deepEqual(registration?.apiRoutes, [{
    method: "PUT",
    path: "/api/modules/agent/config/action-ceiling",
  }]);
  assert.equal(contract?.kind, "governance");
  if (!contract || contract.kind !== "governance") return;
  assert.equal(contract.governance.subject, "policy");
  assert.equal(contract.governance.scope, "system");
  assert.equal(contract.governance.auditPolicy, "history");
});

test("Settings no longer owns an Agent policy UI or write field", () => {
  const adminClient = readFileSync("packages/platform/ui/admin/AdminClient.tsx", "utf8");
  const settingsRoute = readFileSync("app/api/settings/admin/system-config/route.ts", "utf8");
  assert.equal(existsSync("packages/platform/ui/admin/tabs/AgentPermissionPolicyTab.tsx"), false);
  assert.doesNotMatch(adminClient, /agentPolicy|AgentPermissionPolicyTab/);
  assert.doesNotMatch(settingsRoute, /agentAllowedActions|PERMISSION_ACTION_KEYS/);
  assert.match(settingsRoute, /\.strict\(\)/);
});

test("Agent permission resource directory follows runtime registration metadata", () => {
  const directory = readFileSync("packages/platform/server/agent/permission-resource-directory.ts", "utf8");
  assert.match(directory, /resource\.kind === "capability"/);
  assert.match(directory, /resource\.runtimeParentKey === "agent"/);
  assert.match(directory, /canManageResourceGrant\(actorUserId, resource\.key, "grant"\)/);
  assert.doesNotMatch(directory, /capabilityOwnerKey\s*===\s*"agent\.config"/);

  const ui = readFileSync("packages/platform/ui/agent-permission-management.tsx", "utf8");
  assert.match(ui, /subjectType === "user" \? Number\(subject\.extra\?\.userId\) : subject\.id/);
  assert.match(ui, /state\.source === "direct" \? !state\.has : true/);
  assert.match(ui, /result\.changedCount > 0/);
});
