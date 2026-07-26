import assert from "node:assert/strict";
import test from "node:test";

import { financeAccountSourceScopeKey } from "../group-accounts/source-accounts";
import { buildRuleCandidates } from "./candidates";

test("candidate history is bounded by the selected version and uses its group balance direction", () => {
  const source = { sourceSystem: null, sourceDatabase: null, sourceLedger: null };
  const result = buildRuleCandidates({
    versions: [
      { id: 1, versionNo: 1, code: "V1", name: "V1", effectiveFrom: null, effectiveTo: "2027-01-01", createdAt: "2026-07-23T00:00:00.000Z", isCurrent: false },
      { id: 2, versionNo: 2, code: "V2", name: "V2", effectiveFrom: "2027-01-01", effectiveTo: null, createdAt: "2027-01-01T00:00:00.000Z", isCurrent: true },
    ],
    selectedVersionId: 1,
    revisions: [{
      groupAccountId: 10,
      code: "2202",
      name: "应付账款",
      category: "liability",
      balanceDirection: "credit",
      parentGroupAccountId: null,
    }],
    rules: [],
    mappings: [{
      companyCode: "ZX01",
      sourceScopeKey: financeAccountSourceScopeKey(source),
      localAccountCode: "2202",
      groupAccountId: 10,
    }],
    historicalRows: [
      { accountId: 1, companyCode: "ZX01", code: "2202", ...source, endDate: "2026-12-31", netAmount: -100 },
      { accountId: 1, companyCode: "ZX01", code: "2202", ...source, endDate: "2027-01-01", netAmount: 100 },
    ],
    auxiliaryFactGroupIds: new Set(),
  });

  assert.equal(result.policyVersion.code, "V1");
  assert.equal(result.candidates[0]?.hasHistoricalAbnormalBalance, false);
  assert.equal(result.candidates[0]?.effectiveDecision, "no_reclass");
});

test("inheritance is derived from group-account identity instead of legacy code snapshots", () => {
  const result = buildRuleCandidates({
    versions: [{
      id: 1,
      versionNo: 1,
      code: "V1",
      name: "V1",
      effectiveFrom: null,
      effectiveTo: null,
      createdAt: "2026-07-23T00:00:00.000Z",
      isCurrent: true,
    }],
    selectedVersionId: 1,
    revisions: [
      { groupAccountId: 10, code: "1221", name: "其他应收款", category: "asset", balanceDirection: "debit", parentGroupAccountId: null },
      { groupAccountId: 11, code: "122101", name: "其他应收款-单位", category: "asset", balanceDirection: "debit", parentGroupAccountId: 10 },
      { groupAccountId: 20, code: "2241", name: "其他应付款", category: "liability", balanceDirection: "credit", parentGroupAccountId: null },
    ],
    rules: [{
      id: 1,
      policyVersionId: 1,
      sourceGroupAccountId: 10,
      targetGroupAccountId: 20,
      sourceAccountCode: "122101",
      abnormalSide: "credit",
      decision: "reclassify",
      targetAccountCode: "224101",
      enabled: true,
    }],
    historicalRows: [],
    mappings: [],
    auxiliaryFactGroupIds: new Set(),
  });

  const direct = result.candidates.find((candidate) => candidate.groupAccountId === 10);
  const inherited = result.candidates.find((candidate) => candidate.groupAccountId === 11);
  assert.equal(direct?.inheritedFromAccountCode, null);
  assert.equal(direct?.existingTarget, "2241");
  assert.equal(inherited?.inheritedFromAccountCode, "1221");
  assert.equal(inherited?.existingTarget, "2241");
});

test("candidates with historical abnormal balance sort first", () => {
  const source = { sourceSystem: null, sourceDatabase: null, sourceLedger: null };
  const result = buildRuleCandidates({
    versions: [{
      id: 1,
      versionNo: 1,
      code: "V1",
      name: "V1",
      effectiveFrom: null,
      effectiveTo: null,
      createdAt: "2026-07-23T00:00:00.000Z",
      isCurrent: true,
    }],
    selectedVersionId: 1,
    revisions: [
      { groupAccountId: 10, code: "1122", name: "应收账款", category: "asset", balanceDirection: "debit", parentGroupAccountId: null },
      { groupAccountId: 20, code: "2202", name: "应付账款", category: "liability", balanceDirection: "credit", parentGroupAccountId: null },
    ],
    rules: [],
    mappings: [{
      companyCode: "ZX01",
      sourceScopeKey: financeAccountSourceScopeKey(source),
      localAccountCode: "2202",
      groupAccountId: 20,
    }],
    historicalRows: [
      { accountId: 1, companyCode: "ZX01", code: "2202", ...source, endDate: "2026-12-31", netAmount: 100 },
    ],
    auxiliaryFactGroupIds: new Set(),
  });

  assert.deepEqual(result.candidates.map((candidate) => candidate.accountCode), ["2202", "1122"]);
  assert.equal(result.candidates[0]?.hasHistoricalAbnormalBalance, true);
});

test("carries basis information from the resolved rule and auxiliary facts", () => {
  const result = buildRuleCandidates({
    versions: [{
      id: 1,
      versionNo: 1,
      code: "V1",
      name: "V1",
      effectiveFrom: null,
      effectiveTo: null,
      createdAt: "2026-07-23T00:00:00.000Z",
      isCurrent: true,
    }],
    selectedVersionId: 1,
    revisions: [
      { groupAccountId: 10, code: "2202", name: "应付账款", category: "liability", balanceDirection: "credit", parentGroupAccountId: null },
      { groupAccountId: 20, code: "2221", name: "应交税费", category: "liability", balanceDirection: "credit", parentGroupAccountId: null },
    ],
    rules: [{
      id: 1,
      policyVersionId: 1,
      sourceGroupAccountId: 10,
      targetGroupAccountId: 20,
      sourceAccountCode: "2202",
      abnormalSide: "debit",
      decision: "reclassify",
      targetAccountCode: "2221",
      enabled: true,
      basis: "counterparty_gross",
    }],
    historicalRows: [],
    mappings: [],
    auxiliaryFactGroupIds: new Set([10]),
  });

  const withFacts = result.candidates.find((candidate) => candidate.groupAccountId === 10);
  const withoutFacts = result.candidates.find((candidate) => candidate.groupAccountId === 20);
  assert.equal(withFacts?.defaultBasis, "counterparty_gross");
  assert.equal(withFacts?.hasAuxiliaryFacts, true);
  assert.equal(withFacts?.existingBasis, "counterparty_gross");
  assert.equal(withoutFacts?.defaultBasis, "account_net");
  assert.equal(withoutFacts?.hasAuxiliaryFacts, false);
  assert.equal(withoutFacts?.existingBasis, null);
});

test("reclassification candidates exclude profit-and-loss accounts", () => {
  const result = buildRuleCandidates({
    versions: [{
      id: 1,
      versionNo: 1,
      code: "V1",
      name: "V1",
      effectiveFrom: null,
      effectiveTo: null,
      createdAt: "2026-07-23T00:00:00.000Z",
      isCurrent: true,
    }],
    selectedVersionId: 1,
    revisions: [
      { groupAccountId: 10, code: "2202", name: "应付账款", category: "liability", balanceDirection: "credit", parentGroupAccountId: null },
      { groupAccountId: 20, code: "6602", name: "管理费用", category: "expense", balanceDirection: "debit", parentGroupAccountId: null },
    ],
    rules: [],
    historicalRows: [],
    mappings: [],
    auxiliaryFactGroupIds: new Set(),
  });

  assert.deepEqual(result.candidates.map((candidate) => candidate.accountCode), ["2202"]);
  assert.deepEqual(result.accountOptions.map((account) => account.code), ["2202"]);
});
