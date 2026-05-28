#!/usr/bin/env node
/**
 * 导入 finance cost normalized JSON 到数据库
 * Usage:
 *   node scripts/import-finance-cost-json.mjs --dry-run
 *   node scripts/import-finance-cost-json.mjs
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NORMALIZED_DIR = "/Users/koito/Desktop/.财务数据库/成本分析飞书实验版/json/normalized";
const DRY_RUN = process.argv.includes("--dry-run");

// Load Prisma Client dynamically (ESM compatible)
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

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

// ─── Profile parsers ──────────────────────────────────────

function parseShipments(json, sourceFile, sourcePath) {
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

    facts.push({
      year: safeInt(row.year) ?? 0,
      month: safeInt(row.month),
      date: dateStr,
      customerName: safeString(row.customer) ?? safeString(row.customerName),
      salesperson: safeString(row.salesperson),
      productName: safeString(row.productName),
      spec: safeString(row.spec),
      batchNo: safeString(row.batchNo),
      quantity: safeFloat(row.shipmentQty),
      unitPrice: safeFloat(row.unitPrice),
      amount: safeFloat(row.shipmentTaxAmountBase) ?? safeFloat(row.invoiceAmount),
      receivedAmount: safeFloat(row.receivedAmount),
      sourceFile: safeString(sourceFile) ?? "",
      sourceSheet: safeString(row.source?.sheet),
      sourceRow: safeInt(row.source?.row),
    });
  }

  return { facts, warnings };
}

function parseSalesSalary(json, sourceFile, sourcePath) {
  const rows = Array.isArray(json) ? json : [];
  const facts = [];
  let warnings = 0;

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    if (row.recordType === "total" || isTotalRow(row)) continue;

    facts.push({
      year: safeInt(row.year) ?? 0,
      month: safeInt(row.month),
      salesperson: safeString(row.name) ?? "",
      baseSalary: safeFloat(row.salaryStandard),
      bonus: safeFloat(row.salary),
      deduction: null,
      actualSalary: safeFloat(row.salary),
      sourceFile: safeString(sourceFile) ?? "",
      sourceSheet: safeString(row.source?.sheet),
      sourceRow: safeInt(row.source?.row),
    });
  }

  return { facts, warnings };
}

function parseCostStructure(json, sourceFile, sourcePath) {
  const rows = json.standardRows ?? [];
  const facts = [];
  let warnings = 0;

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;

    const cost = row.cost ?? {};
    const year = safeInt(row.year) ?? 0;
    const month = safeInt(row.month);
    const productName = safeString(row.productName);
    const inboundQty = safeFloat(row.inboundQuantity);
    const sourceSheet = safeString(row.source?.sheet);
    const sourceRow = safeInt(row.source?.row);

    // Import each cost component as a separate fact row
    const components = [
      { category: "原材料", itemName: "原材料", amount: safeFloat(cost.rawMaterials) },
      { category: "包材", itemName: "包材", amount: safeFloat(cost.packagingMaterials) },
      { category: "人工", itemName: "直接人工工资", amount: safeFloat(cost.wage) },
      { category: "人工", itemName: "直接人工社保", amount: safeFloat(cost.directLaborSocialSecurity) },
      { category: "人工", itemName: "直接人工福利", amount: safeFloat(cost.directLaborWelfare) },
      { category: "辅助人工", itemName: "辅助人工工资", amount: safeFloat(cost.auxiliaryLaborWage) },
      { category: "辅助人工", itemName: "辅助人工社保", amount: safeFloat(cost.auxiliaryLaborSocialSecurity) },
      { category: "辅助人工", itemName: "辅助人工福利", amount: safeFloat(cost.auxiliaryLaborWelfare) },
      { category: "制造费用", itemName: "水电费", amount: safeFloat(cost.utilities) },
      { category: "制造费用", itemName: "折旧-直接", amount: safeFloat(cost.depreciationDirect) },
      { category: "制造费用", itemName: "折旧-辅助", amount: safeFloat(cost.depreciationAuxiliary) },
      { category: "制造费用", itemName: "其他制造费用", amount: safeFloat(cost.otherManufacturingCost) },
      { category: "制造费用", itemName: "制造费用小计", amount: safeFloat(cost.manufacturingSubtotal) },
    ];

    for (const comp of components) {
      if (comp.amount === null || comp.amount === 0) continue;
      facts.push({
        year,
        month,
        productName,
        category: comp.category,
        itemName: comp.itemName,
        amount: comp.amount,
        quantity: inboundQty,
        unit: "件",
        sourceFile: safeString(sourceFile) ?? safeString(json.sourceFile) ?? "",
        sourceSheet,
        sourceRow,
      });
    }
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

function parseWorkshopReports(json, sourceFile, sourcePath) {
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

            facts.push({
              year,
              month,
              productName,
              batchNo,
              personName: safeString(person.name),
              workType: safeString(person.position),
              workPoint: safeFloat(person.total),
              quantity: quantityNum,
              sourceFile: safeString(sourceFile) ?? safeString(report.source?.file) ?? "",
              sourceSheet: safeString(person.source?.sheet) ?? safeString(batch.source?.sheet),
              sourceRow: safeInt(person.source?.row) ?? safeInt(batch.source?.row),
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

// ─── Main ─────────────────────────────────────────────────

async function main() {
  log("Start import", DRY_RUN ? "(DRY RUN)" : "");

  if (!fs.existsSync(NORMALIZED_DIR)) {
    error("Normalized dir not found:", NORMALIZED_DIR);
    process.exit(1);
  }

  const profiles = fs.readdirSync(NORMALIZED_DIR).filter((d) => {
    const full = path.join(NORMALIZED_DIR, d);
    return fs.statSync(full).isDirectory();
  });

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
      const sourceFile = json.sourceFile ?? file;
      const year = safeInt(json.year) ?? safeInt(file.replace(/\.json$/, ""));

      const parser = PARSERS[profile];
      if (!parser) {
        warn("No parser for profile:", profile);
        continue;
      }

      const { facts, warnings } = parser(json, sourceFile, filePath);
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

      // Remove existing import for same profile/year/sourceFile
      const existing = await prisma.financeDataImport.findFirst({
        where: { profile, year: year ?? null, sourceFile },
      });

      if (existing) {
        log("  -> removing existing import id", existing.id);
        await prisma.financeDataImport.delete({ where: { id: existing.id } });
      }

      const importRecord = await prisma.financeDataImport.create({
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

      log("  -> created import id", importRecord.id);

      // Batch insert by profile
      const importId = importRecord.id;
      if (profile === "shipments") {
        await prisma.financeShipment.createMany({ data: facts.map((f) => ({ ...f, importId })) });
      } else if (profile === "sales-salary") {
        await prisma.financeSalesSalary.createMany({ data: facts.map((f) => ({ ...f, importId })) });
      } else if (profile === "cost-structure") {
        await prisma.financeCostStructureRow.createMany({ data: facts.map((f) => ({ ...f, importId })) });
      } else if (profile === "cost-analysis") {
        await prisma.financeCostAnalysisRow.createMany({ data: facts.map((f) => ({ ...f, importId })) });
      } else if (profile === "workshop-reports") {
        await prisma.financeWorkshopReport.createMany({ data: facts.map((f) => ({ ...f, importId })) });
      }

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
