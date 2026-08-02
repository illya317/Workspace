import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPermissionActionKnowledge,
  queryPermissionActionKnowledge,
} from "./permission-action-knowledge";

const knowledge = buildPermissionActionKnowledge();

test("permission action knowledge exposes one machine-readable record per supported permission", () => {
  const expectedPermissionCount = knowledge.resources
    .reduce((sum, resource) => sum + resource.supportedActions.length, 0);

  assert.equal(knowledge.schemaVersion, "1");
  assert.equal(knowledge.summary.permissionCount, expectedPermissionCount);
  assert.equal(knowledge.permissions.length, expectedPermissionCount);
  assert.equal(knowledge.actions.length, knowledge.summary.actionCount);
  assert.ok(knowledge.sourceFiles.includes("packages/platform/permission-resource-policy.ts"));
});

test("permission action knowledge resolves an exact permission and its BusinessAction bindings", () => {
  const result = queryPermissionActionKnowledge({ permissionKey: "finance.ledger.approve" }, knowledge);

  assert.equal(result.total, 1);
  assert.equal(result.permissions[0]?.resourceKey, "finance.ledger");
  assert.equal(result.permissions[0]?.actionKey, "approve");
  assert.equal(result.permissions[0]?.bindingCoverage, "registered");
  assert.ok(result.permissions[0]?.bindings.some((binding) => (
    binding.businessActionKey === "finance.ledger.groupAccount.review"
    && binding.routes.some((route) => route.path === "/api/modules/finance/ledger/group-accounts/:id/review")
  )));
});

test("permission action knowledge exposes authenticated system-default Docs access", () => {
  const companyRead = knowledge.permissions.find((permission) => permission.key === "docs.company.read");
  assert.equal(companyRead?.grantMode, "system_default");
  assert.match(companyRead?.grantDescription ?? "", /所有登录用户/);
});

test("permission action knowledge queries by BusinessAction, concrete route and readable text", () => {
  const byAction = queryPermissionActionKnowledge({
    businessActionKey: "finance.ledger.groupAccount.review",
  }, knowledge);
  const byRoute = queryPermissionActionKnowledge({
    route: "/api/modules/finance/ledger/group-accounts/42/review?from=agent",
  }, knowledge);
  const byText = queryPermissionActionKnowledge({ q: "复核集团科目" }, knowledge);

  assert.deepEqual(byAction.permissions.map((permission) => permission.key), ["finance.ledger.approve"]);
  assert.deepEqual(byRoute.permissions.map((permission) => permission.key), ["finance.ledger.approve"]);
  assert.ok(byText.permissions.some((permission) => permission.key === "finance.ledger.approve"));
});

test("permission action knowledge exposes stable pagination for catalog readers", () => {
  const first = queryPermissionActionKnowledge({ limit: 2 }, knowledge);
  const second = queryPermissionActionKnowledge({ offset: first.nextOffset ?? 0, limit: 2 }, knowledge);

  assert.equal(first.returned, 2);
  assert.equal(first.nextOffset, 2);
  assert.equal(second.query.offset, 2);
  assert.notEqual(first.permissions[0]?.key, second.permissions[0]?.key);
});
