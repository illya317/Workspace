import assert from "node:assert/strict";
import test from "node:test";

import {
  businessCodeScopeParts,
  formatBusinessCodeDate,
  parseBusinessCodeDateFormat,
  parseComposableBusinessCodeRule,
  renderBusinessCode,
} from "./business-code-rule";

test("date formats support compact numeric and month-name forms", () => {
  const value = { year: 2026, month: 7, day: 29, hour: 15, minute: 8, second: 6 };
  assert.equal(formatBusinessCodeDate(value, "YYMM", "date"), "2607");
  assert.equal(formatBusinessCodeDate(value, "YYMMM", "date"), "26JUL");
  assert.equal(formatBusinessCodeDate(value, "YYYYMMDD-HHmmss", "datetime"), "20260729-150806");
});

test("invalid or incomplete date formats fail closed", () => {
  assert.deepEqual(parseBusinessCodeDateFormat("yyyyMM", "date"), {
    ok: false,
    error: "无法识别日期格式“yyyyMM”",
  });
  assert.deepEqual(parseBusinessCodeDateFormat("YYYYMMDD", "datetime"), {
    ok: false,
    error: "完整时间格式至少需要 HH",
  });
  assert.throws(
    () => formatBusinessCodeDate(2026, "YYMM", "date"),
    /当前业务数据缺少月份/,
  );
  assert.throws(
    () => formatBusinessCodeDate("2026-02-30", "YYYYMMDD", "date"),
    /日期值无效/,
  );
});

test("composable rule renders references, date and atomic sequence", () => {
  const rule = parseComposableBusinessCodeRule({
    segments: [
      { kind: "reference", source: "companyCode" },
      { kind: "literal", value: "-" },
      { kind: "reference", source: "assetCategoryCode" },
      { kind: "literal", value: "-" },
      { kind: "date", source: "fiscalYear", format: "YYYY" },
      { kind: "literal", value: "-" },
      { kind: "sequence", length: 5 },
    ],
    sequenceStart: 1,
  }, { allowedSources: ["companyCode", "assetCategoryCode", "fiscalYear"] });
  const context = {
    values: { companyCode: "02", assetCategoryCode: "FA-ELECTRONIC", fiscalYear: 2026 },
    sequence: 7,
  };
  assert.equal(renderBusinessCode(rule, context), "02-FA-ELECTRONIC-2026-00007");
  assert.deepEqual(businessCodeScopeParts(rule, context), {
    companyCode: "02",
    assetCategoryCode: "FA-ELECTRONIC",
    fiscalYear: "2026",
  });
});

test("rule validation rejects unsupported sources and duplicate sequences", () => {
  assert.throws(() => parseComposableBusinessCodeRule({
    segments: [
      { kind: "reference", source: "departmentCode" },
      { kind: "sequence", length: 4 },
    ],
    sequenceStart: 1,
  }, { allowedSources: ["companyCode"] }), /业务字段不可用/);
  assert.throws(() => parseComposableBusinessCodeRule({
    segments: [{ kind: "sequence", length: 4 }, { kind: "sequence", length: 4 }],
    sequenceStart: 1,
  }), /必须且只能包含一个流水号/);
});
