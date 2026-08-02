#!/usr/bin/env node
import "dotenv/config";

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "pg";

import { requireDatabaseUrl } from "../lib/database-url.js";

const INPUT_KIND = "finance-consolidation-entry-migration";
const ENTRY_TYPE = "groupAdjustment";
const DOCUMENT_TYPE = "groupAdjustment";
const POSTING_LEVEL = "30";
const ORIGIN = "manual";

function fail(message) {
  throw new Error(message);
}

function exactKeys(value, expected, label) {
  const actual = Object.keys(value).sort().join(",");
  if (actual !== [...expected].sort().join(",")) fail(`${label} fields are invalid`);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() === value && value.length > 0;
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function money(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function validMoney(value) {
  return Number.isFinite(value) && value >= 0 && money(value) === value;
}

function sameMoney(left, right) {
  return money(left) === money(right);
}

function sha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function canonicalValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== "object") return value;
  const jsonValue = "toJSON" in value && typeof value.toJSON === "function" ? value.toJSON() : value;
  if (jsonValue !== value) return canonicalValue(jsonValue);
  return Object.fromEntries(Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, canonicalValue(item)]));
}

function fingerprint(value) {
  return createHash("sha256").update(JSON.stringify(canonicalValue(value))).digest("hex");
}

function validateDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))) {
    fail(`${label} is invalid`);
  }
}

function validateBatch(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} is invalid`);
  exactKeys(value, [
    "expectedRevision", "expectedSourceFingerprint", "id", "month", "parentCompanyCode", "periodKind", "version", "year",
  ], label);
  if (!positiveInteger(value.id) || !positiveInteger(value.expectedRevision) || !positiveInteger(value.version)
    || !Number.isInteger(value.year) || value.year < 2000 || value.year > 9999
    || !Number.isInteger(value.month) || value.month < 1 || value.month > 12
    || !nonEmptyString(value.parentCompanyCode) || !["month", "quarter", "year"].includes(value.periodKind)
    || !sha256(value.expectedSourceFingerprint)) {
    fail(`${label} is invalid`);
  }
  return value;
}

function validateLine(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("finance consolidation entry line is invalid");
  exactKeys(value, [
    "accountCode", "companyCode", "credit", "debit", "groupAccountCode", "lineCode", "note", "statementType",
  ], "finance consolidation entry line");
  for (const field of ["accountCode", "companyCode", "groupAccountCode", "lineCode", "note"]) {
    if (!nonEmptyString(value[field])) fail(`finance consolidation entry line ${field} is invalid`);
  }
  if (value.statementType !== "balanceSheet" || !validMoney(value.debit) || !validMoney(value.credit)
    || (value.debit === 0) === (value.credit === 0)) {
    fail("finance consolidation entry line amount or statement type is invalid");
  }
  return value;
}

function validateAmountPatch(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} is invalid`);
  const hasPrevious = "previousBefore" in value || "previousAfter" in value;
  exactKeys(value, [
    label.endsWith("line") ? "lineCode" : "key", "before", "after",
    ...(hasPrevious ? ["previousBefore", "previousAfter"] : []),
  ], label);
  const key = label.endsWith("line") ? value.lineCode : value.key;
  if (!nonEmptyString(key) || !validMoney(value.before) || !validMoney(value.after)
    || (hasPrevious && (!validMoney(value.previousBefore) || !validMoney(value.previousAfter)))) {
    fail(`${label} is invalid`);
  }
  return value;
}

function validateSourceRestoration(value, entryLines) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("finance consolidation source restoration is invalid");
  exactKeys(value, [
    "companyCode", "expectedSnapshotFingerprint", "lineAmounts", "reportType", "topLevelAmounts",
  ], "finance consolidation source restoration");
  if (!nonEmptyString(value.companyCode) || value.reportType !== "balanceSheet"
    || !sha256(value.expectedSnapshotFingerprint)
    || !Array.isArray(value.lineAmounts) || value.lineAmounts.length === 0
    || !Array.isArray(value.topLevelAmounts)) {
    fail("finance consolidation source restoration is invalid");
  }
  value.lineAmounts.forEach((item) => validateAmountPatch(item, "finance consolidation source restoration line"));
  value.topLevelAmounts.forEach((item) => validateAmountPatch(item, "finance consolidation source restoration total"));
  const patchByLineCode = new Map(value.lineAmounts.map((item) => [item.lineCode, item]));
  for (const line of entryLines) {
    const patch = patchByLineCode.get(line.lineCode);
    const amount = money(line.debit + line.credit);
    if (!patch || !sameMoney(patch.after - patch.before, amount)) {
      fail(`finance consolidation source line ${line.lineCode} does not restore the entry amount`);
    }
  }
  return value;
}

export function validateFinanceConsolidationEntryMigrationInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("finance consolidation entry migration input is invalid");
  exactKeys(value, ["kind", "migration", "schemaVersion"], "finance consolidation entry migration input");
  if (value.schemaVersion !== 2 || value.kind !== INPUT_KIND
    || !value.migration || typeof value.migration !== "object" || Array.isArray(value.migration)) {
    fail("finance consolidation entry migration input is invalid");
  }
  const migration = value.migration;
  exactKeys(migration, [
    "entry", "incorrectMigration", "legacyPostingDate", "legacyVoucherNo", "sourceKey", "targetBatch",
  ], "finance consolidation entry migration");
  if (!nonEmptyString(migration.sourceKey) || !nonEmptyString(migration.legacyVoucherNo)) {
    fail("finance consolidation entry migration source voucher identity is invalid");
  }
  validateDate(migration.legacyPostingDate, "finance consolidation entry migration legacy posting date");
  validateBatch(migration.targetBatch, "finance consolidation entry migration target batch");

  const entry = migration.entry;
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) fail("finance consolidation entry migration entry is invalid");
  exactKeys(entry, [
    "description", "evidence", "lines", "postingDate", "preparedByName", "preparedByUserId", "preparedByUsername", "title",
  ], "finance consolidation entry migration entry");
  for (const field of ["description", "evidence", "preparedByName", "preparedByUsername", "title"]) {
    if (!nonEmptyString(entry[field])) fail(`finance consolidation entry migration entry ${field} is invalid`);
  }
  validateDate(entry.postingDate, "finance consolidation entry migration posting date");
  if (!positiveInteger(entry.preparedByUserId)
    || !Array.isArray(entry.lines) || entry.lines.length < 2 || entry.lines.length > 50) {
    fail("finance consolidation entry migration entry is invalid");
  }
  entry.lines.forEach(validateLine);
  const debit = money(entry.lines.reduce((sum, line) => sum + line.debit, 0));
  const credit = money(entry.lines.reduce((sum, line) => sum + line.credit, 0));
  if (debit <= 0 || debit !== credit) fail("finance consolidation entry migration must balance");

  const incorrect = migration.incorrectMigration;
  if (!incorrect || typeof incorrect !== "object" || Array.isArray(incorrect)) {
    fail("finance consolidation incorrect migration recovery is invalid");
  }
  exactKeys(incorrect, ["batch", "entryNo", "postingDate", "sourceRestoration"], "finance consolidation incorrect migration recovery");
  validateBatch(incorrect.batch, "finance consolidation incorrect migration batch");
  if (!nonEmptyString(incorrect.entryNo)) fail("finance consolidation incorrect migration entry number is invalid");
  validateDate(incorrect.postingDate, "finance consolidation incorrect migration posting date");
  validateSourceRestoration(incorrect.sourceRestoration, entry.lines);
  if (incorrect.batch.id === migration.targetBatch.id) fail("finance consolidation recovery and target batches must differ");
  return value;
}

function reportLines(reportPayload) {
  const payload = reportPayload?.payload ?? reportPayload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) fail("finance consolidation source payload is invalid");
  return [payload.assets, payload.liabilities, payload.equity]
    .flatMap((rows) => Array.isArray(rows) ? rows : [])
    .filter((row) => row && typeof row === "object" && !Array.isArray(row));
}

export function transferSourcePayload(reportPayload, transfer) {
  const next = JSON.parse(JSON.stringify(reportPayload));
  const rows = reportLines(next);
  for (const patch of transfer.lineAmounts) {
    const matches = rows.filter((row) => row.lineCode === patch.lineCode);
    if (matches.length !== 1 || !sameMoney(matches[0].amount, patch.before)) {
      fail(`finance consolidation source line ${patch.lineCode} differs from the private expectation`);
    }
    matches[0].amount = patch.after;
    if ("previousBefore" in patch) {
      if (!sameMoney(matches[0].previousAmount, patch.previousBefore)) {
        fail(`finance consolidation source line ${patch.lineCode} previous amount differs from the private expectation`);
      }
      matches[0].previousAmount = patch.previousAfter;
    }
  }
  const payload = next.payload ?? next;
  for (const patch of transfer.topLevelAmounts) {
    if (!sameMoney(payload[patch.key], patch.before)) {
      fail(`finance consolidation source top level ${patch.key} differs from the private expectation`);
    }
    payload[patch.key] = patch.after;
  }
  return next;
}

function sourceFingerprint(source, reportPayload) {
  return fingerprint({
    companyId: source.companyId,
    reportType: source.reportType,
    sourceKind: source.sourceKind,
    sourceStatus: source.sourceStatus,
    workpaperId: source.workpaperId,
    workpaperVersion: source.workpaperVersion,
    sourceChecksum: source.sourceChecksum,
    workpaperUpdatedBy: source.workpaperUpdatedBy,
    sourcePackageId: source.sourcePackageId,
    sourcePackageRevision: source.sourcePackageRevision,
    sourcePackageStatus: source.sourcePackageStatus,
    sourcePackageChecksum: source.sourcePackageChecksum,
    sourcePackageUploadedBy: source.sourcePackageUploadedBy,
    sourcePackageSubmittedBy: source.sourcePackageSubmittedBy,
    lineCount: source.lineCount,
    sourcedLineCount: source.sourcedLineCount,
    importedLineCount: source.importedLineCount,
    manualLineCount: source.manualLineCount,
    formulaLineCount: source.formulaLineCount,
    reportPayload,
    evidence: source.evidence,
  });
}

function batchSourceFingerprint(sources) {
  return fingerprint([...sources]
    .sort((left, right) => left.companyId - right.companyId || left.reportType.localeCompare(right.reportType))
    .map((source) => [source.companyId, source.reportType, source.fingerprint]));
}

async function loadExistingEntry(client, batchId, generationKey) {
  const result = await client.query(`
    SELECT entry.* FROM "FinanceConsolidationEntry" AS entry
    WHERE entry."batchId" = $1 AND entry."generationKey" = $2
  `, [batchId, generationKey]);
  if (result.rows.length > 1) fail(`finance consolidation entry ${generationKey} is not unique`);
  if (!result.rows[0]) return null;
  const lines = await client.query(`
    SELECT line.*, account.code AS "groupAccountCode"
    FROM "FinanceConsolidationEntryLine" AS line
    LEFT JOIN "FinanceGroupAccount" AS account ON account.id = line."groupAccountId"
    WHERE line."entryId" = $1 ORDER BY line."lineNo"
  `, [result.rows[0].id]);
  return { ...result.rows[0], lines: lines.rows };
}

function assertEntryLines(existing, entry) {
  if (existing.lines.length !== entry.lines.length) fail(`finance consolidation entry ${existing.entryNo} line count differs`);
  for (let index = 0; index < entry.lines.length; index += 1) {
    const expected = entry.lines[index];
    const actual = existing.lines[index];
    if (actual.lineNo !== index + 1 || actual.companyCode !== expected.companyCode
      || actual.statementType !== expected.statementType || actual.lineCode !== expected.lineCode
      || actual.accountCode !== expected.accountCode || actual.groupAccountCode !== expected.groupAccountCode
      || !sameMoney(actual.debit, expected.debit) || !sameMoney(actual.credit, expected.credit)
      || actual.currencyCode !== "CNY" || actual.periodBasis !== "current" || actual.note !== expected.note) {
      fail(`finance consolidation entry ${existing.entryNo} line ${index + 1} differs from the private input`);
    }
  }
}

function assertCorrectEntryMatches(existing, migration, generationFingerprint) {
  const { entry, targetBatch } = migration;
  const prefix = `${targetBatch.year}-${String(targetBatch.month).padStart(2, "0")}-合-`;
  if (!existing.entryNo.startsWith(prefix) || !/^\d{4}-\d{2}-合-\d{4}$/.test(existing.entryNo)
    || existing.postingDate !== entry.postingDate
    || existing.documentType !== DOCUMENT_TYPE || existing.postingLevel !== POSTING_LEVEL
    || existing.entryType !== ENTRY_TYPE || existing.title !== entry.title
    || existing.description !== entry.description || existing.evidence !== entry.evidence
    || existing.origin !== ORIGIN || existing.status !== "draft"
    || existing.generationFingerprint !== generationFingerprint
    || existing.preparedBy !== entry.preparedByUserId) {
    fail(`finance consolidation entry ${existing.entryNo} already exists with different facts`);
  }
  assertEntryLines(existing, entry);
}

function assertIncorrectEntryMatches(existing, migration) {
  const { entry, incorrectMigration } = migration;
  if (existing.entryNo !== incorrectMigration.entryNo || existing.postingDate !== incorrectMigration.postingDate
    || existing.documentType !== DOCUMENT_TYPE || existing.postingLevel !== POSTING_LEVEL
    || existing.entryType !== ENTRY_TYPE || existing.title !== entry.title
    || existing.description !== entry.description || existing.origin !== ORIGIN
    || existing.status !== "draft" || existing.preparedBy !== entry.preparedByUserId) {
    fail(`finance consolidation incorrect entry ${existing.entryNo} differs from the recovery expectation`);
  }
  assertEntryLines(existing, entry);
}

async function loadLegacyVoucher(client, sourceKey) {
  const result = await client.query(`
    SELECT voucher.* FROM "FinanceVoucher" AS voucher
    WHERE voucher."sourceSystem" = 'WORKSPACE'
      AND voucher."sourceDatabase" = 'governed-data-release'
      AND voucher."sourceKey" = $1
  `, [sourceKey]);
  if (result.rows.length > 1) fail(`finance voucher ${sourceKey} is not unique`);
  if (!result.rows[0]) return null;
  const lines = await client.query(`
    SELECT item.*, account.code AS "accountCode"
    FROM "FinanceVoucherItem" AS item
    JOIN "FinanceAccount" AS account ON account.id = item."accountId"
    WHERE item."voucherId" = $1 ORDER BY item."sortOrder", item.id
  `, [result.rows[0].id]);
  return { ...result.rows[0], lines: lines.rows };
}

function assertLegacyVoucherMatches(voucher, migration) {
  const { entry } = migration;
  const total = money(entry.lines.reduce((sum, line) => sum + line.debit, 0));
  if (voucher.voucherNo !== migration.legacyVoucherNo || voucher.date !== migration.legacyPostingDate
    || voucher.companyCode !== entry.lines[0].companyCode
    || voucher.description !== entry.description || voucher.status !== "posted"
    || voucher.voucherTypeName !== "合并凭证"
    || !sameMoney(voucher.totalDebit, total) || !sameMoney(voucher.totalCredit, total)
    || voucher.lines.length !== entry.lines.length) {
    fail(`finance voucher ${migration.sourceKey} differs from the private expectation`);
  }
  for (let index = 0; index < entry.lines.length; index += 1) {
    const expected = entry.lines[index];
    const actual = voucher.lines[index];
    if (actual.accountCode !== expected.accountCode || !sameMoney(actual.debit, expected.debit)
      || !sameMoney(actual.credit, expected.credit) || actual.description !== expected.note) {
      fail(`finance voucher ${migration.sourceKey} line ${index + 1} differs from the private expectation`);
    }
  }
}

async function loadBatchForUpdate(client, expected, label) {
  const result = await client.query(`
    SELECT id, "parentCompanyCode", year, month, "periodKind", version, revision, status, "sourceFingerprint"
    FROM "FinanceConsolidationBatch" WHERE id = $1 FOR UPDATE
  `, [expected.id]);
  const batch = result.rows[0];
  if (!batch || batch.parentCompanyCode !== expected.parentCompanyCode
    || batch.year !== expected.year || batch.month !== expected.month
    || batch.periodKind !== expected.periodKind || batch.version !== expected.version
    || batch.revision !== expected.expectedRevision || batch.status !== "draft"
    || batch.sourceFingerprint !== expected.expectedSourceFingerprint) {
    fail(`${label} ${expected.id} differs from the private expectation`);
  }
  return batch;
}

async function loadTargets(client, migration) {
  const userResult = await client.query(`SELECT id, username, "canLogin" FROM "User" WHERE id = $1`, [migration.entry.preparedByUserId]);
  const user = userResult.rows[0];
  if (!user || user.username !== migration.entry.preparedByUsername || user.canLogin !== true) {
    fail("finance consolidation entry preparer differs from the private expectation");
  }
  const companyCodes = [...new Set(migration.entry.lines.map((line) => line.companyCode))];
  const entityResult = await client.query(`
    SELECT id, "companyId", "companyCode" FROM "FinanceConsolidationEntitySnapshot"
    WHERE "batchId" = $1 AND "companyCode" = ANY($2::text[])
  `, [migration.targetBatch.id, companyCodes]);
  const entityByCode = new Map(entityResult.rows.map((row) => [row.companyCode, row]));
  if (entityByCode.size !== companyCodes.length) fail("finance consolidation entry entity snapshot differs from the private expectation");
  const groupCodes = [...new Set(migration.entry.lines.map((line) => line.groupAccountCode))];
  const groupAccountResult = await client.query(`
    SELECT id, code, "isActive" FROM "FinanceGroupAccount" WHERE code = ANY($1::text[])
  `, [groupCodes]);
  const groupAccountByCode = new Map(groupAccountResult.rows.map((row) => [row.code, row]));
  if (groupAccountResult.rows.some((row) => row.isActive !== true) || groupAccountByCode.size !== groupCodes.length) {
    fail("finance consolidation entry group account differs from the private expectation");
  }
  return { entityByCode, groupAccountByCode };
}

async function allocateEntryNumber(client, batch) {
  const result = await client.query(`SELECT "entryNo" FROM "FinanceConsolidationEntry" WHERE "batchId" = $1`, [batch.id]);
  const prefix = `${batch.year}-${String(batch.month).padStart(2, "0")}-合-`;
  const nextSequence = result.rows.reduce((maximum, row) => {
    const match = /^(\d{4})-(\d{2})-合-(\d+)$/.exec(row.entryNo);
    return match && `${match[1]}-${match[2]}-合-` === prefix ? Math.max(maximum, Number(match[3])) : maximum;
  }, 0) + 1;
  return `${prefix}${String(nextSequence).padStart(4, "0")}`;
}

async function insertEntry(client, migration, entryNo, generationKey, generationFingerprint, createdAt, targets) {
  const inserted = await client.query(`
    INSERT INTO "FinanceConsolidationEntry" (
      "batchId", "entryNo", "postingDate", "documentType", "postingLevel", "entryType", title,
      description, evidence, origin, "generationKey", "generationFingerprint", status, "preparedBy",
      "createdAt", "updatedAt"
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'draft', $13, $14, now())
    RETURNING id
  `, [
    migration.targetBatch.id, entryNo, migration.entry.postingDate, DOCUMENT_TYPE, POSTING_LEVEL,
    ENTRY_TYPE, migration.entry.title, migration.entry.description, migration.entry.evidence, ORIGIN,
    generationKey, generationFingerprint, migration.entry.preparedByUserId, createdAt,
  ]);
  const entryId = inserted.rows[0].id;
  for (let index = 0; index < migration.entry.lines.length; index += 1) {
    const line = migration.entry.lines[index];
    const entity = targets.entityByCode.get(line.companyCode);
    const groupAccount = targets.groupAccountByCode.get(line.groupAccountCode);
    await client.query(`
      INSERT INTO "FinanceConsolidationEntryLine" (
        "entryId", "lineNo", "entitySnapshotId", "companyId", "companyCode", "statementType", "lineCode",
        "accountCode", "groupAccountId", debit, credit, "currencyCode", "periodBasis", note
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'CNY', 'current', $12)
    `, [
      entryId, index + 1, entity.id, entity.companyId, entity.companyCode, line.statementType, line.lineCode,
      line.accountCode, groupAccount.id, line.debit, line.credit, line.note,
    ]);
  }
  return entryId;
}

async function claimBatchRevision(client, batch, nextSourceFingerprint = batch.sourceFingerprint) {
  const revision = batch.revision + 1;
  const updated = await client.query(`
    UPDATE "FinanceConsolidationBatch" SET revision = $1, "sourceFingerprint" = $2, "updatedAt" = now()
    WHERE id = $3 AND revision = $4 AND status = 'draft' AND "sourceFingerprint" = $5
  `, [revision, nextSourceFingerprint, batch.id, batch.revision, batch.sourceFingerprint]);
  if (updated.rowCount !== 1) fail(`finance consolidation batch ${batch.id} changed during migration`);
  return revision;
}

async function appendMigrationEvent(client, input) {
  await client.query(`
    INSERT INTO "FinanceConsolidationBatchEvent" (
      "batchId", "eventType", action, "fromStatus", "toStatus", note, "actorUserId", "actorName",
      "batchRevision", "targetType", "targetId", snapshot
    ) VALUES ($1, 'mutation', $2, 'draft', 'draft', $3, $4, $5, $6, 'entry', $7, $8::jsonb)
  `, [
    input.batchId, input.action, input.note, input.actorUserId, input.actorName,
    input.batchRevision, input.entryId, JSON.stringify(input.snapshot),
  ]);
}

async function loadSourceSnapshot(client, batchId, restoration) {
  const result = await client.query(`
    SELECT source.*, entity."companyId"
    FROM "FinanceConsolidationSourceSnapshot" AS source
    JOIN "FinanceConsolidationEntitySnapshot" AS entity ON entity.id = source."entitySnapshotId"
    WHERE source."batchId" = $1 AND entity."companyCode" = $2 AND source."reportType" = $3
  `, [batchId, restoration.companyCode, restoration.reportType]);
  if (result.rows.length !== 1) fail("finance consolidation recovery source snapshot differs from the private expectation");
  return result.rows[0];
}

async function restoreIncorrectMigration(client, migration, incorrectEntry, generationFingerprint, targetBatch, targets) {
  const recovery = migration.incorrectMigration;
  const recoveryBatch = await loadBatchForUpdate(client, recovery.batch, "finance consolidation incorrect migration batch");
  const source = await loadSourceSnapshot(client, recoveryBatch.id, recovery.sourceRestoration);
  if (source.fingerprint !== recovery.sourceRestoration.expectedSnapshotFingerprint) {
    fail("finance consolidation recovery source snapshot fingerprint differs from the private expectation");
  }
  const restoredPayload = transferSourcePayload(source.reportPayload, recovery.sourceRestoration);
  const restoredSourceFingerprint = sourceFingerprint(source, restoredPayload);
  await client.query(`
    UPDATE "FinanceConsolidationSourceSnapshot"
    SET "reportPayload" = $1::jsonb, fingerprint = $2, "selectedBy" = $3, "selectedAt" = now()
    WHERE id = $4
  `, [JSON.stringify(restoredPayload), restoredSourceFingerprint, migration.entry.preparedByUserId, source.id]);
  const recoverySources = await client.query(`
    SELECT source."reportType", source.fingerprint, entity."companyId"
    FROM "FinanceConsolidationSourceSnapshot" AS source
    JOIN "FinanceConsolidationEntitySnapshot" AS entity ON entity.id = source."entitySnapshotId"
    WHERE source."batchId" = $1
  `, [recoveryBatch.id]);
  const recoveryBatchFingerprint = batchSourceFingerprint(recoverySources.rows);
  const entryNo = await allocateEntryNumber(client, targetBatch);
  for (let index = 0; index < migration.entry.lines.length; index += 1) {
    const line = migration.entry.lines[index];
    const actual = incorrectEntry.lines[index];
    const entity = targets.entityByCode.get(line.companyCode);
    await client.query(`
      UPDATE "FinanceConsolidationEntryLine"
      SET "entitySnapshotId" = $1, "companyId" = $2, "companyCode" = $3
      WHERE id = $4 AND "entryId" = $5
    `, [entity.id, entity.companyId, entity.companyCode, actual.id, incorrectEntry.id]);
  }
  await client.query(`
    UPDATE "FinanceConsolidationEntry"
    SET "batchId" = $1, "entryNo" = $2, "postingDate" = $3, title = $4, description = $5,
        evidence = $6, "generationFingerprint" = $7, "preparedBy" = $8, "updatedAt" = now()
    WHERE id = $9 AND "batchId" = $10 AND "generationKey" = $11
  `, [
    targetBatch.id, entryNo, migration.entry.postingDate, migration.entry.title, migration.entry.description,
    migration.entry.evidence, generationFingerprint, migration.entry.preparedByUserId, incorrectEntry.id,
    recoveryBatch.id, `data-release:${migration.sourceKey}`,
  ]);
  const recoveryRevision = await claimBatchRevision(client, recoveryBatch, recoveryBatchFingerprint);
  const targetRevision = await claimBatchRevision(client, targetBatch);
  await appendMigrationEvent(client, {
    batchId: recoveryBatch.id,
    action: "entry.migration.correct",
    note: `纠正集团调整归属期间并恢复冻结来源 ${migration.sourceKey}`,
    actorUserId: migration.entry.preparedByUserId,
    actorName: migration.entry.preparedByName,
    batchRevision: recoveryRevision,
    entryId: incorrectEntry.id,
    snapshot: { sourceKey: migration.sourceKey, targetBatchId: targetBatch.id, entryNo, restoredSourceFingerprint },
  });
  await appendMigrationEvent(client, {
    batchId: targetBatch.id,
    action: "entry.migrate",
    note: `从错误合并批次迁入历史人工集团调整 ${migration.sourceKey}`,
    actorUserId: migration.entry.preparedByUserId,
    actorName: migration.entry.preparedByName,
    batchRevision: targetRevision,
    entryId: incorrectEntry.id,
    snapshot: { sourceKey: migration.sourceKey, correctedFromBatchId: recoveryBatch.id, generationFingerprint },
  });
  return {
    createdCount: 0,
    correctedCount: 1,
    alreadyAppliedCount: 0,
    entryId: incorrectEntry.id,
    entryNo,
    targetBatchRevision: targetRevision,
    correctedBatchRevision: recoveryRevision,
    correctedBatchSourceFingerprint: recoveryBatchFingerprint,
  };
}

export async function applyFinanceConsolidationEntryMigration(client, input) {
  const validated = validateFinanceConsolidationEntryMigrationInput(input);
  const migration = validated.migration;
  const generationKey = `data-release:${migration.sourceKey}`;
  const generationFingerprint = fingerprint(validated);
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`workspace-finance-consolidation-entry:${migration.sourceKey}`]);
    const existing = await loadExistingEntry(client, migration.targetBatch.id, generationKey);
    if (existing) {
      assertCorrectEntryMatches(existing, migration, generationFingerprint);
      if (await loadLegacyVoucher(client, migration.sourceKey)) fail(`finance voucher ${migration.sourceKey} still exists after migration`);
      if (await loadExistingEntry(client, migration.incorrectMigration.batch.id, generationKey)) {
        fail(`finance consolidation incorrect entry ${migration.sourceKey} still exists after migration`);
      }
      await client.query("COMMIT");
      return {
        createdCount: 0, correctedCount: 0, alreadyAppliedCount: 1,
        entryId: existing.id, entryNo: existing.entryNo,
      };
    }

    const targetBatch = await loadBatchForUpdate(client, migration.targetBatch, "finance consolidation target batch");
    const targets = await loadTargets(client, migration);
    const incorrectEntry = await loadExistingEntry(client, migration.incorrectMigration.batch.id, generationKey);
    if (incorrectEntry) {
      assertIncorrectEntryMatches(incorrectEntry, migration);
      if (await loadLegacyVoucher(client, migration.sourceKey)) fail(`finance voucher ${migration.sourceKey} unexpectedly coexists with incorrect migration`);
      const result = await restoreIncorrectMigration(
        client, migration, incorrectEntry, generationFingerprint, targetBatch, targets,
      );
      await client.query("COMMIT");
      return result;
    }

    const legacyVoucher = await loadLegacyVoucher(client, migration.sourceKey);
    if (!legacyVoucher) fail(`finance voucher ${migration.sourceKey} does not exist`);
    assertLegacyVoucherMatches(legacyVoucher, migration);
    const entryNo = await allocateEntryNumber(client, targetBatch);
    const entryId = await insertEntry(
      client, migration, entryNo, generationKey, generationFingerprint, legacyVoucher.createdAt, targets,
    );
    const removedVoucher = await client.query(`DELETE FROM "FinanceVoucher" WHERE id = $1`, [legacyVoucher.id]);
    if (removedVoucher.rowCount !== 1) fail("finance voucher changed during migration");
    const targetRevision = await claimBatchRevision(client, targetBatch);
    await appendMigrationEvent(client, {
      batchId: targetBatch.id,
      action: "entry.migrate",
      note: `从 FinanceVoucher 迁移历史人工集团调整 ${migration.sourceKey}`,
      actorUserId: migration.entry.preparedByUserId,
      actorName: migration.entry.preparedByName,
      batchRevision: targetRevision,
      entryId,
      snapshot: { sourceKey: migration.sourceKey, removedVoucherId: legacyVoucher.id, generationFingerprint },
    });
    await client.query("COMMIT");
    return {
      createdCount: 1,
      correctedCount: 0,
      alreadyAppliedCount: 0,
      entryId,
      entryNo,
      removedVoucherId: legacyVoucher.id,
      targetBatchRevision: targetRevision,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  if (!process.argv.includes("--execute")) fail("repair requires --execute through the governed data-release handler");
  const inputFile = process.argv.find((argument) => argument.startsWith("--input-file="))?.slice(13);
  if (!inputFile || !path.isAbsolute(inputFile) || !fs.statSync(inputFile).isFile()) {
    fail("repair requires --input-file=<absolute-file>");
  }
  const input = validateFinanceConsolidationEntryMigrationInput(JSON.parse(fs.readFileSync(inputFile, "utf8")));
  const client = new Client({
    connectionString: requireDatabaseUrl(),
    application_name: "workspace-finance-consolidation-entry-migration",
  });
  await client.connect();
  try {
    const result = await applyFinanceConsolidationEntryMigration(client, input);
    process.stdout.write(`${JSON.stringify({ completed: true, sourceKey: input.migration.sourceKey, ...result })}\n`);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
