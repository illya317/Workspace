import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { createWorkspaceAnalysisSourceCatalog } from "@workspace/platform/server/workspace-analysis-source-registry";
import type { WorkspaceAnalysisSourceLoadRequest } from "@workspace/platform/server/workspace-analysis-runtime";

import { EXTERNAL_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS } from "./workspace-analysis-sources";

mock.module("server-only", { namedExports: {} } as never);
const calls: unknown[] = [];
mock.module("./workspace-analysis-source-access", { namedExports: {
  buildExternalWorkspaceAnalysisSourceCatalog: () => createWorkspaceAnalysisSourceCatalog(EXTERNAL_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS),
  canDiscoverExternalWorkspaceAnalysisSource: async () => true,
} } as never);
mock.module("./external-party-service", { namedExports: {
  listExternalParties: async (input: { category: string }) => {
    calls.push(input);
    return { items: [{ id: 3, code: "P003", category: input.category, name: input.category === "customer" ? "客户甲" : "供应商乙", identityNumber: "secret", roles: ["customer", "supplier"] }], total: 1 };
  },
} } as never);
mock.module("./related-parties", { namedExports: {
  listExternalRelatedParties: async (input: unknown) => {
    calls.push(input);
    return { items: [{ id: 8, name: "关联方甲", relatedPartyType: "group", identityNumber: "related-secret", roles: ["customer"] }], total: 1 };
  },
} } as never);

const { loadExternalWorkspaceAnalysisSource } = await import("./workspace-analysis-source-executor");

test("external owner preserves requester object visibility and separates customer/supplier", async () => {
  calls.length = 0;
  const customer = await loadExternalWorkspaceAnalysisSource(request("external.customers"));
  const supplier = await loadExternalWorkspaceAnalysisSource(request("external.suppliers"));

  assert.deepEqual(customer.rows, [{ category: "customer", name: "客户甲", identityNumber: "secret" }]);
  assert.deepEqual(supplier.rows, [{ category: "supplier", name: "供应商乙", identityNumber: "secret" }]);
  assert.deepEqual(calls, [
    { category: "customer", userId: 7, keyword: "甲", page: 1, pageSize: 100 },
    { category: "supplier", userId: 7, keyword: "甲", page: 1, pageSize: 100 },
  ]);
  assert.equal(JSON.stringify(customer).includes("roles"), false);
});

test("external owner normalizes every permission-filtered party role instead of dropping the array", async () => {
  calls.length = 0;
  const roles = await loadExternalWorkspaceAnalysisSource(request(
    "external.customer-roles",
    ["rowKey", "partyId", "sourceCategory", "role"],
  ));

  assert.deepEqual(roles.rows, [
    { rowKey: "customer:3:customer", partyId: 3, sourceCategory: "customer", role: "customer" },
    { rowKey: "customer:3:supplier", partyId: 3, sourceCategory: "customer", role: "supplier" },
  ]);
  assert.deepEqual(calls, [
    { category: "customer", userId: 7, keyword: "甲", page: 1, pageSize: 500 },
  ]);
});

test("external owner loads the independent related-party directory without exposing role arrays", async () => {
  calls.length = 0;
  const result = await loadExternalWorkspaceAnalysisSource(request(
    "external.related-parties",
    ["name", "relatedPartyType", "identityNumber"],
  ));

  assert.deepEqual(result.rows, [{ name: "关联方甲", relatedPartyType: "group", identityNumber: "related-secret" }]);
  assert.deepEqual(calls, [{ keyword: "甲", relatedPartyType: undefined, asOfDate: undefined, page: 1, pageSize: 100 }]);
  assert.equal(JSON.stringify(result).includes("roles"), false);
});

function request(
  sourceKey: string,
  fields: readonly string[] = ["category", "name", "identityNumber"],
): WorkspaceAnalysisSourceLoadRequest {
  return {
    requesterId: 7, targetType: "project", targetId: 10, ownerUnitId: "external",
    sourceKey, sourceVersion: 1, parameters: { keyword: "甲" }, fields,
    limits: { maxRows: 100, maxGroups: 20, pageSize: 100, maxPages: 2, maxBytes: 100_000, timeoutMs: 1_000 },
    signal: new AbortController().signal,
  };
}
