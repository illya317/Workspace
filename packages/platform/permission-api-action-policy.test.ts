import assert from "node:assert/strict";
import test from "node:test";

import { getActionContractMetadata } from "./action-contract-registry";
import { getBusinessActionRegistration } from "./business-action-registry";
import { FINANCE_ASSET_CANONICAL_ACTION_DEFINITIONS } from "./business-action-finance-assets-interface";
import { resolvePermissionApiActionPolicy } from "./permission-api-action-policy";

function resolve(apiPath: string) {
  return resolvePermissionApiActionPolicy({
    method: "POST",
    apiPath,
    resourceKey: "work.projects",
  });
}

function resolveGet(apiPath: string, resourceKey: string) {
  return resolvePermissionApiActionPolicy({ method: "GET", apiPath, resourceKey });
}

function resolvePut(apiPath: string, resourceKey: string) {
  return resolvePermissionApiActionPolicy({ method: "PUT", apiPath, resourceKey });
}

function resolveDelete(apiPath: string, resourceKey: string) {
  return resolvePermissionApiActionPolicy({ method: "DELETE", apiPath, resourceKey });
}

test("Work project initiation authorizes against its submit capability", () => {
  assert.deepEqual(resolve("/api/modules/work/projects"), {
    resourceKey: "work.projects.initiate",
    requiredActions: ["submit"],
    runtimeEnforcement: "gateway",
    scopeId: null,
    projection: "default",
    notes: "Project initiation requires the work.projects.initiate submit capability; Work rechecks the exact action and active-employee eligibility before an approval draft can be created.",
  });

  const action = getBusinessActionRegistration("work.projects.project.create");
  const contract = getActionContractMetadata("work.projects.project.create");
  assert.equal(action?.resourceKey, "work.projects.initiate");
  assert.equal(action?.submitPermissionAction, "submit");
  assert.equal(action?.processPermissionAction, undefined);
  assert.equal(contract?.resource.resourceKey, "work.projects.initiate");
  assert.equal(contract?.resource.submitPermissionAction, "submit");
  assert.equal(contract?.resource.processPermissionAction, undefined);
});

test("Work project submission processing stays service-delegated to request handlers", () => {
  const cases = [
    ["approve", "approve"],
    ["reject", "reject"],
    ["comment", "read"],
  ] as const;

  for (const [routeAction, permissionAction] of cases) {
    const policy = resolve(`/api/modules/work/projects/submissions/17/${routeAction}`);
    assert.equal(policy.resourceKey, "work.projects");
    assert.deepEqual(policy.requiredActions, [permissionAction]);
    assert.equal(policy.runtimeEnforcement, "serviceDelegated");
  }
});

test("Project notification rule APIs stay service-delegated with their project actions", () => {
  for (const [method, apiPath, requiredAction] of [
    ["POST", "/api/modules/work/projects/17/notification-rules", "update"],
    ["PUT", "/api/modules/work/projects/17/notification-rules/23", "update"],
    ["POST", "/api/modules/work/projects/17/notification-rules/23/preview", "read"],
    ["POST", "/api/modules/work/projects/17/notification-rules/23/publish", "update"],
    ["POST", "/api/modules/work/projects/17/notification-rules/23/archive", "update"],
    ["POST", "/api/modules/work/projects/17/notification-signals/redrive", "update"],
  ] as const) {
    const policy = resolvePermissionApiActionPolicy({
      method,
      apiPath,
      resourceKey: "work.projects",
    });
    assert.equal(policy.resourceKey, "work.projects");
    assert.deepEqual(policy.requiredActions, [requiredAction]);
    assert.equal(policy.runtimeEnforcement, "serviceDelegated");
  }

  const action = getBusinessActionRegistration("work.projects.notificationSignal.redrive");
  const contract = getActionContractMetadata("work.projects.notificationSignal.redrive");
  assert.equal(action?.writeKind, "revise");
  assert.equal(action?.directPermissionAction, "update");
  assert.deepEqual(action?.apiRoutes, [{
    method: "POST",
    path: "/api/modules/work/projects/:id/notification-signals/redrive",
  }]);
  assert.equal(contract?.kind, "lifecycle");
  assert.equal(contract?.lifecycle?.operation, "custom");
  assert.equal(contract?.lifecycle?.targetIdKey, "signalId");
  assert.equal(contract?.lifecycle?.versionKey, "expectedAttemptCount");
  assert.deepEqual(contract?.payload.changeFields, [{
    field: "reason",
    label: "重试原因",
    required: true,
  }]);
});

test("Work cycle and flow settings authorize against their configure capability", () => {
  for (const policy of [
    resolveGet("/api/modules/work/tasks/okr-control", "work.tasks"),
    resolvePut("/api/modules/work/tasks/okr-control", "work.tasks"),
  ]) {
    assert.equal(policy.resourceKey, "work.tasks.cycleFlow");
    assert.deepEqual(policy.requiredActions, ["configure"]);
    assert.equal(policy.runtimeEnforcement, "gateway");
  }

  const action = getBusinessActionRegistration("work.tasks.okr_control.save");
  const contract = getActionContractMetadata("work.tasks.okr_control.save");
  assert.equal(action?.resourceKey, "work.tasks.cycleFlow");
  assert.equal(action?.directPermissionAction, "configure");
  assert.equal(contract?.resource.resourceKey, "work.tasks.cycleFlow");
  assert.equal(contract?.resource.directPermissionAction, "configure");
});

test("ERP diligence evidence deletion uses submission update permission", () => {
  const policy = resolveDelete(
    "/api/modules/administration/erp-diligence/attachments/attachment-uid",
    "administration.erpDiligence",
  );
  assert.equal(policy.resourceKey, "administration.erpDiligence");
  assert.deepEqual(policy.requiredActions, ["update"]);
  assert.equal(policy.runtimeEnforcement, "gateway");
});

test("Contract archive uses archive permission instead of create", () => {
  const policy = resolvePermissionApiActionPolicy({
    method: "POST",
    apiPath: "/api/modules/administration/contracts/17/archive",
    resourceKey: "administration.contracts",
  });
  assert.equal(policy.resourceKey, "administration.contracts");
  assert.deepEqual(policy.requiredActions, ["archive"]);
});

test("Contract archive package separates read access from post-approval record updates", () => {
  const readPaths = [
    "/api/modules/administration/contracts/17/package",
    "/api/modules/administration/contracts/17/attachments/00000000-0000-4000-8000-000000000001/download",
  ];
  for (const apiPath of readPaths) {
    const policy = resolveGet(apiPath, "administration.contracts");
    assert.equal(policy.resourceKey, "administration.contracts");
    assert.deepEqual(policy.requiredActions, ["read"]);
  }

  for (const [method, apiPath] of [
    ["POST", "/api/modules/administration/contracts/17/attachments"],
    ["POST", "/api/modules/administration/contracts/17/records"],
    ["POST", "/api/modules/administration/contracts/17/attachments/00000000-0000-4000-8000-000000000001/remove"],
    ["PUT", "/api/modules/administration/contracts/17/approval-reference"],
  ] as const) {
    const policy = resolvePermissionApiActionPolicy({ method, apiPath, resourceKey: "administration.contracts" });
    assert.equal(policy.resourceKey, "administration.contracts");
    assert.deepEqual(policy.requiredActions, ["update"]);
  }
});

test("Finance statement workbook downloads require export rather than ordinary read", () => {
  for (const apiPath of [
    "/api/modules/finance/statements/reports/export",
    "/api/modules/finance/statements/consolidation/batches/22/report/export",
  ]) {
    const policy = resolveGet(apiPath, "finance.statements");
    assert.equal(policy.resourceKey, "finance.statements");
    assert.deepEqual(policy.requiredActions, ["export"]);
    assert.equal(policy.runtimeEnforcement, "gateway");
  }
});

test("Finance ledger workbook downloads require export rather than ordinary read", () => {
  const policy = resolveGet("/api/modules/finance/ledger/export", "finance.ledger");
  assert.equal(policy.resourceKey, "finance.ledger");
  assert.deepEqual(policy.requiredActions, ["export"]);
  assert.equal(policy.runtimeEnforcement, "gateway");
});

test("Finance asset accounting uses its own write and export permissions", () => {
  for (const [method, apiPath, requiredAction, runtimeEnforcement] of [
    ["POST", "/api/modules/finance/assets/periods/replay-preview", "read", "gateway"],
    ["POST", "/api/modules/finance/assets", "create", "serviceDelegated"],
    ["PUT", "/api/modules/finance/assets", "update", "gateway"],
    ["PUT", "/api/modules/finance/assets/policies", "update", "gateway"],
    ["DELETE", "/api/modules/finance/assets/policies", "update", "gateway"],
    ["POST", "/api/modules/finance/assets/periods/recalculate", "revise", "gateway"],
    ["PUT", "/api/modules/finance/assets/periods/voucher-link", "revise", "gateway"],
    ["POST", "/api/modules/finance/assets/acquisition-evidence", "revise", "gateway"],
    ["PUT", "/api/modules/finance/assets/impairment-assessment", "revise", "gateway"],
    ["POST", "/api/modules/finance/assets/disposals", "revise", "gateway"],
    ["GET", "/api/modules/finance/assets/export", "export", "gateway"],
  ] as const) {
    const policy = resolvePermissionApiActionPolicy({ method, apiPath, resourceKey: "finance.assets" });
    assert.equal(policy.resourceKey, "finance.assets");
    assert.deepEqual(policy.requiredActions, [requiredAction]);
    assert.equal(policy.runtimeEnforcement, runtimeEnforcement);
  }

  assert.equal(new Set(FINANCE_ASSET_CANONICAL_ACTION_DEFINITIONS.map(({ registration }) => registration.key)).size, FINANCE_ASSET_CANONICAL_ACTION_DEFINITIONS.length);
  for (const definition of FINANCE_ASSET_CANONICAL_ACTION_DEFINITIONS) {
    assert.deepEqual(getBusinessActionRegistration(definition.registration.key), definition.registration);
    assert.deepEqual(getActionContractMetadata(definition.registration.key), definition.contract);
  }

  const deleteAction = getBusinessActionRegistration("finance.assets.categoryPolicy.delete");
  const deleteContract = getActionContractMetadata("finance.assets.categoryPolicy.delete");
  assert.equal(deleteAction?.writeKind, "delete");
  assert.equal(deleteAction?.directPermissionAction, "update");
  assert.deepEqual(deleteAction?.apiRoutes, [{ method: "DELETE", path: "/api/modules/finance/assets/policies" }]);
  assert.equal(deleteContract?.kind, "lifecycle");
  assert.equal(deleteContract?.resource.directPermissionAction, "update");
  assert.equal(
    deleteContract?.domain && "validatorKey" in deleteContract.domain
      ? deleteContract.domain.validatorKey
      : undefined,
    "packages/finance/server/assets/route-commands.buildDeleteFinanceAssetCategoryPolicyRouteCommand",
  );
});

test("Finance treasury and tax workspace routes use their own read and write permissions", () => {
  for (const [resourceKey, apiPath] of [
    ["finance.treasury", "/api/modules/finance/treasury"],
    ["finance.tax", "/api/modules/finance/tax"],
  ] as const) {
    for (const [method, requiredAction] of [
      ["GET", "read"],
      ["POST", "create"],
      ["PUT", "update"],
    ] as const) {
      const policy = resolvePermissionApiActionPolicy({ method, apiPath, resourceKey });
      assert.equal(policy.resourceKey, resourceKey);
      assert.deepEqual(policy.requiredActions, [requiredAction]);
      assert.equal(policy.runtimeEnforcement, "gateway");
    }
  }
});

test("Finance treasury interest workbook downloads require export rather than ordinary read", () => {
  const policy = resolveGet("/api/modules/finance/treasury/export", "finance.treasury");
  assert.equal(policy.resourceKey, "finance.treasury");
  assert.deepEqual(policy.requiredActions, ["export"]);
  assert.equal(policy.runtimeEnforcement, "gateway");

  const action = getBusinessActionRegistration("finance.treasury.interest.export");
  const contract = getActionContractMetadata("finance.treasury.interest.export");
  assert.equal(action?.writeKind, "export");
  assert.equal(action?.directPermissionAction, "export");
  assert.deepEqual(action?.apiRoutes, [{ method: "GET", path: "/api/modules/finance/treasury/export" }]);
  assert.equal(contract?.kind, "exchange");
  assert.equal(contract?.exchange?.direction, "export");
  assert.equal(contract?.resource.directPermissionAction, "export");
  assert.deepEqual(contract?.domain && "bindings" in contract.domain ? contract.domain.bindings : undefined, [{
    validatorKey: "packages/finance/server/treasury/export-route-commands.buildTreasuryInterestExportCommand",
    executeKey: "packages/finance/server/treasury/export-route-commands.executeTreasuryInterestExportCommand",
  }]);
});

test("Finance close workspace separates read, open, refresh, and complete permissions", () => {
  for (const [method, apiPath, requiredAction] of [
    ["GET", "/api/modules/finance/ledger/closing", "read"],
    ["POST", "/api/modules/finance/ledger/closing", "create"],
    ["POST", "/api/modules/finance/ledger/closing/refresh", "update"],
    ["POST", "/api/modules/finance/ledger/closing/complete", "approve"],
  ] as const) {
    const policy = resolvePermissionApiActionPolicy({ method, apiPath, resourceKey: "finance.ledger" });
    assert.equal(policy.resourceKey, "finance.ledger");
    assert.deepEqual(policy.requiredActions, [requiredAction]);
    assert.equal(policy.runtimeEnforcement, "gateway");
  }
});

test("Operational analysis lifecycle separates published reads from configure-only preview and state changes", () => {
  const base = "/api/modules/finance/cost/operational-analytics/spaces/department/12/templates/31";
  for (const [method, suffix] of [["GET", "lifecycle"], ["POST", "preview"], ["POST", "lifecycle"]] as const) {
    const policy = resolvePermissionApiActionPolicy({
      method,
      apiPath: `${base}/${suffix}`,
      resourceKey: "finance.operationalAnalytics",
    });
    assert.equal(policy.resourceKey, "space.department.analytics");
    assert.deepEqual(policy.requiredActions, ["configure"]);
    assert.equal(policy.runtimeEnforcement, "serviceDelegated");
    assert.equal(policy.scopeId, "department:12");
    assert.equal(policy.projection, "space");
  }

  const runtime = resolvePermissionApiActionPolicy({
    method: "POST",
    apiPath: `${base}/runtime`,
    resourceKey: "finance.operationalAnalytics",
  });
  assert.deepEqual(runtime.requiredActions, ["read"]);
});

test("Operational analysis standard draft API resolves concrete-space configure policy", () => {
  const collection = "/api/modules/finance/cost/operational-analytics/spaces/department/12/templates";
  const item = `${collection}/31`;
  for (const [method, apiPath] of [["POST", collection], ["GET", item], ["PUT", item]] as const) {
    const policy = resolvePermissionApiActionPolicy({
      method,
      apiPath,
      resourceKey: "finance.operationalAnalytics",
    });
    assert.equal(policy.resourceKey, "space.department.analytics");
    assert.deepEqual(policy.requiredActions, ["configure"]);
    assert.equal(policy.runtimeEnforcement, "serviceDelegated");
    assert.equal(policy.scopeId, "department:12");
    assert.equal(policy.projection, "space");
  }

  const catalog = resolvePermissionApiActionPolicy({
    method: "GET",
    apiPath: collection,
    resourceKey: "finance.operationalAnalytics",
  });
  assert.deepEqual(catalog.requiredActions, ["read"]);
  assert.equal(catalog.scopeId, "department:12");

  const sourceDiscovery = resolvePermissionApiActionPolicy({
    method: "GET",
    apiPath: "/api/modules/finance/cost/operational-analytics/spaces/department/12/sources/discover",
    resourceKey: "finance.operationalAnalytics",
  });
  assert.deepEqual(sourceDiscovery.requiredActions, ["read"]);
  assert.equal(sourceDiscovery.scopeId, "department:12");

  const templateContract = resolvePermissionApiActionPolicy({
    method: "GET",
    apiPath: "/api/modules/finance/cost/operational-analytics/spaces/department/12/templates/contract",
    resourceKey: "finance.operationalAnalytics",
  });
  assert.deepEqual(templateContract.requiredActions, ["configure"]);
  assert.equal(templateContract.scopeId, "department:12");
});

test("personal notification subscription writes use account read and are Agent-discoverable", async () => {
  const path = "/api/modules/settings/account/notification-subscriptions/approval.request.submitted";
  for (const policy of [
    resolvePut(path, "settings.account"),
    resolveDelete(path, "settings.account"),
  ]) {
    assert.deepEqual(policy.requiredActions, ["read"]);
    assert.equal(policy.runtimeEnforcement, "gateway");
  }

  const action = getBusinessActionRegistration("settings.account.notificationSubscription.save");
  const contract = getActionContractMetadata("settings.account.notificationSubscription.save");
  assert.equal(action?.resourceKey, "settings.account");
  assert.equal(action?.directPermissionAction, "read");
  assert.equal(contract?.persistence?.activeEntity, "NotificationSubscription");

  const { buildPersonalApiCatalog } = await import("./server/personal-api-catalog");
  const catalog = buildPersonalApiCatalog();
  assert.equal(catalog.contracts.some((item) => item.pathPrefix === "/api/modules/settings/account/notification-subscriptions"), true);
  assert.equal(catalog.mutations.some((item) => item.key === "settings.account.notificationSubscription.save"), true);
});

test("relation policy governance uses explicit read and configure actions", () => {
  const apiPath = "/api/settings/governance/relation-policies";
  for (const [method, requiredAction] of [["GET", "read"], ["PATCH", "configure"]] as const) {
    const policy = resolvePermissionApiActionPolicy({
      method,
      apiPath,
      resourceKey: "settings.governance",
    });
    assert.equal(policy.resourceKey, "settings.governance");
    assert.deepEqual(policy.requiredActions, [requiredAction]);
    assert.equal(policy.runtimeEnforcement, "serviceDelegated");
    assert.match(policy.notes ?? "", /root users/);
  }
});

test("governance operations records require the explicit audit action", () => {
  const policy = resolvePermissionApiActionPolicy({
    method: "GET",
    apiPath: "/api/modules/settings/governance/operations",
    resourceKey: "settings.governance",
  });
  assert.equal(policy.resourceKey, "settings.governance");
  assert.deepEqual(policy.requiredActions, ["audit"]);
  assert.equal(policy.runtimeEnforcement, "gateway");
  assert.match(policy.notes ?? "", /explicit/);
});

test("SQL setting operations require governance configure", () => {
  const policy = resolvePermissionApiActionPolicy({
    method: "PATCH",
    apiPath: "/api/settings/governance/sql-settings",
    resourceKey: "settings.governance",
  });
  assert.equal(policy.resourceKey, "settings.governance");
  assert.deepEqual(policy.requiredActions, ["configure"]);
  assert.equal(policy.runtimeEnforcement, "serviceDelegated");
  assert.match(policy.notes ?? "", /never executes privileged SQL/);
});
