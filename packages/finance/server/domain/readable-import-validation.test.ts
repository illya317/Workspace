import assert from "node:assert/strict";
import test from "node:test";

import { buildFinanceReadableBatchWriteCommand } from "./readable-import-validation";

test("normalizes a supported readable finance batch scope", () => {
  const result = buildFinanceReadableBatchWriteCommand({
    companyCode: " 01 ",
    companyName: " 丰华生物 ",
    year: 2025,
    sourceSystem: "T6",
    sourceLedger: " 001 ",
    sourceDatabase: " UFDATA_001_2025 ",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.data, {
    companyCode: "01",
    companyName: "丰华生物",
    year: 2025,
    sourceSystem: "T6",
    sourceLedger: "001",
    sourceDatabase: "UFDATA_001_2025",
  });
});

test("rejects an unsupported readable finance source system", () => {
  const result = buildFinanceReadableBatchWriteCommand({
    companyCode: "01",
    companyName: "丰华生物",
    year: 2025,
    sourceSystem: "UNKNOWN",
    sourceLedger: "001",
    sourceDatabase: "UFDATA_001_2025",
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.field, "sourceSystem");
});
