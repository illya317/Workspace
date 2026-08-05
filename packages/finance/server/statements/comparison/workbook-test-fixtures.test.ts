import assert from "node:assert/strict";
import test from "node:test";

import * as XLSX from "xlsx";

/**
 * 测试专用匿名化合成 workbook 构造器（通用 sheet/label/金额，无租户事实）。
 * 真实私有 workbook 不进仓库（计划 §11 fixture 政策；Package 8 私有验收）。
 * 注意：本文件是被测 ingest 的“不可信输入”生产者，必须能直接构造任意
 * （含公式/隐藏 sheet 的）XLSX 字节，因此刻意不走 workbookFormula 契约。
 */

export interface FixtureCell {
  t: "n" | "s" | "str" | "b";
  v?: number | string | boolean;
  w?: string;
  f?: string;
  z?: string;
}

export interface FixtureSheet {
  name: string;
  hidden?: 0 | 1 | 2;
  cells: Record<string, FixtureCell>;
  merges?: { s: { r: number; c: number }; e: { r: number; c: number } }[];
  ref?: string;
}

function computeRef(cells: Record<string, FixtureCell>): string {
  let maxRow = 0;
  let maxCol = 0;
  for (const key of Object.keys(cells)) {
    const decoded = XLSX.utils.decode_cell(key);
    maxRow = Math.max(maxRow, decoded.r);
    maxCol = Math.max(maxCol, decoded.c);
  }
  return `A1:${XLSX.utils.encode_col(maxCol)}${maxRow + 1}`;
}

/** 生成 .xlsx buffer（SheetJS 写出，模拟真实用户上传）。 */
export function buildWorkbookBuffer(sheets: FixtureSheet[]): Buffer {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const worksheet: XLSX.WorkSheet = {};
    for (const [a1, cell] of Object.entries(sheet.cells)) {
      worksheet[a1] = cell as XLSX.CellObject;
    }
    worksheet["!ref"] = sheet.ref ?? computeRef(sheet.cells);
    if (sheet.merges) worksheet["!merges"] = sheet.merges;
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
  }
  workbook.Workbook = {
    Sheets: sheets.map((sheet) => ({ Hidden: sheet.hidden ?? 0 })),
  };
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/** 合成资产负债表 sheet：label 列 + 两个期间金额列 + 一个公式合计行。 */
export function balanceSheetFixture(overrides: Partial<FixtureSheet> = {}): FixtureSheet {
  const cells: FixtureSheet["cells"] = {
    B1: { t: "s", v: "期末余额" },
    C1: { t: "s", v: "年初余额" },
    A2: { t: "s", v: "货币资金" },
    B2: { t: "n", v: 1000.5, w: "1,000.50", z: "#,##0.00" },
    C2: { t: "n", v: 900 },
    A3: { t: "s", v: "应收账款" },
    B3: { t: "n", v: 200 },
    C3: { t: "n", v: 200 },
    A4: { t: "s", v: "存货" },
    B4: { t: "n", v: 300.25 },
    C4: { t: "n", v: 300 },
    A5: { t: "s", v: "流动资产合计" },
    B5: { t: "n", f: "SUM(B2:B4)", v: 1500.75, z: "#,##0.00" },
    C5: { t: "n", v: 1400 },
    A6: { t: "s", v: "固定资产" },
    B6: { t: "n", v: 500 },
    C6: { t: "n", v: 500 },
    ...overrides.cells,
  };
  return { name: "报表一", ...overrides, cells };
}

/** 合成利润表 sheet（枚举/减：前缀变体走 normalization）。 */
export function incomeSheetFixture(): FixtureSheet {
  return {
    name: "利润表",
    cells: {
      B1: { t: "s", v: "本期金额" },
      A2: { t: "s", v: "一、营业收入" },
      B2: { t: "n", v: 8000 },
      A3: { t: "s", v: "减：营业成本" },
      B3: { t: "n", v: 5000 },
      A4: { t: "s", v: "税金及附加" },
      B4: { t: "n", v: 100 },
      A5: { t: "s", v: "销售费用" },
      B5: { t: "n", v: 200 },
    },
  };
}

/** 合成现金流量表 sheet。 */
export function cashflowSheetFixture(): FixtureSheet {
  return {
    name: "现金流量表",
    cells: {
      B1: { t: "s", v: "本期金额" },
      A2: { t: "s", v: "销售商品、提供劳务收到的现金" },
      B2: { t: "n", v: 6000 },
      A3: { t: "s", v: "收到的税费返还" },
      B3: { t: "n", v: 50 },
      A4: { t: "s", v: "购买商品、接受劳务支付的现金" },
      B4: { t: "n", v: 4000 },
      A5: { t: "s", v: "经营活动产生的现金流量净额" },
      B5: { t: "n", f: "B2+B3-B4", v: 2050 },
    },
  };
}

test("构造器往返：公式单元格与隐藏 sheet 经 SheetJS 写出/读回后保留", () => {
  const bytes = buildWorkbookBuffer([
    balanceSheetFixture(),
    { name: "底稿", hidden: 1, cells: { A1: { t: "s", v: "注" } } },
  ]);
  const workbook = XLSX.read(bytes, { type: "buffer" });
  const sheet = workbook.Sheets["报表一"]!;
  assert.equal(sheet["B5"]!.f, "SUM(B2:B4)");
  assert.equal(sheet["B5"]!.v, 1500.75);
  assert.equal(sheet["B2"]!.w, "1,000.50");
  const visibility = workbook.Workbook?.Sheets?.map((entry) => entry.Hidden) ?? [];
  assert.deepEqual(visibility, [0, 1]);
});
