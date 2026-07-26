import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { createWorkspaceAnalysisSourceCatalog } from "@workspace/platform/server/workspace-analysis-source-registry";
import type { WorkspaceAnalysisSourceLoadRequest } from "@workspace/platform/server/workspace-analysis-runtime";

import { CAPITAL_SECURITIES_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS } from "./workspace-analysis-sources";

mock.module("server-only", { namedExports: {} } as never);
const calls: string[] = [];
mock.module("./workspace-analysis-source-access", { namedExports: {
  buildCapitalSecuritiesWorkspaceAnalysisSourceCatalog: () => createWorkspaceAnalysisSourceCatalog(CAPITAL_SECURITIES_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS),
  canDiscoverCapitalSecuritiesWorkspaceAnalysisSource: async () => true,
} } as never);
mock.module("./company-governance", { namedExports: {
  listCompanies: async () => { calls.push("companies"); return { companies: [{ code: "ZX01", name: "集团" }], total: 1 }; },
  listOwnershipInterests: async () => { calls.push("ownership"); return { interests: [{ ownerName: "股东甲", shareRatio: 0.5 }], total: 1 }; },
} } as never);
mock.module("@workspace/platform/server/organization-units", { namedExports: {
  listGovernanceOrganizations: async () => {
    calls.push("organizations");
    return {
      organizations: [{
        id: 1,
        code: "G1",
        name: "股东会",
        managerEmployeeIds: [7],
        managerEmployeeNames: ["张三"],
        descriptions: [{ id: 11, sourceFile: "governance.docx", codeRaw: null, details: { quorum: 2 } }],
      }],
      positions: [{ id: 2, code: "P1", name: "董事", managerOfDepartmentIds: [1] }],
    };
  },
} } as never);
mock.module("./investor-relationships", { namedExports: {
  getInvestorRelationshipView: async () => {
    calls.push("investors");
    return {
      companies: [{ code: "ZX01", name: "集团" }],
      shareholders: [{ name: "股东甲", shareRatio: 0.5 }],
      events: [{
        id: 3,
        sequence: 1,
        eventName: "A轮",
        effectiveDate: "2026-01-01",
        recordStatus: "confirmed",
        registeredCapitalAfterYuan: 100,
        transactions: [{
          id: 4,
          sequence: 1,
          fromPartyId: null,
          fromPartyName: null,
          toPartyId: 5,
          toPartyName: "股东甲",
          registeredCapitalAmountYuan: 100,
          considerationAmountYuan: 200,
          sourceReference: "决议",
          notes: null,
        }],
      }],
      captableRounds: [{ label: "A轮", totalRegisteredCapitalYuan: 100 }],
      captableRows: [{ partyId: 5, name: "股东甲", positions: [{ eventId: 3, subscribedCapitalYuan: 100, shareRatio: 0.5 }] }],
      financingRounds: [{
        eventId: 3,
        sequence: 1,
        label: "A轮",
        effectiveDate: "2026-01-01",
        recordStatus: "confirmed",
        kind: "primary",
        postMoneyValuationYuan: 1_000,
        contributions: [{ partyId: 5, partyName: "股东甲", registeredCapitalAmountYuan: 100, considerationAmountYuan: 200 }],
      }],
      ownershipStructure: {
        nodes: [{ key: "party:5", entityPartyId: 5, companyId: null, label: "股东甲", subtitle: null, role: "shareholder", layoutOrder: 1 }],
        edges: [{ key: "edge:5", source: "party:5", target: "company:1", shareRatio: 0.5, previousShareRatio: null, recordStatus: "confirmed", relationType: "share_capital", isConsolidated: false }],
      },
    };
  },
} } as never);

const { loadCapitalSecuritiesWorkspaceAnalysisSource } = await import("./workspace-analysis-source-executor");

test("capital owner dispatches all stable tabular projections and strips nested composites", async () => {
  calls.length = 0;
  const cases = [
    ["capital-securities.companies", ["code", "name"]],
    ["capital-securities.ownership-interests", ["ownerName", "shareRatio"]],
    ["capital-securities.organizations", ["code", "name"]],
    ["capital-securities.organization-descriptions", ["organizationCode", "path", "numberValue"]],
    ["capital-securities.organization-managers", ["organizationCode", "employeeId", "employeeName"]],
    ["capital-securities.governance-positions", ["code", "name"]],
    ["capital-securities.governance-position-managements", ["positionCode", "managedOrganizationId"]],
    ["capital-securities.investor-companies", ["code", "name"]],
    ["capital-securities.shareholders", ["name", "shareRatio"]],
    ["capital-securities.share-capital-events", ["eventName", "registeredCapitalAfterYuan"]],
    ["capital-securities.share-capital-transactions", ["eventName", "toPartyName", "registeredCapitalAmountYuan"]],
    ["capital-securities.captable-rounds", ["label", "totalRegisteredCapitalYuan"]],
    ["capital-securities.captable-positions", ["partyName", "eventId", "shareRatio"]],
    ["capital-securities.financing-rounds", ["label", "postMoneyValuationYuan"]],
    ["capital-securities.financing-contributions", ["roundLabel", "partyName", "considerationAmountYuan"]],
    ["capital-securities.ownership-structure-nodes", ["key", "label", "role"]],
    ["capital-securities.ownership-structure-edges", ["key", "shareRatio", "relationType"]],
  ] as const;
  for (const [sourceKey, fields] of cases) {
    const result = await loadCapitalSecuritiesWorkspaceAnalysisSource(request(sourceKey, [...fields]));
    assert.deepEqual(Object.keys(result.rows[0] ?? {}), [...fields]);
    assert.equal(JSON.stringify(result).includes("secret"), false);
  }
  assert.deepEqual(calls, [
    "companies",
    "ownership",
    "organizations",
    "organizations",
    "organizations",
    "organizations",
    "organizations",
    "investors",
    "investors",
    "investors",
    "investors",
    "investors",
    "investors",
    "investors",
    "investors",
    "investors",
    "investors",
  ]);
});

function request(sourceKey: string, fields: string[]): WorkspaceAnalysisSourceLoadRequest {
  return {
    requesterId: 7, targetType: "department", targetId: 3, ownerUnitId: "capital-securities",
    sourceKey, sourceVersion: 1, parameters: {}, fields,
    limits: { maxRows: 100, maxGroups: 20, pageSize: 100, maxPages: 1, maxBytes: 100_000, timeoutMs: 1_000 },
    signal: new AbortController().signal,
  };
}
