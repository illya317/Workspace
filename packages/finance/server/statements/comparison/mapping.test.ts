import assert from "node:assert/strict";
import test from "node:test";

import { detectStatementMapping } from "./mapping";
import { normalizeStatementLabel } from "./statement-lines";
import type { NormalizedWorkbookDto, WorkbookCellDto, WorkbookSheetDto } from "./workbook-dto";

/** 直接构造 DTO（映射检测只依赖归一化形状，不需要真实 xlsx 字节）。 */
function cell(row: number, col: number, value: string | number, opts: Partial<WorkbookCellDto> = {}): WorkbookCellDto {
  const a1 = `${columnLabel(col)}${row + 1}`;
  return {
    a1,
    row,
    col,
    type: typeof value === "number" ? "n" : "s",
    value,
    text: null,
    formula: null,
    numberFormat: null,
    ...opts,
  };
}

function columnLabel(col: number): string {
  let value = col + 1;
  let label = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

function sheetDto(name: string, cells: WorkbookCellDto[], opts: Partial<WorkbookSheetDto> = {}): WorkbookSheetDto {
  return {
    name,
    index: 0,
    visibility: "visible",
    usedRange: null,
    merges: [],
    mergesTruncated: false,
    cells,
    ...opts,
  };
}

function dtoOf(sheets: WorkbookSheetDto[]): NormalizedWorkbookDto {
  return {
    version: 1,
    file: { fileName: "匿名化.xlsx", mimeType: "", fileSize: 0, sha256: "0".repeat(64) },
    workbookFingerprint: "0".repeat(64),
    parser: { id: "sheetjs-ce", version: "0.20.3" },
    calculation: { mode: null, fullCalcOnLoad: null },
    namedRanges: [],
    sheets: sheets.map((sheet, index) => ({ ...sheet, index })),
    scan: {
      sheetCount: sheets.length,
      cellCount: sheets.reduce((sum, sheet) => sum + sheet.cells.length, 0),
      formulaCellCount: 0,
      rejectedExternalLinks: 0,
      warnings: [],
      unsupported: [],
    },
  };
}

const BALANCE_ROWS: [string, number][] = [
  ["货币资金", 1000.5],
  ["应收账款", 200],
  ["存货", 300.25],
  ["流动资产合计", 1500.75],
  ["固定资产", 500],
];

function balanceCells(): WorkbookCellDto[] {
  const cells: WorkbookCellDto[] = [
    cell(0, 1, "期末余额"),
    cell(0, 2, "年初余额"),
  ];
  BALANCE_ROWS.forEach(([label, amount], index) => {
    const row = index + 1;
    cells.push(cell(row, 0, label));
    cells.push(cell(row, 1, amount));
    cells.push(cell(row, 2, amount));
  });
  return cells;
}

test("label 归一化：枚举/减：/其中：/空白/全角前缀剥落后 exact 匹配", () => {
  assert.equal(normalizeStatementLabel("一、营业收入"), "营业收入");
  assert.equal(normalizeStatementLabel("    减：营业成本"), "营业成本");
  assert.equal(normalizeStatementLabel("（一） 营业收入"), "营业收入");
  assert.equal(normalizeStatementLabel("其中：货币资金"), "货币资金");
  assert.equal(normalizeStatementLabel("流动资产："), "流动资产");
  assert.equal(normalizeStatementLabel("　销售商品、提供劳务收到的现金"), "销售商品、提供劳务收到的现金");
});

test("balance：检测 header 行/label 列/多期间金额列，exact 唯一映射自动接受", () => {
  const detection = detectStatementMapping(dtoOf([sheetDto("报表一", balanceCells())]));
  assert.equal(detection.proposals.length, 1);
  const proposal = detection.best!;
  assert.ok(proposal);
  assert.equal(proposal.structure.reportType, "balance");
  assert.equal(proposal.structure.headerRow, 0);
  assert.equal(proposal.structure.labelColumn, 0);
  assert.deepEqual(
    proposal.structure.amountColumns.map((column) => column.headerText),
    ["期末余额", "年初余额"],
  );
  assert.equal(proposal.structure.mergedHeader, false);
  assert.equal(proposal.autoAcceptedCount, BALANCE_ROWS.length);
  const cash = proposal.lines.find((line) => line.lineCode === "cash")!;
  assert.equal(cash.status, "auto_accepted");
  assert.equal(cash.labelCell, "A2");
  assert.deepEqual(cash.amountCells, ["B2", "C2"]);
  // 未出现的 canonical 行进入 missing 待确认清单。
  assert.ok(proposal.missingLines.length > 0);
  assert.ok(proposal.missingLines.some((line) => line.lineCode === "longTermInvest"));
  assert.equal(proposal.pendingCount, proposal.missingLines.length);
});

test("income：枚举/减：前缀归一化后自动接受", () => {
  const cells: WorkbookCellDto[] = [cell(0, 1, "本期金额")];
  [
    ["一、营业收入", 8000],
    ["减：营业成本", 5000],
    ["        税金及附加", 100],
    ["        销售费用", 200],
  ].forEach(([label, amount], index) => {
    cells.push(cell(index + 1, 0, label as string));
    cells.push(cell(index + 1, 1, amount as number));
  });
  const detection = detectStatementMapping(dtoOf([sheetDto("利润表", cells)]));
  const proposal = detection.best!;
  assert.equal(proposal.structure.reportType, "income");
  assert.equal(proposal.autoAcceptedCount, 4);
  assert.ok(proposal.lines.every((line) => line.status === "auto_accepted"));
});

test("cashflow：含顿号 label 不被前缀规则误剥", () => {
  const cells: WorkbookCellDto[] = [cell(0, 1, "本期金额")];
  [
    ["销售商品、提供劳务收到的现金", 6000],
    ["收到的税费返还", 50],
    ["购买商品、接受劳务支付的现金", 4000],
    ["经营活动产生的现金流量净额", 2050],
  ].forEach(([label, amount], index) => {
    cells.push(cell(index + 1, 0, label as string));
    cells.push(cell(index + 1, 1, amount as number));
  });
  const detection = detectStatementMapping(dtoOf([sheetDto("现金流量表", cells)]));
  const proposal = detection.best!;
  assert.equal(proposal.structure.reportType, "cashflow");
  assert.equal(proposal.autoAcceptedCount, 4);
});

test("重复 label：两个 workbook 行命中同一 canonical 行 → 双方 duplicate，必须人工确认", () => {
  const cells = balanceCells();
  const lastRow = BALANCE_ROWS.length + 1;
  cells.push(cell(lastRow, 0, "货币资金"));
  cells.push(cell(lastRow, 1, 1));
  cells.push(cell(lastRow, 2, 1));
  const detection = detectStatementMapping(dtoOf([sheetDto("报表一", cells)]));
  const proposal = detection.best!;
  const duplicates = proposal.lines.filter((line) => line.status === "duplicate");
  assert.equal(duplicates.length, 2);
  assert.ok(duplicates.every((line) => line.lineCode === "cash"));
  assert.ok(proposal.pendingCount > 0);
});

test("合并 header：merge 覆盖 header 行 → mergedHeader=true", () => {
  const sheet = sheetDto("报表一", balanceCells(), {
    merges: [{ s: { r: 0, c: 1 }, e: { r: 0, c: 2 } }],
  });
  const detection = detectStatementMapping(dtoOf([sheet]));
  assert.equal(detection.best!.structure.mergedHeader, true);
});

test("隐藏 sheet：参与检测但不进入自动 best，必须人工确认", () => {
  const detection = detectStatementMapping(
    dtoOf([sheetDto("隐藏报表", balanceCells(), { visibility: "hidden" })]),
  );
  assert.equal(detection.proposals.length, 1);
  assert.equal(detection.best, null);
  assert.ok(detection.warnings.some((warning) => warning.includes("隐藏")));
});

test("多 sheet 并列命中 → 不自动选择，必须人工确认", () => {
  const detection = detectStatementMapping(
    dtoOf([sheetDto("报表A", balanceCells()), sheetDto("报表B", balanceCells())]),
  );
  assert.equal(detection.proposals.length, 2);
  assert.equal(detection.best, null);
});

test("unmatched/no-match：workbook label 无 canonical 对应 → 待确认清单", () => {
  const cells = balanceCells();
  cells.push(cell(BALANCE_ROWS.length + 1, 0, "待确认自定义行"));
  cells.push(cell(BALANCE_ROWS.length + 1, 1, 42));
  const detection = detectStatementMapping(dtoOf([sheetDto("报表一", cells)]));
  const proposal = detection.best!;
  const unmatched = proposal.lines.find((line) => line.status === "unmatched")!;
  assert.equal(unmatched.label, "待确认自定义行");
  assert.equal(unmatched.lineCode, null);
  assert.ok(proposal.pendingCount > 0);
});

test("强制 reportType：只保留匹配类型的提案", () => {
  const detection = detectStatementMapping(dtoOf([sheetDto("报表一", balanceCells())]), {
    reportType: "income",
  });
  assert.equal(detection.proposals.length, 0);
  assert.equal(detection.best, null);
});
