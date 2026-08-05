import assert from "node:assert/strict";
import test from "node:test";

import {
  applyFinanceConsolidationEntryMigration,
  transferSourcePayload,
  validateFinanceConsolidationEntryMigrationInput,
} from "./repair-finance-consolidation-entry.mjs";

const amount = 94_191_934.71;
const sourceKey = "2026-07-28-finance-consolidation-voucher-2023-01-he-0001-v1";

function input() {
  return {
    schemaVersion: 2,
    kind: "finance-consolidation-entry-migration",
    migration: {
      sourceKey,
      legacyVoucherNo: "2023-01-合-0001",
      legacyPostingDate: "2023-01-01",
      targetBatch: {
        id: 29,
        parentCompanyCode: "01",
        year: 2023,
        month: 1,
        periodKind: "month",
        version: 1,
        expectedRevision: 1,
        expectedSourceFingerprint: "b".repeat(64),
      },
      entry: {
        postingDate: "2023-01-01",
        title: "江苏欣晨建设工程有限公司在建工程款",
        description: "江苏欣晨建设工程有限公司在建工程款",
        evidence: "历史集团调整；自 2023-01-01 起生效；借记在建工程，贷记其他应付款",
        preparedByUserId: 474,
        preparedByUsername: "liuxin",
        preparedByName: "刘鑫",
        lines: [{
          companyCode: "01",
          statementType: "balanceSheet",
          lineCode: "constructionInProgress",
          accountCode: "1604",
          groupAccountCode: "1604",
          debit: amount,
          credit: 0,
          note: "江苏欣晨建设工程有限公司在建工程款",
        }, {
          companyCode: "01",
          statementType: "balanceSheet",
          lineCode: "otherPayables",
          accountCode: "2241",
          groupAccountCode: "2241",
          debit: 0,
          credit: amount,
          note: "江苏欣晨建设工程有限公司在建工程款",
        }],
      },
      incorrectMigration: {
        batch: {
          id: 28,
          parentCompanyCode: "01",
          year: 2026,
          month: 6,
          periodKind: "month",
          version: 1,
          expectedRevision: 7,
          expectedSourceFingerprint: "c".repeat(64),
        },
        entryNo: "2026-06-合-0013",
        postingDate: "2026-06-30",
        sourceRestoration: {
          companyCode: "01",
          reportType: "balanceSheet",
          expectedSnapshotFingerprint: "a".repeat(64),
          lineAmounts: [
            { lineCode: "constructionInProgress", before: 12_249_183.65, after: 106_441_118.36,
              previousBefore: 12_249_183.65, previousAfter: 106_441_118.36 },
            { lineCode: "totalNonCurrentAssets", before: 103_880_916.58, after: 198_072_851.29,
              previousBefore: 104_058_184.69, previousAfter: 198_250_119.4 },
            { lineCode: "totalAssets", before: 191_996_899.03, after: 286_188_833.74,
              previousBefore: 191_731_154.3, previousAfter: 285_923_089.01 },
            { lineCode: "otherPayables", before: 140_811_390.84, after: 235_003_325.55,
              previousBefore: 138_194_970.92, previousAfter: 232_386_905.63 },
            { lineCode: "totalCurrentLiabilities", before: 200_744_334.43, after: 294_936_269.14,
              previousBefore: 196_851_790.18, previousAfter: 291_043_724.89 },
          ],
          topLevelAmounts: [
            { key: "totalLiabilitiesAndEquity", before: 191_996_899.03, after: 286_188_833.74 },
            { key: "previousTotalLiabilitiesAndEquity", before: 191_731_154.3, after: 285_923_089.01 },
          ],
        },
      },
    },
  };
}

function reducedReportPayload() {
  return {
    httpStatus: 200,
    capturedAt: "2026-07-28T12:31:48.745Z",
    payload: {
      assets: [
        { lineCode: "constructionInProgress", amount: 12_249_183.65, previousAmount: 12_249_183.65 },
        { lineCode: "totalNonCurrentAssets", amount: 103_880_916.58, previousAmount: 104_058_184.69 },
        { lineCode: "totalAssets", amount: 191_996_899.03, previousAmount: 191_731_154.3 },
      ],
      liabilities: [
        { lineCode: "otherPayables", amount: 140_811_390.84, previousAmount: 138_194_970.92 },
        { lineCode: "totalCurrentLiabilities", amount: 200_744_334.43, previousAmount: 196_851_790.18 },
      ],
      equity: [],
      totalLiabilitiesAndEquity: 191_996_899.03,
      previousTotalLiabilitiesAndEquity: 191_731_154.3,
    },
  };
}

function batchRow(batch) {
  return {
    id: batch.id,
    parentCompanyCode: batch.parentCompanyCode,
    year: batch.year,
    month: batch.month,
    periodKind: batch.periodKind,
    version: batch.version,
    revision: batch.expectedRevision,
    status: "draft",
    sourceFingerprint: batch.expectedSourceFingerprint,
  };
}

function targetRows() {
  return {
    entities: [{ id: 150, companyId: 8, companyCode: "01" }],
    accounts: [
      { id: 2065, code: "1604", isActive: true },
      { id: 2098, code: "2241", isActive: true },
    ],
  };
}

function legacyVoucher() {
  return {
    id: 121777,
    voucherNo: "2023-01-合-0001",
    date: "2023-01-01",
    companyCode: "01",
    description: "江苏欣晨建设工程有限公司在建工程款",
    status: "posted",
    voucherTypeName: "合并凭证",
    totalDebit: String(amount),
    totalCredit: String(amount),
    createdAt: new Date("2026-07-28T12:23:57.633Z"),
  };
}

function entryLines() {
  return [{
    id: 1001, lineNo: 1, companyCode: "01", statementType: "balanceSheet",
    lineCode: "constructionInProgress", accountCode: "1604", groupAccountCode: "1604",
    debit: String(amount), credit: "0", currencyCode: "CNY", periodBasis: "current",
    note: "江苏欣晨建设工程有限公司在建工程款",
  }, {
    id: 1002, lineNo: 2, companyCode: "01", statementType: "balanceSheet",
    lineCode: "otherPayables", accountCode: "2241", groupAccountCode: "2241",
    debit: "0", credit: String(amount), currencyCode: "CNY", periodBasis: "current",
    note: "江苏欣晨建设工程有限公司在建工程款",
  }];
}

test("manual group adjustment migration targets its effective consolidation batch", () => {
  assert.deepEqual(validateFinanceConsolidationEntryMigrationInput(input()), input());
  const invalid = input();
  invalid.migration.entry.lines[1].credit = 94_191_934.70;
  assert.throws(() => validateFinanceConsolidationEntryMigrationInput(invalid), /must balance/);
});

test("recovery restores current source amounts while preserving comparative facts", () => {
  const next = transferSourcePayload(reducedReportPayload(), input().migration.incorrectMigration.sourceRestoration);
  const construction = next.payload.assets.find((line) => line.lineCode === "constructionInProgress");
  assert.equal(construction.amount, 106_441_118.36);
  assert.equal(construction.previousAmount, 106_441_118.36);
  assert.equal(next.payload.totalLiabilitiesAndEquity, 286_188_833.74);
  assert.equal(next.payload.previousTotalLiabilitiesAndEquity, 285_923_089.01);
});

test("fresh migration allocates 2023-01-合-0001 in the target batch and deletes the legacy voucher", async () => {
  const migration = input();
  const statements = [];
  const targets = targetRows();
  const client = {
    query: async (sql, parameters = []) => {
      statements.push({ sql, parameters });
      if (sql.includes('FROM "FinanceConsolidationEntry" AS entry')) return { rows: [] };
      if (sql.includes('FROM "FinanceConsolidationBatch" WHERE id')) return { rows: [batchRow(migration.migration.targetBatch)] };
      if (sql.includes('FROM "User"')) return { rows: [{ id: 474, username: "liuxin", canLogin: true }] };
      if (sql.includes('FROM "FinanceConsolidationEntitySnapshot"')) return { rows: targets.entities };
      if (sql.includes('FROM "FinanceGroupAccount"')) return { rows: targets.accounts };
      if (sql.includes('SELECT voucher.* FROM "FinanceVoucher"')) return { rows: [legacyVoucher()] };
      if (sql.includes('SELECT line.id, line."sourceKind"')) return { rows: [] };
      if (sql.includes('FROM "FinanceVoucherItem" AS item')) return { rows: [
        { id: 501, accountCode: "1604", debit: String(amount), credit: "0", description: "江苏欣晨建设工程有限公司在建工程款" },
        { id: 502, accountCode: "2241", debit: "0", credit: String(amount), description: "江苏欣晨建设工程有限公司在建工程款" },
      ] };
      if (sql.includes('SELECT "entryNo" FROM "FinanceConsolidationEntry"')) return { rows: [] };
      if (sql.includes('INSERT INTO "FinanceConsolidationEntry"')) return { rows: [{ id: 129 }] };
      if (sql.includes('UPDATE "FinanceConsolidationBatch"')) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
  };

  const result = await applyFinanceConsolidationEntryMigration(client, migration);
  assert.equal(result.entryId, 129);
  assert.equal(result.entryNo, "2023-01-合-0001");
  assert.equal(result.removedVoucherId, 121777);
  assert.equal(result.targetBatchRevision, 2);
  assert.equal(statements[0].sql, "BEGIN");
  assert.equal(statements.at(-1).sql, "COMMIT");
  assert.equal(statements.filter((statement) => statement.sql.includes('INSERT INTO "FinanceConsolidationEntryLine"')).length, 2);
  assert.equal(statements.some((statement) => statement.sql.includes('UPDATE "FinanceConsolidationSourceSnapshot"')), false);
});

test("fresh migration archives a referenced legacy voucher without mutating published entry lines", async () => {
  const migration = input();
  const statements = [];
  const targets = targetRows();
  const client = {
    query: async (sql, parameters = []) => {
      statements.push({ sql, parameters });
      if (sql.includes('FROM "FinanceConsolidationEntry" AS entry')) return { rows: [] };
      if (sql.includes('FROM "FinanceConsolidationBatch" WHERE id')) return { rows: [batchRow(migration.migration.targetBatch)] };
      if (sql.includes('FROM "User"')) return { rows: [{ id: 474, username: "liuxin", canLogin: true }] };
      if (sql.includes('FROM "FinanceConsolidationEntitySnapshot"')) return { rows: targets.entities };
      if (sql.includes('FROM "FinanceGroupAccount"')) return { rows: targets.accounts };
      if (sql.includes('SELECT voucher.* FROM "FinanceVoucher"')) return { rows: [legacyVoucher()] };
      if (sql.includes('SELECT line.id, line."sourceKind"')) return { rows: [{
        id: 700,
        sourceKind: "voucher",
        sourceId: "voucher:501",
        sourceVoucherItemId: 501,
      }] };
      if (sql.includes('FROM "FinanceVoucherItem" AS item')) return { rows: [
        { id: 501, accountCode: "1604", debit: String(amount), credit: "0", description: "江苏欣晨建设工程有限公司在建工程款" },
        { id: 502, accountCode: "2241", debit: "0", credit: String(amount), description: "江苏欣晨建设工程有限公司在建工程款" },
      ] };
      if (sql.includes('SELECT "entryNo" FROM "FinanceConsolidationEntry"')) return { rows: [] };
      if (sql.includes('INSERT INTO "FinanceConsolidationEntry"')) return { rows: [{ id: 129 }] };
      if (sql.includes('UPDATE "FinanceConsolidationBatch"')) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
  };

  const result = await applyFinanceConsolidationEntryMigration(client, migration);
  assert.equal(result.removedVoucherId, null);
  assert.equal(result.archivedVoucherId, 121777);
  assert.equal(result.preservedReferenceCount, 1);
  assert.equal(statements.some((statement) => statement.sql.includes('SET status = \'archived\'')), true);
  assert.equal(statements.some((statement) => statement.sql.includes('UPDATE "FinanceConsolidationEntryLine"')), false);
  assert.equal(statements.some((statement) => statement.sql.includes('DELETE FROM "FinanceVoucher"')), false);
});

test("recovery moves the incorrect 2026 entry and restores the 2026 frozen source", async () => {
  const migration = input();
  const statements = [];
  const targets = targetRows();
  let restoredFingerprint = null;
  const incorrectEntry = {
    id: 129,
    batchId: 28,
    entryNo: "2026-06-合-0013",
    postingDate: "2026-06-30",
    documentType: "groupAdjustment",
    postingLevel: "30",
    entryType: "groupAdjustment",
    title: migration.migration.entry.title,
    description: migration.migration.entry.description,
    evidence: "旧迁移证据",
    origin: "manual",
    status: "draft",
    preparedBy: 474,
  };
  const client = {
    query: async (sql, parameters = []) => {
      statements.push({ sql, parameters });
      if (sql.includes('FROM "FinanceConsolidationEntry" AS entry')) {
        if (parameters[0] === 28) return { rows: [incorrectEntry] };
        return { rows: [] };
      }
      if (sql.includes('FROM "FinanceConsolidationEntryLine" AS line')) return { rows: entryLines() };
      if (sql.includes('FROM "FinanceConsolidationBatch" WHERE id')) {
        return { rows: [batchRow(parameters[0] === 29
          ? migration.migration.targetBatch
          : migration.migration.incorrectMigration.batch)] };
      }
      if (sql.includes('FROM "User"')) return { rows: [{ id: 474, username: "liuxin", canLogin: true }] };
      if (sql.includes('FROM "FinanceConsolidationEntitySnapshot"') && sql.includes('ANY')) return { rows: targets.entities };
      if (sql.includes('FROM "FinanceGroupAccount"')) return { rows: targets.accounts };
      if (sql.includes('SELECT voucher.* FROM "FinanceVoucher"')) return { rows: [] };
      if (sql.includes('FROM "FinanceConsolidationSourceSnapshot" AS source') && sql.includes('entity."companyCode"')) {
        return { rows: [{
          id: 457, batchId: 28, entitySnapshotId: 145, reportType: "balanceSheet", companyId: 8,
          sourceKind: "system", sourceStatus: "available", workpaperId: null, workpaperVersion: null,
          sourceChecksum: null, workpaperUpdatedBy: null, sourcePackageId: null, sourcePackageRevision: null,
          sourcePackageStatus: null, sourcePackageChecksum: null, sourcePackageUploadedBy: null,
          sourcePackageSubmittedBy: null, lineCount: 874, sourcedLineCount: 874, importedLineCount: 0,
          manualLineCount: 0, formulaLineCount: 0, reportPayload: reducedReportPayload(),
          fingerprint: "a".repeat(64), evidence: "系统自动快照",
        }] };
      }
      if (sql.includes('UPDATE "FinanceConsolidationSourceSnapshot"')) {
        restoredFingerprint = parameters[1];
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('source."reportType", source.fingerprint')) {
        return { rows: [{ reportType: "balanceSheet", fingerprint: restoredFingerprint, companyId: 8 }] };
      }
      if (sql.includes('SELECT "entryNo" FROM "FinanceConsolidationEntry"')) return { rows: [] };
      if (sql.includes('UPDATE "FinanceConsolidationBatch"')) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
  };

  const result = await applyFinanceConsolidationEntryMigration(client, migration);
  assert.equal(result.correctedCount, 1);
  assert.equal(result.entryId, 129);
  assert.equal(result.entryNo, "2023-01-合-0001");
  assert.equal(result.targetBatchRevision, 2);
  assert.equal(result.correctedBatchRevision, 8);
  assert.equal(statements.filter((statement) => statement.sql.includes('UPDATE "FinanceConsolidationEntryLine"')).length, 2);
  assert.equal(statements.some((statement) => statement.sql.includes('UPDATE "FinanceConsolidationSourceSnapshot"')), true);
  assert.equal(statements.at(-1).sql, "COMMIT");
});
