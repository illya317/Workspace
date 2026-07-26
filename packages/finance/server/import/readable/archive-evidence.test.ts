import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadReadableArchiveEvidence } from "./archive-evidence";
import type { ReadableBatchSpec } from "./types";

const spec: ReadableBatchSpec = {
  companyCode: "ZX01", companyName: "母公司", year: 2026,
  sourceSystem: "T6", sourceLedger: "001", sourceDatabase: "UFDATA_001_2026",
  mappingMode: "recurring", mappingStartYear: 2016, mappingEndYear: 2026,
};

async function fixture(corrupt = false) {
  const root = await mkdtemp(join(tmpdir(), "finance-readable-evidence-"));
  const engine = join(root, "T6");
  const relativeData = "databases/UFDATA_001_2026/data/code.jsonl";
  const data = "{\"ccode\":\"1001\"}\n";
  await mkdir(join(engine, "databases/UFDATA_001_2026/data"), { recursive: true });
  await writeFile(join(root, "source-map.json"), JSON.stringify({
    snapshotDate: "2026-07-14", previousSnapshot: "../2026-07-13",
    cutoff: { date: "2026-06-30", isAccountingClose: false },
    t6: { includedAccountSets: [{ id: "001", years: [2016, 2026] }], excludedAccountSets: [] },
  }));
  await writeFile(join(engine, relativeData), corrupt ? `${data}corrupt` : data);
  await writeFile(join(engine, "manifest.jsonl"), `${JSON.stringify({
    database: "UFDATA_001_2026", table: "code", status: "ok", rows: 1, data: relativeData,
  })}\n`);
  await writeFile(join(engine, "validation-summary.json"), JSON.stringify({
    manifestEntries: 1, missingTables: 0, errorTables: 0, errors: [],
  }));
  const checksum = createHash("sha256").update(data).digest("hex");
  await writeFile(join(engine, "SHA256SUMS.txt"), `${checksum}  ${relativeData}\n`);
  return root;
}

test("verifies readable archive identity and required table checksum", async () => {
  const root = await fixture();
  try {
    const evidence = await loadReadableArchiveEvidence({
      root, spec, requiredTables: [{ database: spec.sourceDatabase, table: "code" }],
    });
    assert.equal(evidence.snapshotDate, "2026-07-14");
    assert.equal(evidence.cutoffDate, "2026-06-30");
    assert.equal(evidence.isAccountingClose, false);
    assert.equal(evidence.validationStatus, "verified");
    assert.equal(evidence.validatedTableCount, 1);
    assert.match(evidence.packageKey, /^[a-f0-9]{64}$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects a required JSONL file whose bytes do not match SHA256SUMS", async () => {
  const root = await fixture(true);
  try {
    await assert.rejects(
      loadReadableArchiveEvidence({
        root, spec, requiredTables: [{ database: spec.sourceDatabase, table: "code" }],
      }),
      /来源文件校验失败/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
