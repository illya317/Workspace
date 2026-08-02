import assert from "node:assert/strict";
import test from "node:test";

import * as XLSX from "xlsx";

import { parseInventoryWorkbook } from "./workbook-import";

function workbookBuffer() {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["黄精阿胶浓浆入库记录"],
    ["序号", "入库日期", "产品名称", "规格", "件包装", "折合件数", "单位", "数量", "单价（元）", "金额（元）", "生产批号", "生产日期", "保质期至", "是否填写入库单", "备注"],
    [1, "2026-01-09", "黄精阿胶浓浆", "30ml/袋", null, null, "盒", 10, 23.5, 235, "B1", "2026-01-09", "2027-01-08", "已填写", "来源入库"],
  ]), "阿胶浓浆入库明细表");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["黄精阿胶浓浆出库记录"],
    ["序号", "出库日期", "产品名称", "规格", "件包装", "折合件数", "单位", "数量", "单价（元）", "金额（元）", "生产批号", "生产日期", "保质期至", "回款日期", "支付方式", "回款金额", "发票金额", "备注"],
    [1, "2026-04-03", "黄精阿胶浓浆", "30ml/袋", null, null, "盒", 2, 40, 80, "B1", "2026-01-09", "2027-01-08", "2026-04-15", "扫码", 80, "未开", "来源出库"],
  ]), "阿胶浓浆出库明细表");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["2026年4月存货收发存表"],
    ["编号", "名称", "规格型号", "批号", "单位", "3月末库存", "4月入库", "4月出库", "4月库存", "盘点数", "盘点差异"],
    [1, "面膜", null, null, "盒", 80, 0, 0, 80, 70, 10],
  ]), "面膜");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

test("workbook issue keeps sale price as trace but leaves cost to moving weighted average", () => {
  const parsed = parseInventoryWorkbook(workbookBuffer());
  const issue = parsed.lines.find((line) => line.documentType === "issue");
  assert.equal(issue?.unitPrice, undefined);
  assert.match(issue?.note ?? "", /来源销售单价=40\.00/);
  assert.equal(parsed.stocktake.variance, -10);
});
