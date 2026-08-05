import assert from "node:assert/strict";
import test from "node:test";

import { defaultWorkbookIngestLimits } from "./limits";
import { parseWorkbookInWorker } from "./worker-host";
import { balanceSheetFixture, buildWorkbookBuffer, type FixtureSheet } from "./workbook-test-fixtures.test";

const TIMEOUT_WORKER = "setInterval(() => {}, 1000);";
const CRASH_WORKER = 'throw new Error("boom");';
const EXIT_WORKER = "process.exit(3);";
const INVALID_RESULT_WORKER =
  'require("node:worker_threads").parentPort.postMessage({ ok: true, result: {} });';

test("隔离 worker 解析正常 workbook：DTO 含地址/类型/原值/格式文本/公式/缓存值/数字格式", async () => {
  const bytes = buildWorkbookBuffer([balanceSheetFixture()]);
  const outcome = await parseWorkbookInWorker({ bytes });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;

  const { result } = outcome;
  assert.equal(result.parser.id, "sheetjs-ce");
  assert.match(result.parser.version, /^0\.20\./);
  assert.equal(result.sheets.length, 1);
  const sheet = result.sheets[0]!;
  assert.equal(sheet.name, "报表一");
  assert.equal(sheet.visibility, "visible");
  assert.equal(sheet.usedRange, "A1:C6");

  const label = sheet.cells.find((cell) => cell.a1 === "A2");
  assert.ok(label);
  assert.equal(label.type, "s");
  assert.equal(label.value, "货币资金");
  assert.equal(label.row, 1);
  assert.equal(label.col, 0);

  const total = sheet.cells.find((cell) => cell.a1 === "B5");
  assert.ok(total);
  assert.equal(total.formula, "SUM(B2:B4)");
  assert.equal(total.cachedValue, 1500.75);
  assert.equal(total.numberFormat, "#,##0.00");

  const plain = sheet.cells.find((cell) => cell.a1 === "B2");
  assert.ok(plain);
  assert.equal(plain.formula, null);
  assert.equal(plain.text, "1,000.50");
  assert.equal(plain.cachedValue, undefined);

  assert.equal(result.scan.sheetCount, 1);
  assert.equal(result.scan.cellCount, 17);
  assert.equal(result.scan.formulaCellCount, 1);
});

test("隐藏 sheet 的 visibility 原样保留", async () => {
  const bytes = buildWorkbookBuffer([
    balanceSheetFixture({ name: "可见" }),
    balanceSheetFixture({ name: "隐藏", hidden: 1 }),
    balanceSheetFixture({ name: "深度隐藏", hidden: 2 }),
  ]);
  const outcome = await parseWorkbookInWorker({ bytes });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.deepEqual(
    outcome.result.sheets.map((sheet) => sheet.visibility),
    ["visible", "hidden", "veryHidden"],
  );
});

test("worksheets 超过 64 → too_many_sheets（fail closed）", async () => {
  const sheets: FixtureSheet[] = [];
  for (let index = 0; index < 65; index += 1) {
    sheets.push({ name: `S${index}`, cells: { A1: { t: "n", v: index } } });
  }
  const outcome = await parseWorkbookInWorker({ bytes: buildWorkbookBuffer(sheets) });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.failureCode, "too_many_sheets");
});

test("parsed cells 超限 → too_many_cells（fail closed）", async () => {
  const bytes = buildWorkbookBuffer([balanceSheetFixture()]);
  const outcome = await parseWorkbookInWorker({
    bytes,
    limits: { ...defaultWorkbookIngestLimits(), maxParsedCells: 3 },
  });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.failureCode, "too_many_cells");
});

test("formula cells 超限 → too_many_formulas（fail closed）", async () => {
  const sheet = balanceSheetFixture();
  sheet.cells.B6 = { t: "n", f: "B2+B3", v: 1200.5 };
  const outcome = await parseWorkbookInWorker({
    bytes: buildWorkbookBuffer([sheet]),
    limits: { ...defaultWorkbookIngestLimits(), maxFormulaCells: 1 },
  });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.failureCode, "too_many_formulas");
});

test("单公式长度超限 → formula_too_long（fail closed）", async () => {
  const outcome = await parseWorkbookInWorker({
    bytes: buildWorkbookBuffer([balanceSheetFixture()]),
    limits: { ...defaultWorkbookIngestLimits(), maxFormulaLength: 4 },
  });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.failureCode, "formula_too_long");
});

test("网络/外部引用公式 → external_reference_formula（fail closed）", async () => {
  const bytes = buildWorkbookBuffer([
    {
      name: "S",
      cells: {
        A1: { t: "str", f: 'WEBSERVICE("https://example.invalid/api")', v: "" },
      },
    },
  ]);
  const outcome = await parseWorkbookInWorker({ bytes });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.failureCode, "external_reference_formula");
});

test("worker wall-time 超时 → worker_timeout（fail closed，terminate）", async () => {
  const outcome = await parseWorkbookInWorker({
    bytes: Buffer.alloc(4),
    workerSource: TIMEOUT_WORKER,
    timeoutMs: 250,
  });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.failureCode, "worker_timeout");
});

test("worker 抛异常崩溃 → worker_crash（fail closed）", async () => {
  const outcome = await parseWorkbookInWorker({ bytes: Buffer.alloc(4), workerSource: CRASH_WORKER });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.failureCode, "worker_crash");
});

test("worker 非零退出码 → worker_crash（fail closed）", async () => {
  const outcome = await parseWorkbookInWorker({ bytes: Buffer.alloc(4), workerSource: EXIT_WORKER });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.failureCode, "worker_crash");
});

test("worker 返回无法识别的消息 → worker_result_invalid（不信任 worker 输出）", async () => {
  const outcome = await parseWorkbookInWorker({ bytes: Buffer.alloc(4), workerSource: INVALID_RESULT_WORKER });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.failureCode, "worker_result_invalid");
});
