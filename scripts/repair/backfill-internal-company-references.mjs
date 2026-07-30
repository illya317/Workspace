#!/usr/bin/env node

import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";

import { requireDatabaseUrl } from "../lib/database-url.js";

const execute = process.argv.includes("--execute");
const option = (key) => process.argv.find((argument) => argument.startsWith(`--${key}=`))?.slice(key.length + 3) ?? null;
const required = (key) => option(key) || (() => { throw new Error(`缺少 --${key}=...`); })();

const releaseId = required("release-id").trim();
const referenceFile = path.resolve(required("reference-file"));
if (!releaseId || !path.isAbsolute(referenceFile) || !fs.existsSync(referenceFile)) {
  throw new Error("release-id 与 reference-file 必须有效");
}

const references = JSON.parse(fs.readFileSync(referenceFile, "utf8"));
const referenceSha256 = crypto.createHash("sha256").update(fs.readFileSync(referenceFile)).digest("hex");
const markerKey = `data.repair.internal-company-references.${releaseId}`;
if (!references.employmentCompanyOverrides || typeof references.employmentCompanyOverrides !== "object"
  || Array.isArray(references.employmentCompanyOverrides)
  || !references.employmentCompanyHolds || typeof references.employmentCompanyHolds !== "object"
  || Array.isArray(references.employmentCompanyHolds)) {
  throw new Error("引用文件必须包含 employmentCompanyOverrides 与 employmentCompanyHolds 对象；简称与 Company.party.name 相同时无需配置");
}

const COMPANY_CODE_REFERENCES = Object.freeze([
  ["FinanceAccountBalance", "companyCode", "companyId"],
  ["FinanceAccount", "companyCode", "companyId"],
  ["FinanceAssetAcquisitionEvidence", "companyCode", "companyId"],
  ["FinanceAssetAdjustment", "companyCode", "companyId"],
  ["FinanceAssetCard", "companyCode", "companyId"],
  ["FinanceAssetCategoryPolicy", "companyCode", "companyId"],
  ["FinanceAssetDisposal", "companyCode", "companyId"],
  ["FinanceAssetImpairmentAssessment", "companyCode", "companyId"],
  ["FinanceAssetImportBatch", "companyCode", "companyId"],
  ["FinanceAuxiliaryBalance", "companyCode", "companyId"],
  ["FinanceAuxiliaryMember", "companyCode", "companyId"],
  ["FinanceBalanceReclassAdjustment", "companyCode", "companyId"],
  ["FinanceBalanceReclassAdjustmentHistory", "companyCode", "companyId"],
  ["FinanceBalanceSnapshot", "companyCode", "companyId"],
  ["FinanceCashFlowAllocation", "companyCode", "companyId"],
  ["FinanceCashFlowAllocationAdjustment", "companyCode", "companyId"],
  ["FinanceCashFlowItem", "companyCode", "companyId"],
  ["FinanceCurrency", "companyCode", "companyId"],
  ["FinanceGroupAccount", "originCompanyCode", "originCompanyId"],
  ["FinanceGroupAccountMapping", "companyCode", "companyId"],
  ["FinanceLedgerImport", "companyCode", "companyId"],
  ["FinanceOpenItem", "companyCode", "companyId"],
  ["FinancePeriod", "companyCode", "companyId"],
  ["FinanceReclassItemRule", "companyCode", "companyId"],
  ["FinanceSourceAccountBalance", "companyCode", "companyId"],
  ["FinanceSourceLedgerMapping", "companyCode", "companyId"],
  ["FinanceStatementVoucherExclusion", "companyCode", "companyId"],
  ["FinanceStatementWorkpaper", "companyCode", "companyId"],
  ["FinanceVoucher", "companyCode", "companyId"],
  ["FinanceVoucherCompanyMappingRule", "sourceCompanyCode", "sourceCompanyId"],
  ["InventoryDocument", "companyCode", "companyId"],
  ["InventoryItem", "companyCode", "companyId"],
  ["InventoryImportBatch", "companyCode", "companyId"],
  ["InventoryLedgerEntry", "companyCode", "companyId"],
  ["InventoryPeriodClose", "companyCode", "companyId"],
  ["InventoryStocktake", "companyCode", "companyId"],
  ["InventoryWarehouse", "companyCode", "companyId"],
  ["StockFinishedGoods", "companyCode", "companyId"],
  ["StockPackaging", "companyCode", "companyId"],
  ["StockRawMaterial", "companyCode", "companyId"],
]);

const { PrismaClient } = await import("../../generated/prisma/client.ts");
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: requireDatabaseUrl(), application_name: "workspace-company-reference-backfill" }),
});

async function inspectCodeReference(tx, table, sourceField, destinationField) {
  const [summary] = await tx.$queryRawUnsafe(`
    SELECT
      COUNT(*) FILTER (WHERE t."${sourceField}" IS NOT NULL AND BTRIM(t."${sourceField}") <> '')::int AS "sourceRows",
      COUNT(*) FILTER (WHERE t."${sourceField}" IS NOT NULL AND BTRIM(t."${sourceField}") <> '' AND c.id IS NULL)::int AS "unmatchedRows",
      COUNT(*) FILTER (WHERE t."${destinationField}" IS NOT NULL AND t."${destinationField}" IS DISTINCT FROM c.id)::int AS "conflictingRows",
      COUNT(*) FILTER (WHERE t."${sourceField}" IS NOT NULL AND BTRIM(t."${sourceField}") <> '' AND t."${destinationField}" IS NULL)::int AS "missingFkRows"
    FROM "${table}" t
    LEFT JOIN "Company" c ON c.code = t."${sourceField}"
  `);
  if (summary.unmatchedRows > 0 || summary.conflictingRows > 0) {
    throw new Error(`${table}.${sourceField} 存在无法唯一映射或冲突的公司引用：${JSON.stringify(summary)}`);
  }
  return summary;
}

async function resolveEmploymentAliases(tx, { allowAppliedOverrides = false } = {}) {
  const rows = await tx.$queryRawUnsafe(`
    SELECT DISTINCT "currentCompany" AS value
    FROM "Employment"
    WHERE "currentCompany" IS NOT NULL AND BTRIM("currentCompany") <> ''
    ORDER BY "currentCompany"
  `);
  const databaseAliases = rows.map((row) => row.value);
  const overrideAliases = Object.keys(references.employmentCompanyOverrides).sort();
  const holdAliases = Object.keys(references.employmentCompanyHolds).sort();
  const overlap = overrideAliases.filter((value) => holdAliases.includes(value));
  if (overlap.length) throw new Error(`Employment 公司简称不能同时覆盖和挂起：${overlap.join(",")}`);
  const declaredAliases = [...(allowAppliedOverrides ? [] : overrideAliases), ...holdAliases];
  const stale = declaredAliases.filter((value) => !databaseAliases.includes(value));
  if (stale.length) throw new Error(`Employment 公司简称覆盖存在无对应数据的陈旧项：${stale.join(",")}`);
  const resolved = [];
  const holds = [];
  for (const alias of databaseAliases) {
    const exact = await tx.company.findMany({ where: { party: { name: alias } }, select: { id: true, code: true, party: { select: { name: true } } }, take: 2 });
    if (exact.length === 1) {
      resolved.push({ alias, companyId: exact[0].id, companyCode: exact[0].code, companyName: exact[0].party.name, method: "exact_short_name" });
      continue;
    }
    const override = references.employmentCompanyOverrides[alias];
    const hold = references.employmentCompanyHolds[alias];
    if (!override && hold && typeof hold === "object" && !Array.isArray(hold)
      && Object.keys(hold).join(",") === "reason" && String(hold.reason ?? "").trim()) {
      holds.push({ alias, reason: String(hold.reason).trim() });
      continue;
    }
    if (!override || typeof override !== "object" || Array.isArray(override)
      || Object.keys(override).sort().join(",") !== "companyCode,expectedCompanyName,reason"
      || !String(override.companyCode ?? "").trim() || !String(override.expectedCompanyName ?? "").trim()
      || !String(override.reason ?? "").trim()) {
      throw new Error(`Employment 公司简称“${alias}”未唯一命中 Company.party.name；必须先补公司主档，或在私有引用文件中显式声明 companyCode、expectedCompanyName、reason`);
    }
    const companies = await tx.company.findMany({ where: { code: String(override.companyCode).trim() }, select: { id: true, code: true, party: { select: { name: true } } }, take: 2 });
    if (companies.length !== 1 || companies[0].party.name !== String(override.expectedCompanyName).trim()) {
      throw new Error(`Employment 公司简称“${alias}”的覆盖目标与 Company 当前简称不一致`);
    }
    resolved.push({ alias, companyId: companies[0].id, companyCode: companies[0].code, companyName: companies[0].party.name, method: "reviewed_override" });
  }
  return { resolved, holds };
}

async function buildPlan(tx, options = {}) {
  const codeReferences = [];
  for (const reference of COMPANY_CODE_REFERENCES) {
    codeReferences.push({ reference, summary: await inspectCodeReference(tx, ...reference) });
  }
  const employmentAliases = await resolveEmploymentAliases(tx, options);
  const [masterReferences] = await tx.$queryRawUnsafe(`
    SELECT
      (SELECT COUNT(*)::int FROM "ErpDueDiligenceSubmission") AS "departmentRows",
      (SELECT COUNT(*)::int FROM "ErpDueDiligenceSubmission" s
        WHERE (SELECT COUNT(*) FROM "Department" d WHERE d.name = s."departmentName") <> 1) AS "departmentUnresolved",
      (SELECT COUNT(*)::int FROM "FinanceGroupAccountMapping") AS "localAccountMappingRows",
      (SELECT COUNT(*)::int FROM "FinanceGroupAccountMapping" m
        WHERE (SELECT COUNT(*) FROM "FinanceAccount" a
          WHERE a."companyCode" = m."companyCode" AND a.code = m."localAccountCode" AND a.year = m."latestYear") <> 1) AS "localAccountMappingUnresolved",
      (SELECT COUNT(*)::int FROM "FinanceWorkshopReport" w WHERE w."productName" IS NOT NULL) AS "workshopProductRows",
      (SELECT COUNT(*)::int FROM "FinanceWorkshopReport" w WHERE w."productName" IS NOT NULL
        AND (SELECT COUNT(*) FROM "Product" p WHERE p.name = w."productName") <> 1) AS "workshopProductUnresolved",
      (SELECT COUNT(*)::int FROM "FinanceAssetCard") AS "assetCardRows",
      (SELECT COUNT(*)::int FROM "FinanceAssetCard" card
        WHERE NOT EXISTS (
          SELECT 1 FROM "FinanceAssetCategoryPolicy" policy
          JOIN "FinanceAccount" asset_account ON asset_account.id = policy."assetAccountId"
          LEFT JOIN "FinanceAccount" accumulated_account ON accumulated_account.id = policy."accumulatedAccountId"
          WHERE policy."companyCode" = card."companyCode" AND policy."categoryId" = card."categoryId"
            AND asset_account.code = card."assetAccountCode"
            AND accumulated_account.code IS NOT DISTINCT FROM card."accumulatedAccountCode"
          ORDER BY policy.year DESC LIMIT 1
        )) AS "assetCardUnresolved",
      (SELECT COUNT(*)::int FROM "FinanceBalanceReclassAdjustmentHistory") AS "historySourceRows",
      (SELECT COUNT(*)::int FROM "FinanceBalanceReclassAdjustmentHistory" h
        WHERE (SELECT COUNT(*) FROM "FinanceAccount" a
          WHERE a."companyCode" = h."companyCode" AND a.year = h.year AND a.code = h."sourceAccountCode") <> 1) AS "historySourceUnresolved",
      (SELECT COUNT(*)::int FROM "FinanceBalanceReclassAdjustmentHistory" h
        WHERE h."targetAccountCode" IS NOT NULL AND EXISTS (
          SELECT 1 FROM "FinanceAccount" a WHERE a."companyCode" = h."companyCode" AND a.year = h.year AND a.code = h."targetAccountCode"
        )) AS "historyTargetResolvableRows",
      (SELECT COUNT(*)::int FROM "FinanceBalanceReclassAdjustmentHistory" h
        WHERE h."targetAccountCode" IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM "FinanceAccount" a WHERE a."companyCode" = h."companyCode" AND a.year = h.year AND a.code = h."targetAccountCode"
        )) AS "historyTargetSnapshotOnlyRows"
  `);
  const blocking = [
    "departmentUnresolved",
    "localAccountMappingUnresolved",
    "workshopProductUnresolved",
    "assetCardUnresolved",
    "historySourceUnresolved",
  ].filter((field) => masterReferences[field] !== 0);
  if (blocking.length) throw new Error(`主数据 FK 存在非唯一或无法解析的数据：${blocking.map((field) => `${field}=${masterReferences[field]}`).join(" ")}`);
  return { codeReferences, employmentAliases, masterReferences };
}

async function main() {
  const prior = await prisma.systemConfig.findUnique({ where: { key: markerKey }, select: { value: true } });
  if (prior) {
    const receipt = JSON.parse(prior.value);
    if (receipt.referenceSha256 !== referenceSha256) throw new Error(`数据发布 ${releaseId} 已使用不同引用文件执行`);
    console.log(JSON.stringify({ mode: execute ? "execute" : "dry-run", releaseId, completed: true, replay: true, receipt }, null, 2));
    return;
  }
  const preview = await prisma.$transaction((tx) => buildPlan(tx), { timeout: 120000 });
  console.log(JSON.stringify({
    mode: execute ? "execute" : "dry-run",
    releaseId,
    companyCodeReferences: preview.codeReferences.length,
    sourceRows: preview.codeReferences.reduce((sum, item) => sum + item.summary.sourceRows, 0),
    missingFkRows: preview.codeReferences.reduce((sum, item) => sum + item.summary.missingFkRows, 0),
    employmentAliases: preview.employmentAliases,
    masterReferences: preview.masterReferences,
  }, null, 2));
  if (!execute) return;

  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`workspace-company-reference:${releaseId}`}))`;
    const prior = await tx.systemConfig.findUnique({ where: { key: markerKey }, select: { value: true } });
    if (prior) {
      const receipt = JSON.parse(prior.value);
      if (receipt.referenceSha256 !== referenceSha256) throw new Error(`数据发布 ${releaseId} 已使用不同引用文件执行`);
      return { ...receipt, replay: true };
    }
    const plan = await buildPlan(tx);
    let updatedRows = 0;
    for (const { reference: [table, sourceField, destinationField] } of plan.codeReferences) {
      updatedRows += await tx.$executeRawUnsafe(`
        UPDATE "${table}" t
        SET "${destinationField}" = c.id
        FROM "Company" c
        WHERE c.code = t."${sourceField}"
          AND t."${sourceField}" IS NOT NULL
          AND BTRIM(t."${sourceField}") <> ''
          AND t."${destinationField}" IS DISTINCT FROM c.id
      `);
    }
    for (const alias of plan.employmentAliases.resolved) {
      updatedRows += await tx.$executeRaw`
        UPDATE "Employment"
        SET "companyId" = ${alias.companyId}, "currentCompany" = ${alias.companyName}
        WHERE "currentCompany" = ${alias.alias}
          AND ("companyId" IS DISTINCT FROM ${alias.companyId} OR "currentCompany" IS DISTINCT FROM ${alias.companyName})
      `;
    }
    updatedRows += await tx.$executeRawUnsafe(`
      UPDATE "ErpDueDiligenceSubmission" s
      SET "departmentId" = d.id
      FROM "Department" d
      WHERE d.name = s."departmentName" AND s."departmentId" IS DISTINCT FROM d.id
    `);
    updatedRows += await tx.$executeRawUnsafe(`
      UPDATE "FinanceGroupAccountMapping" m
      SET "localAccountId" = a.id
      FROM "FinanceAccount" a
      WHERE a."companyCode" = m."companyCode" AND a.code = m."localAccountCode" AND a.year = m."latestYear"
        AND m."localAccountId" IS DISTINCT FROM a.id
    `);
    updatedRows += await tx.$executeRawUnsafe(`
      UPDATE "FinanceWorkshopReport" w
      SET "productId" = p.id
      FROM "Product" p
      WHERE p.name = w."productName" AND w."productId" IS DISTINCT FROM p.id
    `);
    updatedRows += await tx.$executeRawUnsafe(`
      WITH resolved AS (
        SELECT DISTINCT ON (card.id) card.id AS "cardId", p."assetAccountId", p."accumulatedAccountId"
        FROM "FinanceAssetCard" card
        JOIN "FinanceAssetCategoryPolicy" p ON p."companyCode" = card."companyCode" AND p."categoryId" = card."categoryId"
        JOIN "FinanceAccount" asset_account ON asset_account.id = p."assetAccountId" AND asset_account.code = card."assetAccountCode"
        LEFT JOIN "FinanceAccount" accumulated_account ON accumulated_account.id = p."accumulatedAccountId"
        WHERE accumulated_account.code IS NOT DISTINCT FROM card."accumulatedAccountCode"
        ORDER BY card.id, p.year DESC
      )
      UPDATE "FinanceAssetCard" card
      SET "assetAccountId" = resolved."assetAccountId", "accumulatedAccountId" = resolved."accumulatedAccountId"
      FROM resolved
      WHERE card.id = resolved."cardId"
        AND (card."assetAccountId" IS DISTINCT FROM resolved."assetAccountId"
          OR card."accumulatedAccountId" IS DISTINCT FROM resolved."accumulatedAccountId")
    `);
    updatedRows += await tx.$executeRawUnsafe(`
      UPDATE "FinanceBalanceReclassAdjustmentHistory" h
      SET "sourceAccountId" = a.id
      FROM "FinanceAccount" a
      WHERE a."companyCode" = h."companyCode" AND a.year = h.year AND a.code = h."sourceAccountCode"
        AND h."sourceAccountId" IS DISTINCT FROM a.id
    `);
    updatedRows += await tx.$executeRawUnsafe(`
      UPDATE "FinanceBalanceReclassAdjustmentHistory" h
      SET "targetAccountId" = a.id
      FROM "FinanceAccount" a
      WHERE a."companyCode" = h."companyCode" AND a.year = h.year AND a.code = h."targetAccountCode"
        AND h."targetAccountId" IS DISTINCT FROM a.id
    `);
    const verified = await buildPlan(tx, { allowAppliedOverrides: true });
    const missing = verified.codeReferences.reduce((sum, item) => sum + item.summary.missingFkRows, 0);
    const [employment] = await tx.$queryRawUnsafe(`
      SELECT COUNT(*) FILTER (WHERE "currentCompany" IS NOT NULL AND BTRIM("currentCompany") <> '' AND "companyId" IS NULL)::int AS missing
      FROM "Employment"
    `);
    const [masterMissing] = await tx.$queryRawUnsafe(`
      SELECT
        (SELECT COUNT(*)::int FROM "ErpDueDiligenceSubmission" WHERE "departmentId" IS NULL) AS department,
        (SELECT COUNT(*)::int FROM "FinanceGroupAccountMapping" WHERE "localAccountId" IS NULL) AS "localAccountMapping",
        (SELECT COUNT(*)::int FROM "FinanceWorkshopReport" WHERE "productName" IS NOT NULL AND "productId" IS NULL) AS "workshopProduct",
        (SELECT COUNT(*)::int FROM "FinanceAssetCard" WHERE "assetAccountId" IS NULL) AS "assetCard",
        (SELECT COUNT(*)::int FROM "FinanceBalanceReclassAdjustmentHistory" WHERE "sourceAccountId" IS NULL) AS "historySource",
        (SELECT COUNT(*)::int FROM "FinanceBalanceReclassAdjustmentHistory" h WHERE h."targetAccountId" IS NULL AND EXISTS (
          SELECT 1 FROM "FinanceAccount" a WHERE a."companyCode" = h."companyCode" AND a.year = h.year AND a.code = h."targetAccountCode"
        )) AS "historyResolvableTarget"
    `);
    const missingMaster = Object.values(masterMissing).reduce((sum, value) => sum + Number(value), 0);
    const heldEmploymentRows = plan.employmentAliases.holds.length === 0 ? 0 : Number((await tx.$queryRawUnsafe(`
      SELECT COUNT(*)::int AS rows FROM "Employment" WHERE "companyId" IS NULL AND "currentCompany" = ANY($1::text[])
    `, plan.employmentAliases.holds.map((item) => item.alias)))[0].rows);
    if (missing !== 0 || employment.missing !== heldEmploymentRows || missingMaster !== 0) {
      throw new Error(`FK 回填后仍有空值：companyCode=${missing} employment=${employment.missing} master=${JSON.stringify(masterMissing)}`);
    }
    const receipt = {
      completed: true,
      releaseId,
      referenceSha256,
      updatedRows,
      missingCompanyCodeFks: missing,
      heldEmploymentRows,
      employmentHolds: plan.employmentAliases.holds,
      missingMasterReferences: masterMissing,
    };
    await tx.systemConfig.create({ data: { key: markerKey, value: JSON.stringify(receipt) } });
    return { ...receipt, replay: false };
  }, { timeout: 120000 });
  console.log(JSON.stringify({ completed: true, ...result }, null, 2));
}

main().finally(() => prisma.$disconnect());
