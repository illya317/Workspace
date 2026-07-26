import assert from "node:assert/strict";
import test from "node:test";

import {
  INVALID_OWNERSHIP_INTEREST_VALUE,
  normalizeOwnershipDate,
  normalizeOwnershipShareRatio,
  validateOwnershipInterestBusinessRules,
  type OwnershipInterestRuleState,
} from "./ownership-interest-rules";

function date(value: string) {
  const normalized = normalizeOwnershipDate(value);
  assert.notEqual(normalized, INVALID_OWNERSHIP_INTEREST_VALUE);
  assert.ok(normalized instanceof Date);
  return normalized;
}

function interest(
  input: Partial<OwnershipInterestRuleState>
    & Pick<OwnershipInterestRuleState, "ownerPartyId" | "issuerCompanyId">,
): OwnershipInterestRuleState {
  return {
    ownerCompanyId: input.ownerPartyId,
    isConsolidated: true,
    effectiveFrom: null,
    effectiveTo: null,
    ...input,
  };
}

test("share ratio uses a 0..1 fraction", () => {
  assert.equal(normalizeOwnershipShareRatio(null), null);
  assert.equal(normalizeOwnershipShareRatio(0), 0);
  assert.equal(normalizeOwnershipShareRatio("0.625"), 0.625);
  assert.equal(normalizeOwnershipShareRatio(1), 1);
  assert.equal(normalizeOwnershipShareRatio(-0.01), INVALID_OWNERSHIP_INTEREST_VALUE);
  assert.equal(normalizeOwnershipShareRatio(50), INVALID_OWNERSHIP_INTEREST_VALUE);
});

test("date normalization rejects invalid calendar dates", () => {
  assert.equal(normalizeOwnershipDate("2026-02-29"), INVALID_OWNERSHIP_INTEREST_VALUE);
  assert.equal(normalizeOwnershipDate("2026/02/28"), INVALID_OWNERSHIP_INTEREST_VALUE);
  assert.equal(date("2026-02-28").toISOString(), "2026-02-28T00:00:00.000Z");
});

test("rejects reversed effective periods and non-company consolidation owners", () => {
  assert.equal(validateOwnershipInterestBusinessRules(interest({
    ownerPartyId: 4,
    issuerCompanyId: 5,
    effectiveFrom: date("2026-12-31"),
    effectiveTo: date("2026-01-01"),
  }), []), "失效日期不得早于生效日期");
  assert.equal(validateOwnershipInterestBusinessRules(interest({
    ownerPartyId: 4,
    ownerCompanyId: null,
    issuerCompanyId: 5,
  }), []), "只有内部公司股东可以纳入并表");
});

test("blocks overlapping controlling owners but allows consecutive periods", () => {
  const existing = interest({ id: 1, ownerPartyId: 10, issuerCompanyId: 30, effectiveFrom: date("2026-01-01"), effectiveTo: date("2026-06-30") });
  const overlapping = interest({ ownerPartyId: 20, issuerCompanyId: 30, effectiveFrom: date("2026-06-30"), effectiveTo: date("2026-12-31") });
  const consecutive = interest({ ownerPartyId: 20, issuerCompanyId: 30, effectiveFrom: date("2026-07-01"), effectiveTo: date("2026-12-31") });
  assert.equal(validateOwnershipInterestBusinessRules(overlapping, [existing]), "同一有效期间内，被持股公司只能有一个并表控制方");
  assert.equal(validateOwnershipInterestBusinessRules(consecutive, [existing]), null);
});

test("allows a former peer subsidiary to become the next controlling parent", () => {
  const groupOwnsFutureParent = interest({
    id: 1,
    ownerPartyId: 10,
    ownerCompanyId: 10,
    issuerCompanyId: 20,
    effectiveFrom: date("2020-01-01"),
    effectiveTo: null,
  });
  const priorPeerControl = interest({
    id: 2,
    ownerPartyId: 10,
    ownerCompanyId: 10,
    issuerCompanyId: 30,
    effectiveFrom: date("2020-01-01"),
    effectiveTo: date("2025-08-31"),
  });
  const futureParentControl = interest({
    ownerPartyId: 20,
    ownerCompanyId: 20,
    issuerCompanyId: 30,
    effectiveFrom: date("2025-09-01"),
    effectiveTo: null,
  });
  assert.equal(validateOwnershipInterestBusinessRules(
    futureParentControl,
    [groupOwnsFutureParent, priorPeerControl],
  ), null);
});

test("same owner-issuer periods cannot overlap", () => {
  const existing = interest({ id: 1, ownerPartyId: 10, issuerCompanyId: 30, effectiveFrom: date("2026-01-01"), effectiveTo: date("2026-06-30") });
  const overlapping = interest({ ownerPartyId: 10, issuerCompanyId: 30, effectiveFrom: date("2026-06-30"), effectiveTo: date("2026-12-31") });
  const nextPeriod = interest({ ownerPartyId: 10, issuerCompanyId: 30, effectiveFrom: date("2026-07-01"), effectiveTo: null });
  assert.equal(validateOwnershipInterestBusinessRules(overlapping, [existing]), "同一持股关系的有效期间不能重叠");
  assert.equal(validateOwnershipInterestBusinessRules(nextPeriod, [existing]), null);
});

test("pending changes remain traceable without changing the confirmed timeline", () => {
  const existing = interest({ id: 1, ownerPartyId: 10, issuerCompanyId: 30, effectiveFrom: date("2026-01-01"), effectiveTo: null });
  const pending = interest({ ownerPartyId: 10, issuerCompanyId: 30, effectiveFrom: date("2026-06-01"), effectiveTo: null, recordStatus: "pending" });
  assert.equal(validateOwnershipInterestBusinessRules(pending, [existing]), null);
});

test("blocks only control cycles in the same effective period", () => {
  const candidate = interest({ ownerPartyId: 1, ownerCompanyId: 1, issuerCompanyId: 2, effectiveFrom: date("2026-01-01"), effectiveTo: date("2026-12-31") });
  const firstEdge = interest({ id: 2, ownerPartyId: 2, ownerCompanyId: 2, issuerCompanyId: 3, effectiveFrom: date("2026-01-01"), effectiveTo: date("2026-06-30") });
  const overlappingReturnEdge = interest({ id: 3, ownerPartyId: 3, ownerCompanyId: 3, issuerCompanyId: 1, effectiveFrom: date("2026-06-01"), effectiveTo: date("2026-12-31") });
  const laterReturnEdge = interest({ ...overlappingReturnEdge, effectiveFrom: date("2026-07-01") });
  assert.equal(validateOwnershipInterestBusinessRules(candidate, [firstEdge, overlappingReturnEdge]), "并表控制关系不能形成循环");
  assert.equal(validateOwnershipInterestBusinessRules(candidate, [firstEdge, laterReturnEdge]), null);
});
