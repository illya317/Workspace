import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { parseAssetWorkbook } from "./current-period-workbook";

const scope = { sourceFile: "/private/input/current.xlsx", companyCode: "TEST", year: 2026, month: 6 };

test("parses the Fenghua layout and normalizes intangible amortization labels", () => {
  const parsed = parseAssetWorkbook(fenghuaFixture(), scope);
  assert.equal(parsed.scope.sourceFile, "current.xlsx");
  assert.equal(parsed.assets.length, 3);
  const intangible = parsed.assets.find((asset) => asset.assetKind === "intangible");
  assert.equal(intangible?.currentAmortization, 10);
  assert.equal(intangible?.accumulatedAmortization, 30);
  assert.equal(intangible?.sourceCurrentLabel, "本月折旧");
  assert.match(intangible?.note ?? "", /规范字段按无形资产摊销输出/);
  assert.equal(intangible?.sourceRange, "9&10-2!A3:G3");
  const fixed = parsed.assets.find((asset) => asset.assetKind === "fixed_asset");
  assert.equal(fixed?.depreciationStartDate, undefined);
  assert.ok(parsed.warnings.some((item) => item.code === "FIXED_DEPRECIATION_START_MISSING" && item.sourceRange === "9&10-1!A4:T4"));
  assert.ok(parsed.warnings.every((item) => item.note === "证据完整性由人工复核，不阻断导入"));
  assert.ok(parsed.blockers.some((item) => item.code === "DEFERRED_ACCUMULATED_CONTROL_FAILED"));
  assert.ok(parsed.warnings.some((item) => item.code === "LEASEHOLD_IMPROVEMENT_EVIDENCE_MISSING"));
});

test("selects only the Yuetong current section and keeps source account hints", () => {
  const parsed = parseAssetWorkbook(yuetongFixture(), scope);
  assert.equal(parsed.assets.length, 5);
  assert.ok(!parsed.assets.some((asset) => asset.name.includes("旧期")));
  const parking = parsed.assets.find((asset) => asset.name.includes("车位"));
  const network = parsed.assets.find((asset) => asset.name.includes("网络"));
  assert.equal(parking?.sourceAccountHint, "预付账款");
  assert.equal(parking?.categoryCandidate, "PA-PARKING");
  assert.equal(network?.sourceAccountHint, "其他流动资产");
  const software = parsed.assets.find((asset) => asset.assetKind === "intangible");
  assert.equal(software?.usefulLifeMonths, 120);
  assert.equal(software?.usefulLifeEvidence, "implied_amount_ratio");
  assert.equal(parking?.usefulLifeMonths, 12);
  assert.equal(parking?.usefulLifeEvidence, "source_term");
  assert.ok(parsed.warnings.some((item) => item.code === "INTANGIBLE_USEFUL_LIFE_IMPLIED_ONLY"));
  assert.ok(parsed.controls.some((control) => control.key === "deferred_original_cost" && control.status === "missing"));
  assert.ok(parsed.blockers.some((item) => item.code === "DEFERRED_SOURCE_TOTAL_MISSING"));
  const fixed = parsed.assets.find((asset) => asset.assetKind === "fixed_asset");
  assert.equal(fixed?.depreciationStartDate, undefined);
  assert.ok(parsed.warnings.some((item) => item.code === "FIXED_DEPRECIATION_START_MISSING" && item.sourceRange === "9&10-1!A3:AG3"));
});

test("fails closed for Tianlitong controls and keeps renovation invoices as evidence", () => {
  const parsed = parseAssetWorkbook(tianlitongFixture(), scope);
  assert.equal(parsed.assets.length, 4);
  assert.equal(parsed.renovationCostEvidence.length, 11);
  const fixed = parsed.assets.find((asset) => asset.assetKind === "fixed_asset");
  assert.equal(fixed?.depreciationStartDate, "2026-06-01");
  assert.equal(fixed?.depreciationStartEvidence, "source_used_months_and_cutoff");
  assert.equal(fixed?.depreciationStartSourceRange, "9&10-1!L6:R6");
  assert.ok(!parsed.assets.some((asset) => asset.name.includes("装修")));
  assert.ok(parsed.blockers.some((item) => item.code === "FIXED_DEPRECIATION_CONTROL_FAILED"));
  assert.ok(parsed.blockers.some((item) => item.code === "ASSET_PERIOD_MISMATCH"));
  assert.ok(parsed.warnings.some((item) => item.code === "INTANGIBLE_USEFUL_LIFE_MISSING"));
  assert.ok(parsed.warnings.some((item) => item.code === "LICENSE_RECOGNITION_REVIEW"));
  assert.ok(parsed.warnings.some((item) => item.code === "RENOVATION_CARD_EVIDENCE_MISSING"));
  assert.equal(parsed.renovationCostEvidence.find((line) => line.sourceRow === 20)?.treatment, "excluded_from_source_total");
  assert.equal(parsed.controls.find((control) => control.key === "renovation_invoice_cost")?.status, "pass");
  assert.equal(parsed.readyForImport, false);
});

test("does not guess renovation inclusion when the source total formula is not interpretable", () => {
  const parsed = parseAssetWorkbook(tianlitongFixture("SUMPRODUCT(D18:D28)"), scope);
  assert.ok(parsed.blockers.some((item) => item.code === "RENOVATION_TOTAL_FORMULA_UNINTERPRETABLE"));
  assert.ok(parsed.renovationCostEvidence.every((line) => line.treatment === "unresolved"));
});

function fenghuaFixture() {
  const fixed = [
    ["丰华测试-2026年6月\n固定资产台账"],
    ["序号", "类别", "固定资产名称", "入账日期", null, null, null, null, "年", "编号", "原值", "折旧年限（年）", "残值率", "净值", "本月折旧", "累计折旧", "期末净值"],
    [],
    [1, "电子设备", "电脑", 46000, null, null, null, null, 2025, "1-1", 1200, 3, 0.03, 1000, 10, 210, 990],
    ["合计", null, null, null, null, null, null, null, null, null, 1200, null, null, 1000, 10, 210, 990],
  ];
  const intangible = [
    ["丰华测试-2026年6月\n无形资产台账"],
    ["序号", "资产名称", "开始使用日期", "原值", "本月折旧", "累计折旧", "净（现）值"],
    [1, "软件", 46000, 1200, 10, 30, 1170],
    ["合计", null, null, 1200, 10, 30, 1170],
  ];
  const deferred = [
    ["丰华测试-2026年6月\n长期待摊费用"],
    ["待摊资产名称", "入账日期", "原值", "摊销期限", "月摊销金额", "期初余额", "本期摊销金额", "累计摊销额", "期末余额", "备注"],
    ["办公室装修", "2024.01", 6000, 60, 100, 5000, 100, 1000, 4900, "2024年1月开始摊销"],
    ["合计", null, 6000, null, 100, 5000, 100, 1000, 4900],
  ];
  return workbookBuffer({ "9&10-1": fixed, "9&10-2": intangible, "9&10-3": deferred });
}

function yuetongFixture() {
  const fixed = [
    ["悦通测试\n折旧清单2026.06"],
    ["资产编号", "资产名称", "规格", "原值", "计提原值", "净残值（3%）", "本月折旧", ...Array(17), "2026年5月累计折旧", "2026年6月累计折旧", "净值", "入账日期"],
    ["001", "笔记本", null, 1200, 1200, 36, 10, ...Array(17), 100, 110, 1090, "2025.01.01"],
    ["合计", null, null, 1200, 1200, 36, 10, ...Array(17), 100, 110, 1090],
  ];
  const intangible = [
    ["悦通测试-2026年06月\n无形资产台账"],
    ["序号", "资产名称", "开始使用日期", "原值", "本月折旧", "累计折旧", "净值"],
    [1, "用友软件", 43709, 1200, 10, 30, 1170],
    ["合计", null, null, 1200, 10, 30, 1170],
  ];
  const deferred = [
    ["悦通测试-2025年04月\n长期待摊费用"],
    ["名称", "日期", "原值", "期限", "月摊销", "期初", "本期", "累计", "期末", "备注"],
    ["旧期房租", "2025.01", 999, 12, 99, 99, 99, 900, 0, "其他流动资产"],
    [],
    ["悦通测试-2026年06月\n长期待摊费用"],
    ["名称", "日期", "原值", "期限", "月摊销", "期初", "本期", "累计", "期末", "备注"],
    ["预付账款-车位费", "2025.11", 1200, "2025.11.1-2026.10.31", 100, 700, 100, 500, 600, "预付账款"],
    ["其他流动资产--网络费", "2025.11", 1200, "2025.11.1-2026.10.31", 100, 700, 100, 500, 600, "其他流动资产"],
    ["其他流动资产-租车费", "2025.11", 1200, "2025.11.1-2026.10.31", 100, 700, 100, 500, 600, "其他流动资产"],
  ];
  return workbookBuffer({ "9&10-1": fixed, "9&10-2": intangible, "9&10-3": deferred });
}

function tianlitongFixture(totalFormula = "SUM(D18:D19)+SUM(D21:D28)") {
  const fixed = [
    ["固定资产折旧计算表"],
    [],
    ["日期:", 46203],
    ["编号", "名称", "使用部门", "入账日期", "单位", "数量", "原币单价", "购进原值", "使用年限", "残值率", "预计净残值", "已使用月份", "本月折旧", null, "累计折旧", "净值", "月折旧额", "截止日期", "累计折旧计算值"],
    [null, "设备合计", null, null, null, null, null, 1200, null, null, null, null, 9, null, 110, 1090, null, null, 111],
    [1, "设备", "机器设备", 46000, null, 1, 1200, 1200, 10, 0.03, 36, 1, 10, null, 110, 1090, 10, 46203, 111],
  ];
  const intangible = [
    ["天力通测试-2025年11月\n无形资产台账"],
    ["序号", "资产名称", "开始使用日期", "原值", "本月折旧", "累计折旧", "净值"],
    [1, "车辆牌照", 44981, 156800, 0, 0, 156800],
    ["合计", null, null, 156800, 0, 0, 156800],
  ];
  const deferred = Array.from({ length: 29 }, () => [] as unknown[]);
  deferred[0] = ["天力通测试-2026年6月\n长期待摊费用"];
  deferred[1] = ["名称", "日期", "原值", "期限", "月摊销", "期初", "本期", "累计", "期末", "备注"];
  deferred[2] = ["员工宿舍", 46082, 1200, 12, 100, 1200, 100, 300, 900];
  deferred[3] = ["短期宿舍", 46143, 300, 3, 100, 300, 100, 100, 200];
  deferred[4] = ["合计", null, 1500, 15, 200, 1500, 200, 400, 1100];
  deferred[16] = ["供应商", "合同金额", "含税", "发票金额（不含税）", "月摊销额"];
  for (let row = 18; row <= 28; row += 1) deferred[row - 1] = [`供应商${row}`, null, null, row - 17];
  deferred[28] = [null, null, null, { t: "n", v: 63, f: totalFormula }, 1.05];
  return workbookBuffer({ "9&10-1": fixed, "9&10-2": intangible, "9&10-3": deferred });
}

function workbookBuffer(sheets: Record<string, unknown[][]>) {
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
