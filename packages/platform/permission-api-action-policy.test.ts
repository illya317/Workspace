import assert from "node:assert/strict";
import test from "node:test";

import { getActionContractMetadata } from "./action-contract-registry";
import { getBusinessActionRegistration } from "./business-action-registry";
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
