import assert from "node:assert/strict";
import type { ActionContractMetadata } from "../../packages/platform/action-contract";
import { listActionContractRouteBindingIssues } from "../../packages/platform/action-contract-route-binding";
import type { BusinessActionRegistration } from "../../packages/platform/business-action-registry";

const action = (key: string, paths: string[]): BusinessActionRegistration => ({
  key,
  label: key,
  moduleKey: "test",
  resourceKey: "test.records",
  writeKind: "save",
  targetKind: "TestRecord",
  eligibility: "permission_only",
  apiRoutes: paths.map((path) => ({ method: "POST", path })),
});

const contract = (key: string, directRoutes: string[], workflowRoutes: string[] = []): ActionContractMetadata => ({
  key,
  version: 1,
  kind: "write",
  label: key,
  targetKind: "TestRecord",
  resource: { resourceKey: "test.records", directPermissionAction: "update" },
  payload: { cardinality: "single", shape: "field_patch", target: "existing_record" },
  persistence: { strategy: "active_table_state", activeEntity: "TestRecord", supportedPersistenceModes: ["active"], defaultMode: "active", commitMode: "apply_patch" },
  domain: { validatorKey: "packages/test.validate", commitKey: "packages/test.commit" },
  api: { directRoutes, workflowRoutes, envelopeVersion: 1 },
  workflow: { kind: "not_applicable", reason: "fixture" },
  display: { titleTemplate: key },
});

assert.deepEqual(listActionContractRouteBindingIssues(
  [action("test.save", ["/api/modules/test/records"])],
  [contract("test.save", ["POST /api/modules/test/records"])],
), []);

assert.match(listActionContractRouteBindingIssues(
  [action("test.save", ["/api/modules/test/records"])],
  [contract("test.save", [])],
)[0] ?? "", /BusinessAction route missing from Contract/);

assert.match(listActionContractRouteBindingIssues(
  [action("test.save", ["/api/modules/test/records"])],
  [contract("test.save", ["POST /api/modules/test/other"])],
)[1] ?? "", /Contract command\/direct route missing from BusinessAction/);

assert.deepEqual(listActionContractRouteBindingIssues(
  [action("test.save", ["/api/modules/test/records"])],
  [contract("test.save", ["POST /api/modules/test/records"], ["POST /api/modules/test/submissions/:id/approve"])],
), [], "shared workflow lifecycle routes may extend the direct BusinessAction route set");

assert.deepEqual(listActionContractRouteBindingIssues(
  [action("test.first", ["/api/modules/test/dispatch"]), action("test.second", ["/api/modules/test/dispatch"])],
  [contract("test.first", ["POST /api/modules/test/dispatch"]), contract("test.second", ["POST /api/modules/test/dispatch"])],
), [], "each action in a typed multi-action dispatcher must bind the shared route explicitly");

process.stdout.write("ActionContract route binding fixtures passed.\n");

