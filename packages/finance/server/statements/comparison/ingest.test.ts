import assert from "node:assert/strict";
import test from "node:test";

import { ingestWorkbookEvidence } from "./ingest";
import { cellChannelKey } from "./workbook-dto";
import { balanceSheetFixture, buildWorkbookBuffer } from "./workbook-test-fixtures.test";

const FILE_NAME = "匿名化合成报表.xlsx";
const MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function ingest(bytes: Buffer, fileName = FILE_NAME, mimeType = MIME) {
  return ingestWorkbookEvidence({ bytes, fileName, mimeType });
}

test("envelope：扩展名/MIME 不合格 → unsupported_type（不进入 preflight）", async () => {
  const wrongExt = await ingest(buildWorkbookBuffer([balanceSheetFixture()]), "报表.xls");
  assert.equal(wrongExt.ok, false);
  if (!wrongExt.ok) {
    assert.equal(wrongExt.stage, "envelope");
    assert.equal(wrongExt.failureCode, "unsupported_type");
  }

  const wrongMime = await ingest(buildWorkbookBuffer([balanceSheetFixture()]), FILE_NAME, "application/pdf");
  assert.equal(wrongMime.ok, false);
  if (!wrongMime.ok) assert.equal(wrongMime.failureCode, "unsupported_type");
});

test("preflight 阶段：MIME 伪造的非 ZIP 内容 → not_ooxml_zip，stage=preflight", async () => {
  const outcome = await ingest(Buffer.from("definitely not a zip file ..............."));
  assert.equal(outcome.ok, false);
  if (!outcome.ok) {
    assert.equal(outcome.stage, "preflight");
    assert.equal(outcome.failureCode, "not_ooxml_zip");
  }
});

test("正常 fixture 全链路：preflight → worker parse → DTO → 公式 trace → scan 摘要", async () => {
  const bytes = buildWorkbookBuffer([balanceSheetFixture()]);
  const outcome = await ingest(bytes);
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;

  const { analysis, scanSummary, snapshotFingerprint, parserVersion } = outcome;
  assert.match(scanSummary.sha256, /^[0-9a-f]{64}$/);
  assert.match(snapshotFingerprint, /^[0-9a-f]{64}$/);
  assert.match(parserVersion, /^finance-workbook-ingest-v1\+sheetjs-ce@0\.20\./);

  const { dto, recalculation } = analysis;
  assert.equal(dto.version, 1);
  assert.equal(dto.file.fileName, FILE_NAME);
  assert.equal(dto.file.fileSize, bytes.byteLength);
  assert.equal(dto.file.sha256, scanSummary.sha256);
  assert.match(dto.workbookFingerprint, /^[0-9a-f]{64}$/);
  assert.equal(dto.sheets.length, 1);

  // 公式 trace：cached/recalculated 双通道，一致时 trust=recalculated_match。
  const key = cellChannelKey("报表一", "B5");
  const traced = recalculation.cells[key];
  assert.ok(traced, `recalculation channel 应包含 ${key}`);
  assert.equal(traced.formula, "SUM(B2:B4)");
  assert.equal(traced.cachedValue, 1500.75);
  assert.equal(traced.recalculatedValue, 1500.75);
  assert.equal(traced.trust, "recalculated_match");
  assert.deepEqual(
    [...traced.precedents].sort(),
    ["报表一!B2", "报表一!B3", "报表一!B4"],
  );
});

test("cached/recalculated mismatch 保持可见：cached 不被覆盖，trust=recalculated_mismatch", async () => {
  const sheet = balanceSheetFixture();
  sheet.cells.B5 = { t: "n", f: "SUM(B2:B4)", v: 9999, z: "#,##0.00" };
  const outcome = await ingest(buildWorkbookBuffer([sheet]));
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;

  const dto = outcome.analysis.dto.sheets[0]!.cells.find((cell) => cell.a1 === "B5");
  assert.ok(dto);
  assert.equal(dto.cachedValue, 9999, "DTO 保留源 workbook 缓存值原样");

  const traced = outcome.analysis.recalculation.cells[cellChannelKey("报表一", "B5")]!;
  assert.equal(traced.cachedValue, 9999, "cached 通道不被重算覆盖");
  assert.equal(traced.recalculatedValue, 1500.75);
  assert.equal(traced.trust, "recalculated_mismatch");
});

test("跨 sheet 公式前驱在重算通道中保留", async () => {
  const detail = balanceSheetFixture({ name: "明细" });
  const summary = {
    name: "汇总",
    cells: {
      A1: { t: "s" as const, v: "货币资金" },
      B1: { t: "n" as const, f: "明细!B2*2", v: 2001 },
    },
  };
  const outcome = await ingest(buildWorkbookBuffer([detail, summary]));
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  const traced = outcome.analysis.recalculation.cells[cellChannelKey("汇总", "B1")]!;
  assert.equal(traced.recalculatedValue, 2001);
  assert.deepEqual(traced.precedents, ["明细!B2"]);
});

test("解析阶段失败带明确 failureCode（stage=parse）", async () => {
  // 通过 preflight 的最小 OOXML 但不是合法 workbook 内容 → SheetJS parse 失败。
  const { buildMinimalOoxmlZip } = await import("./zip-test-fixtures");
  const outcome = await ingest(buildMinimalOoxmlZip());
  assert.equal(outcome.ok, false);
  if (!outcome.ok) {
    assert.equal(outcome.stage, "parse");
    assert.ok(
      ["parse_failed", "worker_crash", "too_many_sheets"].includes(outcome.failureCode),
      `unexpected failureCode: ${outcome.failureCode}`,
    );
  }
});
