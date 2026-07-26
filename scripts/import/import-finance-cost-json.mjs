#!/usr/bin/env node
/**
 * 导入 finance cost normalized JSON 到数据库
 * Usage:
 *   node --import tsx scripts/import/import-finance-cost-json.mjs --dry-run
 *   node --import tsx scripts/import/import-finance-cost-json.mjs --profile=shipments
 *   node --import tsx scripts/import/import-finance-cost-json.mjs --profile=shipments --replace-profile
 *   node --import tsx scripts/import/import-finance-cost-json.mjs
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { requireDatabaseUrl } from "../lib/database-url.js";
import { parseCostStructure } from "./finance-cost-structure-parser.mjs";
import { reconcileShipmentReceivedAmount } from "./finance-shipment-reconciliation.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NORMALIZED_DIR = process.env.FINANCE_COST_DATA_DIR || path.join(process.cwd(), "prisma/seed-data/finance-cost/normalized");
const DRY_RUN = process.argv.includes("--dry-run");
const PROFILE_FILTER = process.argv
  .find((argument) => argument.startsWith("--profile="))
  ?.slice("--profile=".length);
const REPLACE_PROFILE = process.argv.includes("--replace-profile");

const { PrismaClient } = await import("../../generated/prisma/client.ts");
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: requireDatabaseUrl(),
    application_name: "workspace-finance-cost-import",
  }),
});

function log(...args) {
  console.log("[import]", ...args);
}

function warn(...args) {
  console.warn("[warn]", ...args);
}

function error(...args) {
  console.error("[error]", ...args);
}

async function getChecksum(filePath) {
  const buf = await fs.promises.readFile(filePath);
  return crypto.createHash("md5").update(buf).digest("hex");
}

function readJson(filePath) {
  const text = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(text);
}

function resolveSourceFile(json, fallback) {
  if (!Array.isArray(json)) return safeString(json?.sourceFile) ?? fallback;
  for (const row of json) {
    const sourceFile = safeString(row?.source?.file);
    if (sourceFile) return sourceFile;
  }
  return fallback;
}

function safeFloat(v) {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function safeInt(v) {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseInt(String(v).replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

function safeString(v) {
  if (v === null || v === undefined) return null;
  return String(v).trim() || null;
}

function isTotalRow(obj) {
  if (!obj) return false;
  const name = obj.name ?? obj.customer ?? obj.customerName ?? "";
  return name.includes("合计") || name.includes("总计") || name.includes("小计");
}

// ─── Name / Position mapping ──────────────────────────────

function normalizeName(name) {
  if (!name) return "";
  return String(name).trim().replace(/\s+/g, "");
}

const FACTORY_DIRECT_NAMES = new Set(["厂部", "厂销", "厂家直销"]);

function resolveSalesAttribution(sourceValue, employeeMap) {
  const salespersonName = safeString(sourceValue);
  const normalizedName = normalizeName(salespersonName);
  if (!normalizedName) {
    return { salesChannel: "unknown", salespersonName: null, employeeId: null };
  }
  if (FACTORY_DIRECT_NAMES.has(normalizedName)) {
    return { salesChannel: "factory_direct", salespersonName, employeeId: null };
  }
  return {
    salesChannel: "employee",
    salespersonName,
    employeeId: employeeMap.get(normalizedName) ?? null,
  };
}

function normalizePosition(pos) {
  if (!pos) return "";
  const cleaned = String(pos).trim().replace(/\s+/g, "");
  if (!cleaned) return "";
  // Add "岗" suffix if not present (e.g. "制粒" → "制粒岗")
  return cleaned.endsWith("岗") ? cleaned : cleaned + "岗";
}

async function buildEmployeeMap() {
  const employees = await prisma.employee.findMany({ select: { id: true, name: true } });
  const map = new Map();
  for (const e of employees) {
    const key = normalizeName(e.name);
    if (!key) continue;
    map.set(key, map.has(key) ? null : e.id);
  }
  return map;
}

async function buildPositionMap() {
  const positions = await prisma.position.findMany({ select: { id: true, name: true } });
  const map = new Map();
  for (const p of positions) {
    const key = normalizeName(p.name);
    if (key) map.set(key, p.id);
  }
  return map;
}

// ─── Profile parsers ──────────────────────────────────────

function parseShipments(json, sourceFile, sourcePath, employeeMap) {
  const rows = Array.isArray(json) ? json : json.standardRows ?? json.records ?? [];
  const facts = [];
  let warnings = 0;

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    if (isTotalRow(row)) continue;
    if (row.date === "合 计" || row.date === "合计") continue;

    const dateRaw = row.date;
    const dateStr = dateRaw && typeof dateRaw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw)
      ? dateRaw
      : null;

    const salesAttribution = resolveSalesAttribution(row.salesperson, employeeMap);
    if (salesAttribution.salesChannel === "employee" && salesAttribution.employeeId === null) warnings += 1;

    const amount = safeFloat(row.shipmentTaxAmountBase);
    const received = reconcileShipmentReceivedAmount({
      amount,
      receivedAmount: safeFloat(row.receivedAmount),
      uncollectedAmount: safeFloat(row.uncollectedAmount),
    });
    if (received.reconciled) warnings += 1;

    facts.push({
      year: safeInt(row.year) ?? 0,
      month: safeInt(row.month),
      date: dateStr,
      customerName: safeString(row.customer) ?? safeString(row.customerName),
      productName: safeString(row.productName),
      spec: safeString(row.spec),
      batchNo: safeString(row.batchNo),
      quantity: safeFloat(row.shipmentQty),
      unitPrice: safeFloat(row.unitPrice),
      amount,
      receivedAmount: received.value,
      ...salesAttribution,
      sourceFile: safeString(sourceFile) ?? "",
      sourceSheet: safeString(row.source?.sheet),
      sourceRow: safeInt(row.source?.row),
    });
  }

  return { facts, warnings };
}

function parseSalesSalary(json, sourceFile, sourcePath, employeeMap) {
  const rows = Array.isArray(json) ? json : [];
  const facts = [];
  let warnings = 0;

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    if (row.recordType === "total" || isTotalRow(row)) continue;

    const salesAttribution = resolveSalesAttribution(row.name, employeeMap);
    if (salesAttribution.salesChannel === "employee" && salesAttribution.employeeId === null) warnings += 1;

    facts.push({
      year: safeInt(row.year) ?? 0,
      month: safeInt(row.month),
      baseSalary: safeFloat(row.salaryStandard),
      bonus: safeFloat(row.salary),
      deduction: null,
      actualSalary: safeFloat(row.salary),
      ...salesAttribution,
      sourceFile: safeString(sourceFile) ?? "",
      sourceSheet: safeString(row.source?.sheet),
      sourceRow: safeInt(row.source?.row),
    });
  }

  return { facts, warnings };
}

function parseCostAnalysis(json, sourceFile, sourcePath) {
  const tables = json.tables ?? [];
  const facts = [];
  let warnings = 0;

  for (const table of tables) {
    const tableName = safeString(table.sheetName);
    const records = table.records ?? [];

    for (const rec of records) {
      if (!rec || typeof rec !== "object") continue;

      const values = rec.values ?? {};
      const rowLabel = safeString(values.col_1 ?? values.规格 ?? values.产品 ?? values.项目 ?? values.名称 ?? "");

      for (const [key, val] of Object.entries(values)) {
        if (val === null || val === undefined) continue;
        if (key === "col_1" && rowLabel) continue; // already captured as rowLabel
        if (key === "合计" || key.includes("合计") || key.includes("总计")) continue;

        const numVal = safeFloat(val);
        facts.push({
          year: safeInt(json.year) ?? 0,
          month: null,
          tableName,
          rowLabel,
          metricKey: safeString(key),
          metricName: safeString(key),
          value: numVal,
          textValue: numVal === null ? safeString(val) : null,
          sourceFile: safeString(sourceFile) ?? safeString(json.sourceFile) ?? "",
          sourceSheet: safeString(rec.source?.sheet),
          sourceRow: safeInt(rec.source?.row),
        });
      }
    }
  }

  return { facts, warnings };
}

function parseWorkshopReports(json, sourceFile, sourcePath, employeeMap, positionMap) {
  const reports = Array.isArray(json) ? json : [];
  const facts = [];
  let warnings = 0;

  for (const report of reports) {
    if (!report || typeof report !== "object") continue;
    const year = safeInt(report.year) ?? 0;
    const month = safeInt(report.month) ?? 0;
    const products = report.products ?? [];

    for (const prod of products) {
      const productName = safeString(prod.product);
      const batches = prod.batches ?? [];

      for (const batch of batches) {
        const batchNo = safeString(batch.batchNo);
        const workDetails = batch.workDetails ?? [];

        for (const detail of workDetails) {
          const people = detail.people ?? [];

          for (const person of people) {
            const quantityStr = safeString(batch.quantity) ?? "";
            const quantityNum = safeFloat(quantityStr.replace(/[^0-9.]/g, ""));

            const personName = normalizeName(person.name);
            const workType = normalizePosition(person.position);
            const employeeId = personName ? (employeeMap.get(personName) ?? null) : null;
            const positionId = workType ? (positionMap.get(workType) ?? null) : null;

            facts.push({
              year,
              month,
              productName,
              batchNo,
              workPoint: safeFloat(person.total),
              quantity: quantityNum,
              employeeId,
              positionId,
              sourceFile: safeString(sourceFile) ?? safeString(report.source?.file) ?? "",
              sourceSheet: safeString(person.source?.sheet)
                ?? safeString(detail.source?.sheet)
                ?? safeString(batch.source?.sheet),
              sourceRow: safeInt(person.source?.row)
                ?? safeInt(detail.source?.row)
                ?? safeInt(batch.source?.row),
            });
          }
        }
      }
    }
  }

  return { facts, warnings };
}

const PARSERS = {
  shipments: parseShipments,
  "sales-salary": parseSalesSalary,
  "cost-structure": parseCostStructure,
  "cost-analysis": parseCostAnalysis,
  "workshop-reports": parseWorkshopReports,
};

function normalizedProductReference(value) {
  return String(value ?? "").trim().replace(/\s+/g, "").toLocaleLowerCase("zh-CN");
}

function compositeProductReference(name, specification) {
  return `${normalizedProductReference(name)}\u0000${normalizedProductReference(specification)}`;
}

async function enrichShipmentFacts(facts) {
  const [products, customers] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { itemType: "finished_goods", status: "active" },
      select: { id: true, name: true, specification: true },
    }),
    prisma.externalPartyRole.findMany({
      where: { category: "customer", isActive: true },
      select: {
        id: true,
        party: { select: { name: true, fullName: true } },
        sourceMappings: { select: { sourceName: true } },
      },
    }),
  ]);
  const productsByReference = new Map();
  for (const product of products) {
    const key = compositeProductReference(product.name, product.specification);
    productsByReference.set(key, [...(productsByReference.get(key) ?? []), product]);
  }
  const customersByName = new Map();
  for (const customer of customers) {
    const names = new Set([customer.party.name, customer.party.fullName, ...customer.sourceMappings.map((mapping) => mapping.sourceName)]
      .map(normalizedProductReference)
      .filter(Boolean));
    for (const name of names) {
      customersByName.set(name, [...(customersByName.get(name) ?? []), customer]);
    }
  }

  let warnings = 0;
  const enriched = facts.map((fact) => {
    const productMatches = productsByReference.get(compositeProductReference(fact.productName, fact.spec)) ?? [];
    const customerMatches = customersByName.get(normalizedProductReference(fact.customerName)) ?? [];
    const productId = productMatches.length === 1 ? productMatches[0].id : null;
    const customerId = customerMatches.length === 1 ? customerMatches[0].id : null;
    if ((fact.productName && productId === null) || (fact.customerName && customerId === null)) warnings += 1;
    return { ...fact, productId, customerId };
  });
  return { facts: enriched, warnings };
}

async function enrichCostStructureFacts(facts) {
  const [products, reports] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { itemType: "finished_goods", status: "active" },
      select: { id: true, name: true, productMasterId: true },
    }),
    prisma.inventoryReceiptReport.findMany({
      select: {
        id: true,
        year: true,
        month: true,
        batches: { select: { productId: true } },
        productWorkPoints: { select: { productId: true } },
      },
    }),
  ]);
  const productsByName = new Map();
  for (const product of products) {
    const key = normalizedProductReference(product.name);
    productsByName.set(key, [...(productsByName.get(key) ?? []), product]);
  }
  const reportsByPeriodProduct = new Map();
  for (const report of reports) {
    const productIds = new Set([
      ...report.batches.map((batch) => batch.productId),
      ...report.productWorkPoints.map((item) => item.productId),
    ].filter((value) => value !== null));
    for (const productId of productIds) {
      const key = `${report.year}\u0000${report.month}\u0000${productId}`;
      reportsByPeriodProduct.set(key, [...(reportsByPeriodProduct.get(key) ?? []), report]);
    }
  }
  let warnings = 0;
  const enriched = facts.map((fact) => {
    const productMatches = productsByName.get(normalizedProductReference(fact.productName)) ?? [];
    const productId = productMatches.length === 1 ? productMatches[0].id : null;
    const receiptProductId = productMatches.length === 1 ? productMatches[0].productMasterId : null;
    const reportMatches = receiptProductId === null || fact.month === null
      ? []
      : reportsByPeriodProduct.get(`${fact.year}\u0000${fact.month}\u0000${receiptProductId}`) ?? [];
    const receiptReportId = reportMatches.length === 1 ? reportMatches[0].id : null;
    if (productId === null || receiptReportId === null) warnings += 1;
    return { ...fact, productId, receiptReportId };
  });
  return { facts: enriched, warnings };
}

async function enrichProfileFacts(profile, facts) {
  if (profile === "shipments") return enrichShipmentFacts(facts);
  if (profile === "cost-structure") return enrichCostStructureFacts(facts);
  return { facts, warnings: 0 };
}

async function prepareProfileReplacement(profile, employeeMap, positionMap) {
  const profileDir = path.join(NORMALIZED_DIR, profile);
  const files = fs.readdirSync(profileDir).filter((file) => file.endsWith(".json")).sort();
  const jobs = [];

  if (files.length === 0) {
    throw new Error(`Replacement profile has no JSON files: ${profile}`);
  }

  for (const file of files) {
    const filePath = path.join(profileDir, file);
    const json = readJson(filePath);
    const checksum = await getChecksum(filePath);
    const sourceFile = resolveSourceFile(json, file);
    const year = safeInt(json.year) ?? safeInt(file.replace(/\.json$/, ""));
    const parser = PARSERS[profile];
    if (!parser) throw new Error(`No parser for profile: ${profile}`);
    const parsed = parser(json, sourceFile, filePath, employeeMap, positionMap);
    const enriched = await enrichProfileFacts(profile, parsed.facts);
    const facts = enriched.facts;
    const warnings = parsed.warnings + enriched.warnings;
    if (facts.length === 0) throw new Error(`No facts extracted for ${profile}/${file}`);
    jobs.push({ profile, file, filePath, checksum, sourceFile, year, facts, warnings });
  }

  const years = jobs.map((job) => job.year).filter((year) => year !== null);
  if (new Set(years).size !== years.length) {
    throw new Error(`Replacement profile contains duplicate years: ${profile}`);
  }
  return jobs;
}

async function replaceProfileAtomically(profile, employeeMap, positionMap) {
  const jobs = await prepareProfileReplacement(profile, employeeMap, positionMap);
  const existing = await prisma.financeDataImport.findMany({
    where: { profile },
    select: { id: true, year: true, sourceFile: true, recordCount: true },
    orderBy: { id: "asc" },
  });
  for (const job of jobs) {
    log(`Processing ${profile}/${job.file}`);
    log(`  -> ${job.facts.length} fact rows, ${job.warnings} warnings`);
  }
  log("  -> replacement would remove import ids", existing.map((item) => item.id).join(", ") || "none");

  if (DRY_RUN) {
    return {
      totalImports: jobs.length,
      totalRecords: jobs.reduce((sum, job) => sum + job.facts.length, 0),
      totalWarnings: jobs.reduce((sum, job) => sum + job.warnings, 0),
      removedImports: existing,
      createdImports: [],
    };
  }

  const createdImports = await prisma.$transaction(
    async (tx) => {
      await tx.financeDataImport.deleteMany({ where: { profile } });
      const created = [];
      for (const job of jobs) {
        const importRecord = await tx.financeDataImport.create({
          data: {
            profile,
            year: job.year ?? null,
            sourceFile: job.sourceFile,
            sourcePath: job.filePath,
            normalizedJsonPath: job.filePath,
            checksum: job.checksum,
            status: "imported",
            recordCount: job.facts.length,
            warningCount: job.warnings,
            errorCount: 0,
            importedBy: "import-script",
          },
        });
        const importId = importRecord.id;
        if (profile === "shipments") {
          await tx.financeShipment.createMany({ data: job.facts.map((fact) => ({ ...fact, importId })) });
        } else if (profile === "sales-salary") {
          await tx.financeSalesSalary.createMany({ data: job.facts.map((fact) => ({ ...fact, importId })) });
        } else if (profile === "cost-structure") {
          await tx.financeCostStructureRow.createMany({ data: job.facts.map((fact) => ({ ...fact, importId })) });
        } else if (profile === "cost-analysis") {
          await tx.financeCostAnalysisRow.createMany({ data: job.facts.map((fact) => ({ ...fact, importId })) });
        } else if (profile === "workshop-reports") {
          await tx.financeWorkshopReport.createMany({ data: job.facts.map((fact) => ({ ...fact, importId })) });
        }
        created.push({ id: importRecord.id, year: importRecord.year, sourceFile: importRecord.sourceFile, recordCount: importRecord.recordCount });
      }
      return created;
    },
    { timeout: 30_000 },
  );

  return {
    totalImports: jobs.length,
    totalRecords: jobs.reduce((sum, job) => sum + job.facts.length, 0),
    totalWarnings: jobs.reduce((sum, job) => sum + job.warnings, 0),
    removedImports: existing,
    createdImports,
  };
}

// ─── Main ─────────────────────────────────────────────────

async function main() {
  log("Start import", DRY_RUN ? "(DRY RUN)" : "");

  if (!fs.existsSync(NORMALIZED_DIR)) {
    error("Normalized dir not found:", NORMALIZED_DIR);
    process.exit(1);
  }

  log("Building name/position maps...");
  const employeeMap = await buildEmployeeMap();
  const positionMap = await buildPositionMap();
  log(`  -> ${employeeMap.size} employees, ${positionMap.size} positions mapped`);

  const profiles = fs.readdirSync(NORMALIZED_DIR).filter((d) => {
    const full = path.join(NORMALIZED_DIR, d);
    return fs.statSync(full).isDirectory() && (!PROFILE_FILTER || d === PROFILE_FILTER);
  });

  if (PROFILE_FILTER && profiles.length === 0) {
    throw new Error(`Profile not found in normalized data: ${PROFILE_FILTER}`);
  }
  if (REPLACE_PROFILE && !PROFILE_FILTER) {
    throw new Error("--replace-profile requires --profile=<profile>");
  }
  if (REPLACE_PROFILE) {
    const result = await replaceProfileAtomically(PROFILE_FILTER, employeeMap, positionMap);
    log("Done.", result);
    await prisma.$disconnect();
    return;
  }

  let totalImports = 0;
  let totalRecords = 0;
  let totalWarnings = 0;

  for (const profile of profiles) {
    const profileDir = path.join(NORMALIZED_DIR, profile);
    const files = fs.readdirSync(profileDir).filter((f) => f.endsWith(".json"));

    for (const file of files) {
      const filePath = path.join(profileDir, file);
      log(`Processing ${profile}/${file}`);

      const json = readJson(filePath);
      const checksum = await getChecksum(filePath);
      const sourceFile = resolveSourceFile(json, file);
      const year = safeInt(json.year) ?? safeInt(file.replace(/\.json$/, ""));

      const parser = PARSERS[profile];
      if (!parser) {
        warn("No parser for profile:", profile);
        continue;
      }

      const parsed = parser(json, sourceFile, filePath, employeeMap, positionMap);
      const enriched = await enrichProfileFacts(profile, parsed.facts);
      const facts = enriched.facts;
      const warnings = parsed.warnings + enriched.warnings;
      totalWarnings += warnings;

      log(`  -> ${facts.length} fact rows, ${warnings} warnings`);

      if (facts.length === 0) {
        warn("  -> no facts extracted, skipping");
        continue;
      }

      if (DRY_RUN) {
        log("  -> [dry-run] would create import with", facts.length, "records");
        totalImports++;
        totalRecords += facts.length;
        continue;
      }

      const importRecord = await prisma.$transaction(async (tx) => {
        // Replacing a prior source batch and all of its facts is atomic.
        const replaceableSourceFiles = [...new Set([sourceFile, file])];
        const existing = await tx.financeDataImport.findMany({
          where: {
            profile,
            year: year ?? null,
            sourceFile: { in: replaceableSourceFiles },
          },
          select: { id: true },
        });

        if (existing.length > 0) {
          const existingIds = existing.map((item) => item.id);
          log("  -> removing existing import ids", existingIds.join(", "));
          await tx.financeDataImport.deleteMany({ where: { id: { in: existingIds } } });
        }

        const created = await tx.financeDataImport.create({
          data: {
            profile,
            year: year ?? null,
            sourceFile,
            sourcePath: filePath,
            normalizedJsonPath: filePath,
            checksum,
            status: "imported",
            recordCount: facts.length,
            warningCount: warnings,
            errorCount: 0,
            importedBy: "import-script",
          },
        });

        const importId = created.id;
        if (profile === "shipments") {
          await tx.financeShipment.createMany({ data: facts.map((f) => ({ ...f, importId })) });
        } else if (profile === "sales-salary") {
          await tx.financeSalesSalary.createMany({ data: facts.map((f) => ({ ...f, importId })) });
        } else if (profile === "cost-structure") {
          await tx.financeCostStructureRow.createMany({ data: facts.map((f) => ({ ...f, importId })) });
        } else if (profile === "cost-analysis") {
          await tx.financeCostAnalysisRow.createMany({ data: facts.map((f) => ({ ...f, importId })) });
        } else if (profile === "workshop-reports") {
          await tx.financeWorkshopReport.createMany({ data: facts.map((f) => ({ ...f, importId })) });
        }
        return created;
      });

      log("  -> created import id", importRecord.id);

      totalImports++;
      totalRecords += facts.length;
    }
  }

  log("Done.", {
    totalImports,
    totalRecords,
    totalWarnings,
  });

  await prisma.$disconnect();
}

main().catch((e) => {
  error(e);
  prisma.$disconnect().finally(() => process.exit(1));
});
