import assert from "node:assert/strict";
import test from "node:test";

import { buildFinanceReadableBatchWriteCommand } from "./readable-import-validation";

test("normalizes a supported readable finance batch scope", () => {
  const result = buildFinanceReadableBatchWriteCommand({
    companyCode: " ZX01 ",
    companyName: " 示例集团 ",
    year: 2025,
    sourceSystem: "T6",
    sourceLedger: " 001 ",
    sourceDatabase: " UFDATA_001_2025 ",
    mappingMode: "recurring",
    mappingStartYear: 2016,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.data, {
    companyCode: "ZX01",
    companyName: "示例集团",
    year: 2025,
    sourceSystem: "T6",
    sourceLedger: "001",
    sourceDatabase: "UFDATA_001_2025",
    mappingMode: "recurring",
    mappingStartYear: 2016,
  });
});

test("rejects an unsupported readable finance source system", () => {
  const result = buildFinanceReadableBatchWriteCommand({
    companyCode: "ZX01",
    companyName: "示例集团",
    year: 2025,
    sourceSystem: "UNKNOWN",
    sourceLedger: "001",
    sourceDatabase: "UFDATA_001_2025",
    mappingMode: "recurring",
    mappingStartYear: 2016,
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.field, "sourceSystem");
});

test("keeps TPlus as a historical-only source", () => {
  const result = buildFinanceReadableBatchWriteCommand({
    companyCode: "ZX03",
    companyName: "示例子公司乙",
    year: 2025,
    sourceSystem: "TPLUS",
    sourceLedger: "UFTData229584_000001",
    sourceDatabase: "UFTData229584_000001",
    mappingMode: "recurring",
    mappingStartYear: 2019,
    mappingEndYear: 2025,
    continuationOf: "T6/016",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.field, "mappingMode");
});

test("accepts one bounded TPlus history mapping into its successor T6 ledger", () => {
  const result = buildFinanceReadableBatchWriteCommand({
    companyCode: "ZX03",
    companyName: "示例子公司乙",
    year: 2025,
    sourceSystem: "TPLUS",
    sourceLedger: "UFTData229584_000001",
    sourceDatabase: "UFTData229584_000001",
    mappingMode: "historical",
    mappingStartYear: 2019,
    mappingEndYear: 2025,
    continuationOf: "T6/016",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.continuationOf, "T6/016");
  assert.equal(result.data.mappingEndYear, 2025);
});
