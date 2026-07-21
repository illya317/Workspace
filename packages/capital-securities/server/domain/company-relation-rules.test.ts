import assert from "node:assert/strict";
import test from "node:test";

import {
  INVALID_COMPANY_RELATION_VALUE,
  normalizeCompanyRelationDate,
  normalizeCompanyRelationShareRatio,
  validateCompanyRelationBusinessRules,
  type CompanyRelationRuleState,
} from "./company-relation-rules";

function date(value: string) {
  const normalized = normalizeCompanyRelationDate(value);
  assert.notEqual(normalized, INVALID_COMPANY_RELATION_VALUE);
  assert.ok(normalized instanceof Date);
  return normalized;
}

function relation(input: Partial<CompanyRelationRuleState> & Pick<CompanyRelationRuleState, "parentId" | "childId">): CompanyRelationRuleState {
  return { isConsolidated: true, effectiveFrom: null, effectiveTo: null, ...input };
}

test("share ratio uses a 0..1 fraction", () => {
  assert.equal(normalizeCompanyRelationShareRatio(null), null);
  assert.equal(normalizeCompanyRelationShareRatio(0), 0);
  assert.equal(normalizeCompanyRelationShareRatio("0.625"), 0.625);
  assert.equal(normalizeCompanyRelationShareRatio(1), 1);
  assert.equal(normalizeCompanyRelationShareRatio(-0.01), INVALID_COMPANY_RELATION_VALUE);
  assert.equal(normalizeCompanyRelationShareRatio(50), INVALID_COMPANY_RELATION_VALUE);
});

test("date normalization rejects invalid calendar dates", () => {
  assert.equal(normalizeCompanyRelationDate("2026-02-29"), INVALID_COMPANY_RELATION_VALUE);
  assert.equal(normalizeCompanyRelationDate("2026/02/28"), INVALID_COMPANY_RELATION_VALUE);
  assert.equal(date("2026-02-28").toISOString(), "2026-02-28T00:00:00.000Z");
});

test("rejects self ownership and reversed effective periods", () => {
  assert.equal(validateCompanyRelationBusinessRules(relation({ parentId: 4, childId: 4 }), []), "持股方和被持股方不能相同");
  assert.equal(validateCompanyRelationBusinessRules(relation({
    parentId: 4,
    childId: 5,
    effectiveFrom: date("2026-12-31"),
    effectiveTo: date("2026-01-01"),
  }), []), "失效日期不得早于生效日期");
});

test("blocks overlapping controlling parents but allows consecutive periods", () => {
  const existing = relation({ id: 1, parentId: 10, childId: 30, effectiveFrom: date("2026-01-01"), effectiveTo: date("2026-06-30") });
  const overlapping = relation({ parentId: 20, childId: 30, effectiveFrom: date("2026-06-30"), effectiveTo: date("2026-12-31") });
  const consecutive = relation({ parentId: 20, childId: 30, effectiveFrom: date("2026-07-01"), effectiveTo: date("2026-12-31") });
  assert.equal(validateCompanyRelationBusinessRules(overlapping, [existing]), "同一有效期间内，被持股公司只能有一个并表控制方");
  assert.equal(validateCompanyRelationBusinessRules(consecutive, [existing]), null);
});

test("same parent-child periods cannot overlap", () => {
  const existing = relation({ id: 1, parentId: 10, childId: 30, effectiveFrom: date("2026-01-01"), effectiveTo: date("2026-06-30") });
  const overlapping = relation({ parentId: 10, childId: 30, effectiveFrom: date("2026-06-30"), effectiveTo: date("2026-12-31") });
  const nextPeriod = relation({ parentId: 10, childId: 30, effectiveFrom: date("2026-07-01"), effectiveTo: null });
  assert.equal(validateCompanyRelationBusinessRules(overlapping, [existing]), "同一持股关系的有效期间不能重叠");
  assert.equal(validateCompanyRelationBusinessRules(nextPeriod, [existing]), null);
});

test("blocks only control cycles in the same effective period", () => {
  const candidate = relation({ parentId: 1, childId: 2, effectiveFrom: date("2026-01-01"), effectiveTo: date("2026-12-31") });
  const firstEdge = relation({ id: 2, parentId: 2, childId: 3, effectiveFrom: date("2026-01-01"), effectiveTo: date("2026-06-30") });
  const overlappingReturnEdge = relation({ id: 3, parentId: 3, childId: 1, effectiveFrom: date("2026-06-01"), effectiveTo: date("2026-12-31") });
  const laterReturnEdge = relation({ ...overlappingReturnEdge, effectiveFrom: date("2026-07-01") });
  assert.equal(validateCompanyRelationBusinessRules(candidate, [firstEdge, overlappingReturnEdge]), "并表控制关系不能形成循环");
  assert.equal(validateCompanyRelationBusinessRules(candidate, [firstEdge, laterReturnEdge]), null);
});
