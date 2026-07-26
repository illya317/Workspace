import assert from "node:assert/strict";
import test from "node:test";
import { normalizePartyName, partyNameAt, validatePartyNameFacts, type PartyNameFact } from "./party-name-history";

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const facts: PartyNameFact[] = [
  { id: 1, nameKind: "legal", name: "盐城示例集团制药有限公司", effectiveFrom: null, effectiveTo: day("2016-09-24"), recordStatus: "confirmed" },
  { id: 2, nameKind: "legal", name: "江苏示例集团制药有限公司", effectiveFrom: day("2016-09-25"), effectiveTo: day("2023-11-21"), recordStatus: "confirmed" },
  { id: 3, nameKind: "legal", name: "示例集团有限公司", effectiveFrom: day("2023-11-22"), effectiveTo: null, recordStatus: "confirmed" },
];

test("a stable party projects the legal name that was effective on a date", () => {
  validatePartyNameFacts(facts);
  assert.equal(partyNameAt(facts, "legal", day("2020-01-01"))?.name, "江苏示例集团制药有限公司");
  assert.equal(partyNameAt(facts, "legal", day("2026-07-25"))?.name, "示例集团有限公司");
});

test("unknown start dates are preserved without inventing a date", () => {
  assert.equal(partyNameAt(facts, "legal", day("2010-01-01"))?.effectiveFrom, null);
  assert.equal(normalizePartyName(" 江苏 示例集团制药有限公司 "), normalizePartyName("江苏示例集团制药有限公司"));
});

test("overlapping legal-name claims are rejected", () => {
  assert.throws(() => validatePartyNameFacts([...facts, {
    id: 4, nameKind: "legal", name: "冲突名称", effectiveFrom: day("2023-01-01"), effectiveTo: null, recordStatus: "confirmed",
  }]));
});
