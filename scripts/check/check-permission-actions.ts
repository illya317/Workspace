import assert from "node:assert/strict";
import {
  actionImplies,
  getPermissionActionGlyph,
  PERMISSION_ACTION_KEYS,
  type PermissionActionKey,
} from "../../packages/platform/permission-actions";
import { getApiContracts, findApiContract } from "../../packages/platform/api-registry";
import { isPermissionRegistryActionKey } from "../../packages/platform/action-registry";
import {
  PERMISSION_RESOURCE_ACTION_POLICIES,
  PERMISSION_SCOPE_TYPE_KEYS,
  isPermissionActionSupported,
  type PermissionResourceActionPolicy,
} from "../../packages/platform/permission-resource-policy";
import { getStructuralPermissionResourceActions } from "../../packages/platform/permission-resource-structural-actions";
import { PERMISSION_API_ACTION_POLICY_LIST, resolvePermissionApiActionPolicy } from "../../packages/platform/permission-api-action-policy";
import { RESOURCE_KEYS } from "../../packages/platform/resources";
import { registeredModuleDefinitions } from "../../packages/platform/module-registry";
import { listWorkflowEligibleBusinessActions } from "../../packages/platform/business-action-registry";
import {
  WORKFLOW_MANAGEMENT_ROOT_RESOURCE_KEY,
  workflowActionManagementResourceKey,
  workflowCategoryManagementResourceKey,
} from "../../packages/platform/workflow-management-resources";
import { isRegisteredSpaceResourceKey } from "../../packages/platform/space-registry";
import { buildPermissionRecords } from "../../packages/platform/server/rbac/action-records";
import { canMutatePermissionGrantAction } from "../../packages/platform/server/rbac/action-grant-policy";
import {
  getGrantablePermissionActions,
  isPermissionActionGrantable,
} from "../../packages/platform/permission-action-grantability";
import {
  deriveApiResourcePrefixes,
  resolveApiResourceForPath,
} from "../../packages/platform/module-registry-utils";
import { getNaturalSpaceActionProfileActionKeys } from "../../packages/platform/permission-natural-space-actions";
import {
  getPermissionMatrixVisibleColumnActions,
  PERMISSION_MATRIX_ACTION_COLUMNS,
  permissionActionPreviewTone,
  permissionSourceTone,
  summarizePermissionActionColumn,
} from "../../packages/platform/ui/permission-matrix-model";
import {
  createPermissionActionMatrixSurface,
  type PermissionMatrixActionState,
  type PermissionMatrixRecord,
} from "../../packages/platform/ui/PermissionActionMatrixGrid";

assert.equal(actionImplies("delete", "update"), false);
assert.equal(actionImplies("delete", "create"), false);
assert.equal(actionImplies("delete", "read"), true);
assert.equal(actionImplies("delete", "entry"), true);

assert.equal(actionImplies("submit", "reverse"), false);
assert.equal(actionImplies("submit", "create"), false);
assert.equal(actionImplies("submit", "read"), true);
assert.equal(actionImplies("submit", "entry"), true);

assert.equal(actionImplies("approve", "reject"), false);
assert.equal(actionImplies("approve", "submit"), false);
assert.equal(actionImplies("approve", "create"), false);

assert.equal(
  permissionActionPreviewTone({ actionKey: "read", has: false }, "update"),
  "blue",
  "hovering update should preview its ungranted read child in blue",
);
assert.equal(
  permissionActionPreviewTone({ actionKey: "entry", has: false }, "update"),
  "blue",
  "hovering update should preview its ungranted entry child in blue",
);
assert.equal(
  permissionActionPreviewTone({ actionKey: "create", has: false }, "delete"),
  "gray",
  "hovering delete must not preview unrelated create",
);
assert.equal(
  permissionActionPreviewTone({ actionKey: "read", has: true, source: "direct" }, "update"),
  "green",
  "hover preview must not overwrite an existing direct grant tone",
);

const hoverPreviewRecord: PermissionMatrixRecord<PermissionMatrixActionState> = {
  actionStates: Object.fromEntries(PERMISSION_ACTION_KEYS.map((actionKey) => [actionKey, {
    actionKey,
    has: false,
    source: null,
    sourceActionKey: null,
    sourceResourceKey: null,
    directGrantable: true,
    pendingResourceMapping: false,
  }])) as PermissionMatrixRecord<PermissionMatrixActionState>["actionStates"],
};
const hoveredChanges: Array<{ subjectKey: string; actionKey: PermissionActionKey } | null> = [];
const hoverPreviewSurface = createPermissionActionMatrixSurface({
  subjects: [{ id: "subject-1" }],
  subjectColumnLabel: "",
  getSubjectKey: (subject) => subject.id,
  renderSubject: () => ({ kind: "text", value: "" }),
  getRecord: () => hoverPreviewRecord,
  expandedKeys: new Set<string>(),
  onToggleExpand: () => undefined,
  visibleActionKeys: ["entry", "read", "update"],
  columns: [{ key: "basic", columnLabel: "基础权限", actions: ["entry", "read", "update"] }],
  layout: "singleSubjectDetails",
  hoveredAction: { subjectKey: "subject-1", actionKey: "update" },
  onHoveredActionChange: (hovered) => hoveredChanges.push(hovered),
});
assert.equal(hoverPreviewSurface.kind, "structured", "permission matrix surface should stay structured");
const hoverPreviewActions = hoverPreviewSurface.kind === "structured"
  ? hoverPreviewSurface.rows.flatMap((row) => row.flatMap((cell) => {
      const content = cell.content;
      return typeof content === "object" && content && "kind" in content && content.kind === "action"
        ? [content.action]
        : [];
    }))
  : [];
const updatePreviewAction = hoverPreviewActions.find((action) => action.key === "subject-1:update");
const readPreviewAction = hoverPreviewActions.find((action) => action.key === "subject-1:read");
const entryPreviewAction = hoverPreviewActions.find((action) => action.key === "subject-1:entry");
assert.equal(
  Boolean(
    updatePreviewAction?.title?.includes("授权后同时获得：")
    && updatePreviewAction.title.includes("查看")
    && updatePreviewAction.title.includes("进入")
  ),
  true,
  "parent action tooltip should name implied children",
);
assert.equal(readPreviewAction?.tone, "blue", "hovered update should preview read in blue");
assert.equal(entryPreviewAction?.tone, "blue", "hovered update should preview entry in blue");
updatePreviewAction?.onMouseEnter?.();
updatePreviewAction?.onMouseLeave?.();
assert.deepEqual(hoveredChanges, [
  { subjectKey: "subject-1", actionKey: "update" },
  null,
], "parent action hover callbacks should set and clear the shared preview state");

assert.equal(canMutatePermissionGrantAction("grant", false), true, "grant managers may re-grant grant after resource guard passes");
assert.equal(canMutatePermissionGrantAction("grant", true), true, "root admin may maintain grant");
assert.equal(canMutatePermissionGrantAction("update", false), true, "delegated grant managers may grant business actions");

for (const actionKey of PERMISSION_ACTION_KEYS) {
  assert.equal(Boolean(getPermissionActionGlyph(actionKey)), true, `${actionKey} should have action glyph`);
}

const registeredResourceKeys = new Set<string>(RESOURCE_KEYS);
const apiResourcePrefixes = deriveApiResourcePrefixes(registeredModuleDefinitions);

function assertApiResourceInference(apiPath: string, expectedResourceKey: string, expectedCanonical: boolean) {
  const resolution = resolveApiResourceForPath(apiResourcePrefixes, apiPath);
  assert.equal(resolution?.resourceKey, expectedResourceKey, `${apiPath} should infer resourceKey ${expectedResourceKey}`);
  assert.equal(resolution?.isCanonical, expectedCanonical, `${apiPath} canonical inference flag should be ${expectedCanonical}`);
}

function assertApiMigrationNote(method: Parameters<typeof findApiContract>[0], apiPath: string) {
  const contract = findApiContract(method, apiPath);
  assert.equal(Boolean(contract?.migrationNote), true, `${method} ${apiPath} must keep a migrationNote while using a legacy API path`);
}

assertApiResourceInference("/api/modules/settings/api/manage/clients", "settings.api.manage", true);
assertApiResourceInference("/api/modules/settings/account/api-access/key", "settings.account.apiAccess", true);
assertApiResourceInference("/api/modules/hr/roster/generated", "hr.roster.generated", true);
assertApiResourceInference("/api/settings/api/open/clients", "settings.api.manage", false);
assertApiMigrationNote("GET", "/api/settings/account");
assertApiMigrationNote("POST", "/api/agent");

const policyResourceKeys = new Set<string>(PERMISSION_RESOURCE_ACTION_POLICIES.map((policy) => policy.resourceKey));
const validScopeTypeKeys = new Set<string>(PERMISSION_SCOPE_TYPE_KEYS);
const validScopeInheritanceModes = new Set<string>(["inherit", "self_only"]);
for (const resourceKey of registeredResourceKeys) {
  assert.equal(policyResourceKeys.has(resourceKey), true, `missing permission action policy for ${resourceKey}`);
}
for (const policy of PERMISSION_RESOURCE_ACTION_POLICIES as readonly PermissionResourceActionPolicy[]) {
  assert.equal(registeredResourceKeys.has(policy.resourceKey), true, `permission action policy has unknown resource ${policy.resourceKey}`);
  const supportedActions = policy.supportedActions as readonly string[];
  const explicitOnlyActions = policy.explicitOnlyActions as readonly string[];
  const structuralActions = getStructuralPermissionResourceActions(policy.resourceKey);
  for (const actionKey of policy.supportedActions) {
    assert.equal(PERMISSION_ACTION_KEYS.includes(actionKey), true, `${policy.resourceKey} supports unknown action ${actionKey}`);
  }
  for (const actionKey of structuralActions.supportedActions) {
    assert.equal(supportedActions.includes(actionKey), true, `${policy.resourceKey} should support structural action ${actionKey}`);
  }
  for (const actionKey of structuralActions.explicitOnlyActions) {
    assert.equal(explicitOnlyActions.includes(actionKey), true, `${policy.resourceKey} should mark structural action ${actionKey} explicit-only`);
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

for (const definition of registeredModuleDefinitions) {
  for (const relation of definition.relationRegistrations ?? []) {
    if (isRegisteredSpaceResourceKey(relation.permission.resourceKey)) {
      assert.equal(
        relation.permission.action,
        "entry",
        `${relation.key} references registered space root ${relation.permission.resourceKey}; selector relation permission must use entry and let the target adapter filter objects`,
      );
    }
  }
}

for (const contract of getApiContracts()) {
  if (contract.apiKind === "business") {
    assert.equal(Boolean(contract.resourceKey), true, `${contract.method} ${contract.pathPrefix} business API should have resourceKey`);
    assert.equal(contract.requiredActions.length > 0, true, `${contract.method} ${contract.pathPrefix} business API should have requiredActions`);
  } else {
    assert.equal(contract.resourceKey, null, `${contract.method} ${contract.pathPrefix} ${contract.apiKind} API should not have resourceKey`);
    assert.equal(contract.requiredActions.length, 0, `${contract.method} ${contract.pathPrefix} ${contract.apiKind} API should not have requiredActions`);
    assert.equal(Boolean(contract.notes), true, `${contract.method} ${contract.pathPrefix} ${contract.apiKind} API should explain why it has no resource/action`);
    continue;
  }
  const resolved = resolvePermissionApiActionPolicy({
    method: contract.method,
    apiPath: contract.pathPrefix,
    resourceKey: contract.resourceKey,
  });
  const authorizationResourceKey = resolved.resourceKey;
  assert.ok(authorizationResourceKey, `${contract.method} ${contract.pathPrefix} business API should resolve an authorization resource`);
  assert.equal(
    registeredResourceKeys.has(authorizationResourceKey),
    true,
    `${contract.method} ${contract.pathPrefix} uses unknown authorization resource ${authorizationResourceKey}`,
  );
  assert.deepEqual(resolved.requiredActions, contract.requiredActions, `${contract.method} ${contract.pathPrefix} requiredActions should be stable`);
  assert.equal(resolved.runtimeEnforcement, contract.runtimeEnforcement, `${contract.method} ${contract.pathPrefix} runtimeEnforcement should be stable`);
  assert.equal(
    contract.authorization.resourceKey,
    authorizationResourceKey,
    `${contract.method} ${contract.pathPrefix} authorization resource should be stable`,
  );
  if (contract.runtimeEnforcement === "serviceDelegated") {
    assert.equal(Boolean(contract.notes), true, `${contract.method} ${contract.pathPrefix} service-delegated API should explain runtime enforcement`);
  }
  if (
    isRegisteredSpaceResourceKey(authorizationResourceKey)
    && contract.runtimeEnforcement !== "serviceDelegated"
    && contract.requiredActions.some((actionKey) => actionKey !== "entry")
  ) {
    assert.fail(`${contract.method} ${contract.pathPrefix} uses space-entry root ${authorizationResourceKey}; non-entry API actions must be service-delegated`);
  }
  for (const actionKey of contract.requiredActions) {
    assert.equal(isPermissionRegistryActionKey(actionKey), true, `${contract.method} ${contract.pathPrefix} requires unknown new action ${actionKey}`);
    assert.equal(
      isPermissionActionSupported(authorizationResourceKey, actionKey),
      true,
      `${contract.method} ${contract.pathPrefix} requires ${actionKey}, but authorization resource ${authorizationResourceKey} does not support it`,
    );
    if (contract.runtimeEnforcement !== "serviceDelegated") {
      assert.equal(
        PERMISSION_ACTION_KEYS.includes(actionKey),
        true,
        `${contract.method} ${contract.pathPrefix} required action ${actionKey} must be a runtime permission action`,
      );
    }
  }
  const foundContract = findApiContract(contract.method, contract.pathPrefix);
  assert.deepEqual(
    foundContract?.requiredActions,
    contract.requiredActions,
    `${contract.method} ${contract.pathPrefix} lookup should preserve required actions`,
  );
  assert.deepEqual(
    foundContract?.authorization.requiredActions,
    contract.authorization.requiredActions,
    `${contract.method} ${contract.pathPrefix} lookup should preserve authorization actions`,
  );
}

for (const policy of PERMISSION_API_ACTION_POLICY_LIST) {
  const contract = findApiContract(policy.method, policy.pathPrefix);
  assert.ok(contract, `${policy.method} ${policy.pathPrefix} should match an API contract`);
  const authorizationResourceKey = policy.authorizationResourceKey ?? contract.resourceKey;
  assert.ok(authorizationResourceKey, `${policy.method} ${policy.pathPrefix} should resolve an authorization resource`);
  assert.equal(
    registeredResourceKeys.has(authorizationResourceKey),
    true,
    `${policy.method} ${policy.pathPrefix} uses unknown authorization resource ${authorizationResourceKey}`,
  );
  assert.equal(
    policy.requiredActions.length > 0,
    true,
    `${policy.method} ${policy.pathPrefix} must set requiredActions`,
  );
  for (const actionKey of policy.requiredActions) {
    assert.equal(isPermissionRegistryActionKey(actionKey), true, `${policy.method} ${policy.pathPrefix} requires unknown new action ${actionKey}`);
    assert.equal(
      isPermissionActionSupported(authorizationResourceKey, actionKey),
      true,
      `${policy.method} ${policy.pathPrefix} requires ${actionKey}, but authorization resource ${authorizationResourceKey} does not support it`,
    );
    if (policy.runtimeEnforcement !== "serviceDelegated") {
      assert.equal(
        PERMISSION_ACTION_KEYS.includes(actionKey),
        true,
        `${policy.method} ${policy.pathPrefix} required action ${actionKey} must be a runtime permission action`,
      );
    }
  }
  if (policy.runtimeEnforcement === "serviceDelegated") {
    assert.equal(Boolean(policy.notes), true, `${policy.method} ${policy.pathPrefix} service-delegated policy should explain runtime enforcement`);
  }
  if (
    isRegisteredSpaceResourceKey(authorizationResourceKey)
    && policy.runtimeEnforcement !== "serviceDelegated"
    && policy.requiredActions.some((actionKey) => actionKey !== "entry")
  ) {
    assert.fail(`${policy.method} ${policy.pathPrefix} uses space-entry root ${authorizationResourceKey}; non-entry API actions must be service-delegated`);
  }
}

function assertApiActions(method: Parameters<typeof findApiContract>[0], apiPath: string, actions: readonly string[]) {
  assert.deepEqual(findApiContract(method, apiPath)?.requiredActions, actions, `${method} ${apiPath} should resolve requiredActions`);
}

function assertApiRuntime(method: Parameters<typeof findApiContract>[0], apiPath: string, runtimeEnforcement: "gateway" | "serviceDelegated") {
  assert.equal(findApiContract(method, apiPath)?.runtimeEnforcement, runtimeEnforcement, `${method} ${apiPath} should resolve runtime enforcement`);
}

function assertApiAuthorization(
  method: Parameters<typeof findApiContract>[0],
  apiPath: string,
  expected: {
    resourceKey: string | null;
    scopeId: string | null;
    projection: "default" | "space";
    actions: readonly string[];
  },
) {
  const authorization = findApiContract(method, apiPath)?.authorization;
  assert.equal(authorization?.resourceKey ?? null, expected.resourceKey, `${method} ${apiPath} should resolve authorization resource`);
  assert.equal(authorization?.scopeId ?? null, expected.scopeId, `${method} ${apiPath} should resolve authorization scope`);
  assert.equal(authorization?.projection ?? "default", expected.projection, `${method} ${apiPath} should resolve authorization projection`);
  assert.deepEqual(authorization?.requiredActions ?? [], expected.actions, `${method} ${apiPath} should resolve authorization actions`);
  if (expected.resourceKey) {
    for (const actionKey of expected.actions) {
      assert.equal(isPermissionRegistryActionKey(actionKey), true, `${method} ${apiPath} resolves unknown action ${actionKey}`);
      if (!isPermissionRegistryActionKey(actionKey)) continue;
      assert.equal(
        isPermissionActionSupported(expected.resourceKey, actionKey),
        true,
        `${method} ${apiPath} resolves ${actionKey}, but ${expected.resourceKey} does not support it`,
      );
    }
  }
}

assertApiActions("GET", "/api/modules/production/qc", ["read"]);
assertApiActions("POST", "/api/modules/production/qc", ["create"]);
assertApiActions("PATCH", "/api/modules/production/qc/123", ["update"]);
assertApiActions("DELETE", "/api/modules/production/qc/123", ["delete"]);
assertApiActions("POST", "/api/modules/production/qc/123/approve-review", ["approve"]);
const qcCacheContract = findApiContract("POST", "/api/modules/production/qc/cache");
assert.equal(qcCacheContract?.apiKind, "internal", "QC cache warmup should stay an internal API");
assert.deepEqual(qcCacheContract?.requiredActions, [], "QC cache warmup should not declare business requiredActions");
assertApiActions("GET", "/api/modules/library/basic-info/categories", ["read"]);
assertApiActions("GET", "/api/modules/library/basic-info/documents/123/download", ["export"]);
assertApiActions("GET", "/api/modules/library/basic-info/manuals/file.pdf", ["export"]);
assertApiActions("POST", "/api/modules/library/basic-info/scan", ["import"]);
assertApiActions("POST", "/api/modules/library/basic-info/generated-sources/finance-report/generate", ["import"]);
assertApiActions("DELETE", "/api/modules/library/basic-info/documents/123", ["archive"]);
assertApiActions("PATCH", "/api/modules/library/basic-info/documents/123", ["update", "configure"]);
assertApiRuntime("PATCH", "/api/modules/library/basic-info/documents/123", "serviceDelegated");
assertApiActions("GET", "/api/modules/administration/contracts", ["read"]);
assertApiActions("POST", "/api/modules/administration/contracts", ["create"]);
assertApiActions("PATCH", "/api/modules/administration/contracts/123", ["update"]);
assertApiActions("DELETE", "/api/modules/administration/contracts/123", ["delete"]);
assertApiActions("GET", "/api/modules/capitalSecurities/governance/organizations", ["read"]);
assertApiActions("POST", "/api/modules/capitalSecurities/governance/organizations", ["create"]);
assertApiActions("PUT", "/api/modules/capitalSecurities/governance/organizations", ["update"]);
assertApiActions("POST", "/api/modules/finance/budget/versions", ["create"]);
assertApiActions("POST", "/api/modules/finance/budget/versions/123/activate", ["approve"]);
assertApiActions("GET", "/api/modules/finance/cost/operational-analytics/shipments", ["read"]);
assertApiRuntime("GET", "/api/modules/finance/cost/operational-analytics/shipments", "serviceDelegated");
assertApiAuthorization("GET", "/api/modules/finance/cost/operational-analytics/spaces/department/123/permissions", {
  resourceKey: "space.department.analytics",
  scopeId: "department:123",
  projection: "space",
  actions: ["grant"],
});
assertApiAuthorization("PUT", "/api/modules/finance/cost/operational-analytics/spaces/project/456/permissions", {
  resourceKey: "space.project.analytics",
  scopeId: "project:456",
  projection: "space",
  actions: ["grant"],
});
assertApiActions("GET", "/api/modules/work/tasks/submissions", ["read"]);
assertApiRuntime("GET", "/api/modules/work/tasks/submissions", "serviceDelegated");
assertApiAuthorization("GET", "/api/modules/work/tasks/spaces/department/123/permissions", {
  resourceKey: "space.department.tasks",
  scopeId: "department:123",
  projection: "space",
  actions: ["grant"],
});
assertApiAuthorization("PUT", "/api/modules/work/projects/spaces/company/1/permissions", {
  resourceKey: "space.company.projects",
  scopeId: "company:company",
  projection: "space",
  actions: ["grant"],
});
assertApiAuthorization("GET", "/api/settings/account/spaces/department/123/permissions", {
  resourceKey: "settings.account",
  scopeId: "department:123",
  projection: "space",
  actions: ["grant"],
});
assertApiActions("POST", "/api/modules/docs/editor/submissions", ["submit"]);
assertApiRuntime("POST", "/api/modules/docs/editor/submissions", "serviceDelegated");
assertApiActions("POST", "/api/modules/docs/editor/submissions/comment", ["read"]);
assertApiRuntime("POST", "/api/modules/docs/editor/submissions/comment", "serviceDelegated");
assertApiActions("POST", "/api/modules/docs/editor/templates/123/archive", ["archive"]);
assertApiRuntime("POST", "/api/modules/docs/editor/templates/123/archive", "serviceDelegated");
assertApiActions("GET", "/api/settings/admin/permission-grant-ledger", ["audit"]);
assertApiRuntime("GET", "/api/settings/admin/permission-grant-ledger", "serviceDelegated");
assertApiActions("PUT", "/api/settings/admin/permission-grants", ["grant"]);
assertApiRuntime("PUT", "/api/settings/admin/permission-grants", "serviceDelegated");
assertApiActions("GET", "/api/settings/admin/system-config", ["configure"]);
assertApiRuntime("GET", "/api/settings/admin/system-config", "serviceDelegated");
assertApiActions("PATCH", "/api/settings/admin/modules", ["configure"]);
assertApiRuntime("PATCH", "/api/settings/admin/modules", "serviceDelegated");
assertApiActions("GET", "/api/settings/admin/workflow-policies", ["configure"]);
assertApiRuntime("GET", "/api/settings/admin/workflow-policies", "serviceDelegated");
assertApiActions("POST", "/api/settings/api/open/clients/123/secret", ["revise"]);
assertApiActions("PUT", "/api/settings/api/open/clients/123/scopes", ["grant"]);
assertApiActions("GET", "/api/agent/capabilities", ["read"]);
assertApiActions("GET", "/api/agent/proposals/123", ["read"]);
assertApiActions("POST", "/api/agent", ["submit"]);
assertApiActions("POST", "/api/agent/proposals/123/confirm", ["submit"]);
assertApiActions("POST", "/api/agent/proposals/123/cancel", ["submit"]);

assert.equal(isPermissionActionGrantable("administration", "create"), true, "ordinary resources should grant supported create actions");
assert.equal(isPermissionActionGrantable("administration", "grant"), true, "ordinary resources should grant supported authorization actions");
assert.equal(isPermissionActionGrantable("work.projects", "entry"), true, "space-entry L2 should grant entry");
assert.equal(isPermissionActionGrantable("work.projects", "create"), false, "space-entry L2 should not grant create");
assert.equal(isPermissionActionGrantable("work.projects", "grant"), false, "space-entry L2 should not grant authorization directly");
assert.deepEqual(getGrantablePermissionActions("work.projects"), ["entry"], "space-entry L2 grantable actions should collapse to entry");
assert.equal(isPermissionActionGrantable("space.department.projects", "create"), true, "derived project space should keep create");
assert.equal(isPermissionActionGrantable("space.department.projects", "grant"), true, "derived project space should keep grant");

function actionPolicy(resourceKey: string) {
  const policy = PERMISSION_RESOURCE_ACTION_POLICIES.find((item) => item.resourceKey === resourceKey);
  assert.ok(policy, `missing permission action policy for ${resourceKey}`);
  return policy;
}

function orderedUnion(actions: readonly string[]) {
  const set = new Set(actions);
  return PERMISSION_ACTION_KEYS.filter((actionKey) => set.has(actionKey));
}

for (const scopeType of ["department", "committee", "company", "project"] as const) {
  const parentKey = `space.${scopeType}`;
  const childKeys = [...policyResourceKeys].filter((resourceKey) => {
    if (!resourceKey.startsWith(`${parentKey}.`)) return false;
    return !resourceKey.slice(parentKey.length + 1).includes(".");
  });
  assert.deepEqual(
    actionPolicy(parentKey).supportedActions,
    orderedUnion(childKeys.flatMap((resourceKey) => [...actionPolicy(resourceKey).supportedActions])),
    `${parentKey} should support exactly the union of its space child actions`,
  );
}

const departmentSpaceManagerActions = getNaturalSpaceActionProfileActionKeys("space.department", "allBusiness");
assert.equal(departmentSpaceManagerActions.includes("grant"), false, "natural business owner should not imply grant");
assert.deepEqual(
  departmentSpaceManagerActions,
  actionPolicy("space.department").supportedActions.filter((actionKey) => actionKey !== "grant"),
  "natural business owner should display all supported non-grant actions",
);
assert.equal(actionPolicy("docs").supportedActions.includes("configure"), false, "ordinary resources should not carry workflow management");
assert.equal(actionPolicy("docs.editor").supportedActions.includes("configure"), false, "workflow management should use dedicated capabilities");
assert.equal(actionPolicy("work").supportedActions.includes("configure"), false, "ordinary module parents should not carry workflow management");
assert.equal(actionPolicy("work.tasks").supportedActions.includes("configure"), false, "task resources should not carry workflow management");
assert.equal(actionPolicy("space.department").supportedActions.includes("configure"), true, "space parents should expose active child configuration such as operational analytics");
assert.equal(actionPolicy("space.department.tasks").supportedActions.includes("configure"), false, "space children should not expose retired workflow configuration");
assert.deepEqual(actionPolicy(WORKFLOW_MANAGEMENT_ROOT_RESOURCE_KEY).supportedActions, ["configure"], "workflow root should expose configure only");
assert.deepEqual(actionPolicy(workflowCategoryManagementResourceKey("assessment")).ancestorInheritedActions, ["configure"], "workflow categories should inherit root configure");
const firstWorkflowAction = listWorkflowEligibleBusinessActions()[0]!;
assert.deepEqual(
  actionPolicy(workflowActionManagementResourceKey(firstWorkflowAction.key)).ancestorInheritedActions,
  ["configure"],
  "workflow actions should inherit category configure",
);
assert.deepEqual(
  getNaturalSpaceActionProfileActionKeys("space.department", "read"),
  ["read"],
  "natural read profile should display read only",
);

const projectRecord = buildPermissionRecords({
  subjects: [{ id: 1, name: "Test" }],
  subjectType: "user",
  selectedResource: "work.projects",
  ancestorResourceKeys: [],
  directActionGrants: [{ subjectId: 1, resourceKey: "work.projects", actionKey: "read", resourceId: 1, scopeId: null }],
  positionActionGrants: [],
  departmentActionGrants: [],
  implicitActionGrants: [],
})[1];
const projectVisibleActions = new Set(projectRecord.actionTree.flatMap((group) => group.actions.map((action) => action.actionKey)));
assert.equal(projectVisibleActions.has("entry"), true, "space-entry work.projects should show entry action");
assert.equal(projectVisibleActions.has("revise"), false, "space-entry work.projects should hide L3 revise action");
assert.equal(projectVisibleActions.has("export"), false, "work.projects should hide unsupported export action");
assert.equal(projectVisibleActions.has("archive"), false, "work.projects should hide unsupported archive action");
assert.equal(projectRecord.actionStates.entry.has, true, "space-entry read should fold into entry");
assert.equal(projectRecord.actionStates.entry.source, "implied", "space-entry folded entry should use implied source tone");
assert.equal(projectRecord.actionStates.entry.sourceActionKey, "read", "space-entry should keep the source action for tracing");
assert.equal(projectRecord.actionStates.grant.has, false, "space-entry L2 should not show authorization");
const projectBasicColumn = PERMISSION_MATRIX_ACTION_COLUMNS.find((column) => column.key === "basic")!;
const projectWorkflowColumn = PERMISSION_MATRIX_ACTION_COLUMNS.find((column) => column.key === "workflowSubmit")!;
const projectLifecycleColumn = PERMISSION_MATRIX_ACTION_COLUMNS.find((column) => column.key === "lifecycle")!;
assert.deepEqual(
  summarizePermissionActionColumn(projectRecord, projectBasicColumn.key, projectBasicColumn.actions, projectBasicColumn.mode).map((state) => state.actionKey),
  ["entry"],
  "space-entry L2 should summarize entry only in the basic column",
);
assert.deepEqual(
  getPermissionMatrixVisibleColumnActions(projectRecord, projectBasicColumn.key, projectBasicColumn.actions),
  ["entry"],
  "space-entry L2 detail rows should include only entry in the basic column",
);
assert.deepEqual(
  summarizePermissionActionColumn(projectRecord, projectWorkflowColumn.key, projectWorkflowColumn.actions, projectWorkflowColumn.mode).map((state) => state.actionKey),
  [],
  "space-entry L2 should not repeat access in workflow columns",
);
assert.deepEqual(
  getPermissionMatrixVisibleColumnActions(projectRecord, projectWorkflowColumn.key, projectWorkflowColumn.actions),
  [],
  "space-entry L2 detail rows should not reserve workflow placeholders",
);
assert.deepEqual(
  summarizePermissionActionColumn(projectRecord, projectLifecycleColumn.key, projectLifecycleColumn.actions, projectLifecycleColumn.mode).map((state) => state.actionKey),
  [],
  "space-entry L2 should not show lifecycle placeholders",
);
assert.equal(
  Math.max(
    0,
    ...PERMISSION_MATRIX_ACTION_COLUMNS.map((column) =>
      getPermissionMatrixVisibleColumnActions(projectRecord, column.key, column.actions).length,
    ),
  ),
  1,
  "space-entry L2 expanded matrix should adapt to one visible detail row",
);

const impliedDeleteRecord = buildPermissionRecords({
  subjects: [{ id: 1, name: "Test" }],
  subjectType: "user",
  selectedResource: "hr.roster",
  ancestorResourceKeys: [],
  directActionGrants: [{ subjectId: 1, resourceKey: "hr.roster", actionKey: "delete", resourceId: 1, scopeId: null }],
  positionActionGrants: [],
  departmentActionGrants: [],
  implicitActionGrants: [],
})[1];
assert.equal(impliedDeleteRecord.actionStates.delete.source, "direct", "direct delete should stay direct");
assert.equal(impliedDeleteRecord.actionStates.update.has, false, "delete should not imply update");
assert.equal(impliedDeleteRecord.actionStates.create.has, false, "delete should not imply create");
assert.equal(impliedDeleteRecord.actionStates.read.source, "implied", "delete-implied read should use implied source tone");
assert.equal(impliedDeleteRecord.actionStates.entry.source, "implied", "delete-implied entry should use implied source tone");

const childEntryRecord = buildPermissionRecords({
  subjects: [{ id: 1, name: "Test" }],
  subjectType: "user",
  selectedResource: "finance",
  ancestorResourceKeys: [],
  directActionGrants: [{ subjectId: 1, resourceKey: "finance.ledger", actionKey: "update", resourceId: 1, scopeId: null }],
  positionActionGrants: [],
  departmentActionGrants: [],
  implicitActionGrants: [],
  childResourceKeys: ["finance.ledger"],
})[1];
assert.equal(childEntryRecord.actionStates.entry.source, "child", "child resource grant should derive parent entry");
assert.equal(childEntryRecord.actionStates.entry.sourceActionKey, "update", "child entry should keep the source action for tracing");
assert.equal(childEntryRecord.actionStates.update.has, false, "child resource grant must not derive parent update");
assert.equal(permissionSourceTone(childEntryRecord.actionStates.entry.source), "yellow", "child-derived entry should be yellow");

const spaceEntryRecord = buildPermissionRecords({
  subjects: [{ id: 1, name: "Test" }],
  subjectType: "user",
  selectedResource: "work.projects",
  ancestorResourceKeys: [],
  directActionGrants: [],
  positionActionGrants: [],
  departmentActionGrants: [],
  implicitActionGrants: [{ subjectId: 1, resourceKey: "work.projects", actionKey: "entry", resourceId: 0, scopeId: null, source: "entry" }],
})[1];
assert.equal(spaceEntryRecord.actionStates.entry.source, "entry", "space/natural grant should derive an entry source");
assert.equal(permissionSourceTone(spaceEntryRecord.actionStates.entry.source), "yellow", "space-derived entry should be yellow");

const systemExactBeforeChildEntryRecord = buildPermissionRecords({
  subjects: [{ id: 1, name: "Test" }],
  subjectType: "user",
  selectedResource: "work",
  ancestorResourceKeys: [],
  directActionGrants: [],
  positionActionGrants: [],
  departmentActionGrants: [],
  implicitActionGrants: [
    { subjectId: 1, resourceKey: "work", actionKey: "entry", resourceId: 0, scopeId: null, source: "system" },
    { subjectId: 1, resourceKey: "work.tasks", actionKey: "entry", resourceId: 0, scopeId: null, source: "entry" },
  ],
  childResourceKeys: ["work.tasks"],
})[1];
assert.equal(systemExactBeforeChildEntryRecord.actionStates.entry.source, "system", "system exact entry should outrank child-derived entry");
assert.equal(permissionSourceTone(systemExactBeforeChildEntryRecord.actionStates.entry.source), "orange", "system exact entry should stay orange");

const departmentManagerSpaceRecord = buildPermissionRecords({
  subjects: [{ id: 1, name: "Test" }],
  subjectType: "user",
  selectedResource: "space.department.tasks",
  ancestorResourceKeys: ["space.department"],
  directActionGrants: [],
  positionActionGrants: [],
  departmentActionGrants: [],
  implicitActionGrants: departmentSpaceManagerActions.map((actionKey) => ({
    subjectId: 1,
    resourceKey: "space.department",
    actionKey,
    resourceId: 0,
    scopeId: "department:1",
    source: "system" as const,
  })),
  selectedScopeId: "department:1",
})[1];
assert.equal(departmentManagerSpaceRecord.actionStates.delete.has, true, "department-space manager should display delete on task space");
assert.equal(departmentManagerSpaceRecord.actionStates.approve.has, true, "department-space manager should display workflow actions on task space");
assert.equal(departmentManagerSpaceRecord.actionStates.grant.has, false, "department-space manager should not display grant from natural role");

const systemPriorityRecord = buildPermissionRecords({
  subjects: [{ id: 1, name: "Test", extra: { positionIds: [10] } }],
  subjectType: "user",
  selectedResource: "finance.cost",
  ancestorResourceKeys: [],
  directActionGrants: [],
  positionActionGrants: [{ subjectId: 10, resourceKey: "finance.cost", actionKey: "export", resourceId: 1, scopeId: null }],
  departmentActionGrants: [],
  implicitActionGrants: [{ subjectId: 1, resourceKey: "finance.cost", actionKey: "import", resourceId: 0, scopeId: null, source: "system" }],
})[1];
assert.equal(systemPriorityRecord.exchangeSummary?.source, "system", "summary source priority should be direct > system > organization > ancestor > entry");
assert.equal(permissionSourceTone(systemPriorityRecord.exchangeSummary?.source ?? null), "orange", "system source should be orange");

const exactPreferredRecord = buildPermissionRecords({
  subjects: [{ id: 1, name: "Test" }],
  subjectType: "user",
  selectedResource: "hr.roster",
  ancestorResourceKeys: [],
  directActionGrants: [
    { subjectId: 1, resourceKey: "hr.roster", actionKey: "delete", resourceId: 1, scopeId: null },
    { subjectId: 1, resourceKey: "hr.roster", actionKey: "create", resourceId: 1, scopeId: null },
  ],
  positionActionGrants: [],
  departmentActionGrants: [],
  implicitActionGrants: [],
})[1];
assert.equal(exactPreferredRecord.actionStates.create.source, "direct", "exact action grant should win over higher implied grant");
assert.equal(exactPreferredRecord.actionStates.create.sourceActionKey, null, "exact action grant should not show implied source action");

const projectSpaceRecord = buildPermissionRecords({
  subjects: [{ id: 1, name: "Test" }],
  subjectType: "user",
  selectedResource: "space.department.projects",
  ancestorResourceKeys: [],
  directActionGrants: [{ subjectId: 1, resourceKey: "space.department.projects", actionKey: "grant", resourceId: 1, scopeId: null }],
  positionActionGrants: [],
  departmentActionGrants: [],
  implicitActionGrants: [],
})[1];
const projectSpaceVisibleActions = new Set(projectSpaceRecord.actionTree.flatMap((group) => group.actions.map((action) => action.actionKey)));
assert.equal(projectSpaceVisibleActions.has("revise"), true, "space.department.projects should show supported revise action");
assert.equal(projectSpaceVisibleActions.has("export"), false, "space.department.projects should hide unsupported export action");
assert.equal(projectSpaceVisibleActions.has("archive"), false, "space.department.projects should hide unsupported archive action");
assert.equal(projectSpaceRecord.actionStates.grant.has, true, "space.department.projects grant action should show authorization");

const nonGrantManagerRecord = buildPermissionRecords({
  subjects: [{ id: 1, name: "Test" }],
  subjectType: "user",
  selectedResource: "space.department.projects",
  ancestorResourceKeys: [],
  directActionGrants: [{ subjectId: 1, resourceKey: "space.department.projects", actionKey: "grant", resourceId: 1, scopeId: null }],
  positionActionGrants: [],
  departmentActionGrants: [],
  implicitActionGrants: [],
  canMutateGrantAction: false,
})[1];
const grantManagerRecord = buildPermissionRecords({
  subjects: [{ id: 1, name: "Test" }],
  subjectType: "user",
  selectedResource: "space.department.projects",
  ancestorResourceKeys: [],
  directActionGrants: [{ subjectId: 1, resourceKey: "space.department.projects", actionKey: "grant", resourceId: 1, scopeId: null }],
  positionActionGrants: [],
  departmentActionGrants: [],
  implicitActionGrants: [],
  canMutateGrantAction: true,
})[1];
assert.equal(nonGrantManagerRecord.actionStates.grant.has, true, "grant should still display authorization");
assert.equal(nonGrantManagerRecord.actionStates.grant.directGrantable, false, "grant should be visible but locked without grant management");
assert.equal(nonGrantManagerRecord.actionStates.update.directGrantable, true, "business actions should keep normal direct grantability");
assert.equal(grantManagerRecord.actionStates.grant.directGrantable, true, "grant manager should be able to maintain grant");
assert.equal(grantManagerRecord.actionStates.update.directGrantable, true, "grant manager should be able to maintain business actions");

console.log("permission action catalog ok");
