import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyCompanyRegistryChange,
  inferCurrentSoleInvestorEvidence,
  normalizeLegalRepresentative,
  normalizeRegistryPartyName,
  parseCompanyRegistryCsv,
  parseRegistryOwnershipParticipants,
} from "./company-registry-change-import";

test("company registry CSV parsing preserves quoted officer lists", () => {
  const rows = parseCompanyRegistryCsv([
    "\uFEFFcompany_name,changeTime,changeItem,contentBefore,contentAfter,createTime",
    '示例子公司乙,2022-09-02,董事（理事）、经理、监事,"韩忠*,刘鑫","陈思翊,韩忠*",2022-09-04',
  ].join("\n"));
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.contentBefore, "韩忠*,刘鑫");
  assert.equal(rows[0]?.contentAfter, "陈思翊,韩忠*");
  assert.equal(classifyCompanyRegistryChange(rows[0]?.changeItem ?? ""), "officers");
});

test("ownership roster parsing creates ordered normalized participant snapshots", () => {
  assert.deepEqual(
    parseRegistryOwnershipParticipants("张慧君 江苏示例集团制药有限公司 盐城悦通管理咨询中心（有限合伙） 韩忠*"),
    [
      { sequence: 1, rawName: "张慧君", normalizedName: "张慧君" },
      { sequence: 2, rawName: "江苏示例集团制药有限公司", normalizedName: "江苏示例集团制药有限公司" },
      { sequence: 3, rawName: "盐城悦通管理咨询中心（有限合伙）", normalizedName: "盐城悦通管理咨询中心（有限合伙）" },
      { sequence: 4, rawName: "韩忠*", normalizedName: "韩忠" },
    ],
  );
  assert.deepEqual(parseRegistryOwnershipParticipants("江苏示例集团制药有限公司,企业法人"), [{
    sequence: 1,
    rawName: "江苏示例集团制药有限公司,企业法人",
    normalizedName: "江苏示例集团制药有限公司",
  }]);
});

test("company registry facts classify legal and ownership changes without inventing ratios", () => {
  assert.equal(classifyCompanyRegistryChange("法定代表人变更"), "legal_representative");
  assert.equal(classifyCompanyRegistryChange("名称变更（字号名称、集团名称等）"), "company_name");
  assert.equal(classifyCompanyRegistryChange("投资人(股权)变更"), "ownership");
  assert.equal(classifyCompanyRegistryChange("经营范围变更"), null);
  assert.equal(normalizeLegalRepresentative("任雅丽*"), "任雅丽");
  assert.equal(normalizeLegalRepresentative("延国欣（已撤销）"), "延国欣");
  assert.equal(normalizeRegistryPartyName("江苏示例集团制药有限公司,企业法人"), "江苏示例集团制药有限公司");
});

test("sole-investor evidence starts after the latest multi-owner roster and treats renamed parties as one owner", () => {
  const rows = parseCompanyRegistryCsv([
    "company_name,changeTime,changeItem,contentBefore,contentAfter,createTime",
    "上海示例子公司甲生物医药有限公司,2022-03-24,投资人(股权)变更,江苏示例集团制药有限公司,江苏示例集团制药有限公司 张慧君 韩忠*,2022-03-28",
    "上海示例子公司甲生物医药有限公司,2022-07-04,投资人(股权)变更,江苏示例集团制药有限公司 张慧君 韩忠*,江苏示例集团制药有限公司,2022-07-10",
    "上海示例子公司甲生物医药有限公司,2025-11-27,投资人(股权)变更,江苏示例集团制药有限公司,示例集团有限公司,2025-12-01",
  ].join("\n"));
  const aliases = new Map([["江苏示例集团制药有限公司", 1], ["示例集团有限公司", 1]]);
  assert.deepEqual(inferCurrentSoleInvestorEvidence(rows, (name) => aliases.get(name) ?? null), [{
    companyName: "上海示例子公司甲生物医药有限公司",
    ownerPartyId: 1,
    effectiveFrom: "2022-07-04",
    sourceRow: 3,
    confirmedBySourceRow: 4,
  }]);
});
