import assert from "node:assert/strict";
import { actionImplies, getPermissionActionGlyph, PERMISSION_ACTION_KEYS } from "@workspace/platform/permission-actions";
import { getApiContracts, findApiContract } from "@workspace/platform/api-registry";
import {
  PERMISSION_RESOURCE_ACTION_POLICIES,
  PERMISSION_SCOPE_TYPE_KEYS,
  type PermissionResourceActionPolicy,
} from "@workspace/platform/permission-resource-policy";
import { PERMISSION_API_ACTION_POLICY_LIST, resolvePermissionApiActionPolicy } from "@workspace/platform/permission-api-action-policy";
import { registeredModuleDefinitions } from "@workspace/platform/module-registry";
import { buildPermissionRecords } from "@workspace/platform/server/rbac/action-records";

assert.equal(actionImplies("delete", "write"), true);
assert.equal(actionImplies("delete", "create"), true);
assert.equal(actionImplies("delete", "access"), true);

assert.equal(actionImplies("submit", "withdraw"), true);
assert.equal(actionImplies("submit", "create"), true);
assert.equal(actionImplies("submit", "access"), true);

assert.equal(actionImplies("approve", "reject"), true);
assert.equal(actionImplies("approve", "submit"), false);
assert.equal(actionImplies("approve", "create"), false);

for (const actionKey of PERMISSION_ACTION_KEYS) {
  assert.equal(actionImplies("admin", actionKey), true, `admin should imply ${actionKey}`);
  assert.equal(Boolean(getPermissionActionGlyph(actionKey)), true, `${actionKey} should have action glyph`);
}

const registeredResourceKeys = new Set<string>();
for (const definition of registeredModuleDefinitions) {
  const moduleDef = definition.moduleDef;
  if (moduleDef?.resourceKey) registeredResourceKeys.add(moduleDef.resourceKey);
  for (const child of moduleDef?.children ?? []) {
    if (child.resourceKey) registeredResourceKeys.add(child.resourceKey);
  }
  for (const resourceDef of definition.resourceDefs ?? []) {
    registeredResourceKeys.add(resourceDef.key);
  }
}

const policyResourceKeys = new Set<string>(PERMISSION_RESOURCE_ACTION_POLICIES.map((policy) => policy.resourceKey));
const validScopeTypeKeys = new Set<string>(PERMISSION_SCOPE_TYPE_KEYS);
const validScopeInheritanceModes = new Set<string>(["inherit", "self_only"]);
for (const resourceKey of registeredResourceKeys) {
  assert.equal(policyResourceKeys.has(resourceKey), true, `missing permission action policy for ${resourceKey}`);
}
for (const policy of PERMISSION_RESOURCE_ACTION_POLICIES as readonly PermissionResourceActionPolicy[]) {
  assert.equal(registeredResourceKeys.has(policy.resourceKey), true, `permission action policy has unknown resource ${policy.resourceKey}`);
  const supportedActions = policy.supportedActions as readonly string[];
  for (const actionKey of policy.supportedActions) {
    assert.equal(PERMISSION_ACTION_KEYS.includes(actionKey), true, `${policy.resourceKey} supports unknown action ${actionKey}`);
  }
  for (const actionKey of policy.ancestorInheritedActions) {
    assert.equal(supportedActions.includes(actionKey), true, `${policy.resourceKey} inherits unsupported action ${actionKey}`);
  }
  for (const actionKey of policy.explicitOnlyActions) {
    assert.equal(supportedActions.includes(actionKey), true, `${policy.resourceKey} marks unsupported explicit action ${actionKey}`);
  }
  for (const scopeType of policy.scopeTypes ?? []) {
    assert.equal(validScopeTypeKeys.has(scopeType), true, `${policy.resourceKey} declares unknown scope type ${scopeType}`);
  }
  if (policy.scopeInheritanceMode) {
    assert.equal(
      validScopeInheritanceModes.has(policy.scopeInheritanceMode),
      true,
      `${policy.resourceKey} declares unknown scope inheritance mode ${policy.scopeInheritanceMode}`,
    );
  }
}

for (const contract of getApiContracts()) {
  if (!contract.resourceKey) continue;
  assert.equal(Boolean(contract.action), true, `${contract.method} ${contract.pathPrefix} should have base action`);
  const resolved = resolvePermissionApiActionPolicy({
    method: contract.method,
    apiPath: contract.pathPrefix,
    resourceKey: contract.resourceKey,
    defaultBaseAction: contract.action,
  });
  assert.equal(resolved.baseAction, contract.action, `${contract.method} ${contract.pathPrefix} base action should be stable`);
  assert.equal(resolved.additionalAction, contract.additionalAction, `${contract.method} ${contract.pathPrefix} additional action should be stable`);
  const foundContract = findApiContract(contract.method, contract.pathPrefix);
  assert.deepEqual(
    foundContract?.additionalAction,
    contract.additionalAction,
    `${contract.method} ${contract.pathPrefix} lookup should preserve additional action`,
  );
}

for (const policy of PERMISSION_API_ACTION_POLICY_LIST) {
  const contract = findApiContract(policy.method, policy.pathPrefix);
  assert.equal(Boolean(contract), true, `${policy.method} ${policy.pathPrefix} should match an API contract`);
  assert.equal(
    registeredResourceKeys.has(policy.resourceKey),
    true,
    `${policy.method} ${policy.pathPrefix} uses unknown resource ${policy.resourceKey}`,
  );
  assert.equal(
    Boolean(policy.baseAction || policy.additionalAction),
    true,
    `${policy.method} ${policy.pathPrefix} must set baseAction or additionalAction`,
  );
  if (!policy.additionalAction) continue;
  const resourcePolicy = PERMISSION_RESOURCE_ACTION_POLICIES.find((item) => item.resourceKey === policy.resourceKey);
  assert.equal(
    Boolean((resourcePolicy?.supportedActions as readonly string[] | undefined)?.includes(policy.additionalAction)),
    true,
    `${policy.method} ${policy.pathPrefix} maps ${policy.resourceKey} to unsupported action ${policy.additionalAction}`,
  );
}

const projectRecord = buildPermissionRecords({
  subjects: [{ id: 1, name: "Test" }],
  subjectType: "user",
  selectedResource: "work.projects",
  ancestorResourceKeys: [],
  directGrants: [{ subjectId: 1, resourceKey: "work.projects", roleKey: "admin", scopeId: null }],
  positionGrants: [],
  departmentGrants: [],
  implicitGrants: [],
  directActionGrants: [],
  positionActionGrants: [],
  departmentActionGrants: [],
})[1];
const projectVisibleActions = new Set(projectRecord.actionTree.flatMap((group) => group.actions.map((action) => action.actionKey)));
assert.equal(projectVisibleActions.has("revise"), true, "work.projects should show supported revise action");
assert.equal(projectVisibleActions.has("export"), false, "work.projects should hide unsupported export action");
assert.equal(projectVisibleActions.has("archive"), false, "work.projects should hide unsupported archive action");

console.log("permission action catalog ok");
