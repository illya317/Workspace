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
