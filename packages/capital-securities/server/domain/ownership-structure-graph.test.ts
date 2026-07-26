import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOwnershipStructureGraph,
  type OwnershipStructureCompanyInput,
  type OwnershipStructureInterestInput,
} from "./ownership-structure-graph";

const companies: OwnershipStructureCompanyInput[] = [
  { id: 1, partyId: 10, code: "01", name: "示例集团", fullName: "示例集团有限公司" },
  { id: 2, partyId: 20, code: "02", name: "投资公司", fullName: null },
  { id: 3, partyId: 30, code: "03", name: "全资子公司", fullName: null, description: "注册地上海。行政、总部、小试。" },
  { id: 4, partyId: 40, code: "04", name: "控股子公司", fullName: null },
  { id: 5, partyId: 50, code: "05", name: "参股子公司", fullName: null },
  { id: 6, partyId: 60, code: "06", name: "孙公司", fullName: null },
];

function interest(input: Partial<OwnershipStructureInterestInput> & Pick<OwnershipStructureInterestInput, "id" | "ownerPartyId" | "ownerName" | "issuerCompanyId" | "shareRatio">): OwnershipStructureInterestInput {
  return {
    isConsolidated: false,
    effectiveFrom: null,
    effectiveTo: null,
    recordStatus: "confirmed",
    ...input,
  };
}

test("the graph keeps the fixed focus and places partial subsidiaries around wholly owned branches", () => {
  const graph = buildOwnershipStructureGraph({
    asOf: "2026-07-25",
    rootCompany: companies[0] as OwnershipStructureCompanyInput,
    companies,
    totalRegisteredCapitalYuan: 100,
    shareholders: [{
      partyId: 20,
      name: "投资公司",
      confirmedSubscribedCapitalYuan: 40,
      pendingCapitalDeltaYuan: 0,
    }],
    interests: [
      interest({ id: 1, ownerPartyId: 10, ownerName: "示例集团", issuerCompanyId: 3, shareRatio: 1 }),
      interest({ id: 2, ownerPartyId: 10, ownerName: "示例集团", issuerCompanyId: 4, shareRatio: 0.6 }),
      interest({ id: 3, ownerPartyId: 20, ownerName: "投资公司", issuerCompanyId: 4, shareRatio: 0.4 }),
      interest({ id: 4, ownerPartyId: 10, ownerName: "示例集团", issuerCompanyId: 5, shareRatio: 0.4 }),
      interest({ id: 5, ownerPartyId: 99, ownerName: "外部股东", issuerCompanyId: 5, shareRatio: 0.6 }),
    ],
  });

  assert.equal(graph.rootNodeKey, "focus-company:1");
  assert.deepEqual(
    graph.nodes.filter((node) => node.role === "subsidiary").map((node) => node.companyId),
    [4, 3, 5],
  );
  assert.equal(graph.edges.find((edge) => edge.key === "share-capital:20")?.shareRatio, 0.4);
  const duplicatedInvestorNodes = graph.nodes.filter((node) => node.entityPartyId === 20);
  assert.deepEqual(duplicatedInvestorNodes.map((node) => node.role), ["shareholder", "co_owner"]);
  assert.notEqual(duplicatedInvestorNodes[0]?.key, duplicatedInvestorNodes[1]?.key);
});

test("subsidiary relations recurse and use only the relation effective on the selected date", () => {
  const graph = buildOwnershipStructureGraph({
    asOf: "2026-07-25",
    rootCompany: companies[0] as OwnershipStructureCompanyInput,
    companies,
    totalRegisteredCapitalYuan: 100,
    shareholders: [],
    interests: [
      interest({
        id: 1,
        ownerPartyId: 10,
        ownerName: "示例集团",
        issuerCompanyId: 3,
        shareRatio: 0.5,
        effectiveTo: new Date("2025-12-31T23:59:59.999Z"),
      }),
      interest({
        id: 2,
        ownerPartyId: 10,
        ownerName: "示例集团",
        issuerCompanyId: 3,
        shareRatio: 1,
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      }),
      interest({ id: 3, ownerPartyId: 30, ownerName: "全资子公司", issuerCompanyId: 6, shareRatio: 1 }),
    ],
  });

  const rootEdge = graph.edges.find((edge) => edge.source === graph.rootNodeKey);
  assert.equal(rootEdge?.shareRatio, 1);
  assert.equal(graph.nodes.find((node) => node.companyId === 3)?.subtitle, "注册地上海。行政、总部、小试。");
  assert.ok(graph.nodes.some((node) => node.companyId === 6 && node.role === "subsidiary"));
});

test("an ownership period remains active through its effective-to date", () => {
  const graph = buildOwnershipStructureGraph({
    asOf: "2026-06-17",
    rootCompany: { id: 1, partyId: 101, code: "ZX01", name: "主角", fullName: null },
    companies: [
      { id: 1, partyId: 101, code: "01", name: "主角", fullName: null },
      { id: 2, partyId: 102, code: "02", name: "子公司", fullName: null },
    ],
    shareholders: [],
    totalRegisteredCapitalYuan: 0,
    interests: [{
      id: 1,
      ownerPartyId: 101,
      ownerName: "主角",
      issuerCompanyId: 2,
      shareRatio: 1,
      isConsolidated: true,
      effectiveFrom: new Date("2020-01-01T00:00:00.000Z"),
      effectiveTo: new Date("2026-06-17T00:00:00.000Z"),
      recordStatus: "confirmed",
    }],
  });
  assert.equal(graph.edges.filter((edge) => edge.relationType === "ownership_interest").length, 1);
});

test("pending root and subsidiary changes expose previous and projected ratios", () => {
  const graph = buildOwnershipStructureGraph({
    asOf: "2026-07-25",
    rootCompany: companies[0] as OwnershipStructureCompanyInput,
    companies,
    totalRegisteredCapitalYuan: 100,
    shareholders: [{
      partyId: 20,
      name: "投资公司",
      confirmedSubscribedCapitalYuan: 40,
      pendingCapitalDeltaYuan: 10,
    }],
    interests: [
      interest({ id: 1, ownerPartyId: 10, ownerName: "示例集团", issuerCompanyId: 4, shareRatio: 0.6 }),
      interest({
        id: 2,
        ownerPartyId: 10,
        ownerName: "示例集团",
        issuerCompanyId: 4,
        shareRatio: 0.7,
        recordStatus: "pending",
      }),
    ],
  });

  const shareholderEdge = graph.edges.find((edge) => edge.relationType === "share_capital");
  assert.deepEqual(
    { previous: shareholderEdge?.previousShareRatio, next: shareholderEdge?.shareRatio, status: shareholderEdge?.recordStatus },
    { previous: 0.4, next: 0.5, status: "pending" },
  );
  const ownershipEdge = graph.edges.find((edge) => edge.relationType === "ownership_interest");
  assert.deepEqual(
    { previous: ownershipEdge?.previousShareRatio, next: ownershipEdge?.shareRatio, status: ownershipEdge?.recordStatus },
    { previous: 0.6, next: 0.7, status: "pending" },
  );
});

test("shareholder groups are effective-dated and aggregate member ratios from the capital ledger", () => {
  const graph = buildOwnershipStructureGraph({
    asOf: "2026-07-25",
    rootCompany: companies[0] as OwnershipStructureCompanyInput,
    companies,
    totalRegisteredCapitalYuan: 100,
    shareholders: [
      { partyId: 20, name: "投资公司", confirmedSubscribedCapitalYuan: 35, pendingCapitalDeltaYuan: 5 },
      { partyId: 99, name: "个人股东", confirmedSubscribedCapitalYuan: 10, pendingCapitalDeltaYuan: 0 },
    ],
    shareholderGroups: [{
      id: 7,
      groupKey: "management",
      label: "管理团队",
      sortOrder: 10,
      memberships: [
        { partyId: 20, sortOrder: 10, effectiveFrom: new Date("2026-01-01T00:00:00.000Z"), effectiveTo: null, recordStatus: "confirmed" },
        { partyId: 99, sortOrder: 20, effectiveFrom: new Date("2025-01-01T00:00:00.000Z"), effectiveTo: new Date("2025-12-31T23:59:59.999Z"), recordStatus: "confirmed" },
      ],
    }],
    interests: [],
  });

  assert.deepEqual(graph.groups, [{
    key: "shareholder-group:7",
    label: "管理团队",
    memberNodeKeys: ["root-shareholder:20"],
    shareRatio: 0.4,
    previousShareRatio: 0.35,
    recordStatus: "pending",
    layoutOrder: 10,
  }]);
});
