/**
 * P3 Batch 11: Import cash flow workpapers from .xls/.xlsx source files.
 *
 * Reads colleague-provided cash flow files from prisma/seed-data/现金流/,
 * maps project names to cash flow lineCodes, and upserts workpaper lines
 * with importedAmount = source amount.
 *
 * Usage:
 *   npx tsx scripts/import-cash-flow-workpapers.ts          # dry-run
 *   npx tsx scripts/import-cash-flow-workpapers.ts --execute  # write to DB
 */

import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client";
import { CASH_FLOW_LINES } from "@workspace/finance/server/statements/config/cash-flow-lines";
import { requireDatabasePath } from "./lib/database-url.js";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: requireDatabasePath() }),
});

const IS_EXEC = process.argv.includes("--execute");
const SRC_DIR = path.resolve("prisma/seed-data/现金流");

// ─── Company mapping ─────────────────────────────────────────
// 丰华悦通 → 06 为暂定映射，如不正确请修改后重新导入

const COMPANY_MAP: Record<string, string> = {
  "丰华生物": "01",
  "天力通": "02",
  "悦通大药房": "03",
  "丰华悦通": "06", // 暂定：上海悦通
  "加拿大": "05",
};

// ─── Line mapping: trimmed project name → lineCode ───────────

const LINE_MAP: Record<string, string> = {
  // Operating inflows
  "销售商品、提供劳务收到的现金": "salesReceipt",
  "收到的税费返还": "taxRefund",
  "收到的其他与经营活动的现金": "otherOpIn",
  "收到其他与经营活动有关的现金": "otherOpIn",
  // Operating outflows
  "购买商品、接受劳务支付的现金": "purchasePayment",
  "支付给职工以及为职工支付的现金": "staffPayment",
  "支付的职工薪酬": "staffPayment",
  "支付的各项税费": "taxPayment",
  "支付的与其他经营活动有关的现金": "otherOpOut",
  "支付其他与经营活动有关的现金": "otherOpOut",
  "支付其它与经营活动有关的现金": "otherOpOut",
  // Investing
  "购建固定资产、无形资产和其他长期资产所支付的现金": "fixedAssetPurchase",
  "购建固定资产、无形资产支付的现金": "fixedAssetPurchase",
  "投资所支付的现金": "investPayment",
  "投资支付的现金": "investPayment",
  "支付的其他与投资活动有关的现金": "otherInvOut",
  // Financing
  "借款所收到的现金": "loanReceipt",
  "取得借款收到的现金": "loanReceipt",
  "偿还债务支付的现金": "loanRepayment",
};

const IGNORED_ITEMS = new Set([
  "不影响现金流量的项目",
]);

// Build lineCode → sortOrder index from cash flow config
const LINE_ORDER = new Map<string, number>();
CASH_FLOW_LINES.forEach((l, i) => LINE_ORDER.set(l.lineCode, i));

// ─── Section tracking (old format) ───────────────────────────

type Section = "operating" | "investing" | "financing";

const SUBTOTAL_MAP: Record<string, Record<string, Record<string, string>>> = {
  operating: {
    inflow: { "现金流入 小计": "operatingInSubtotal" },
    outflow: { "现金流出 小计": "operatingOutSubtotal" },
  },
  investing: {
    inflow: { "现金流入 小计": "investingInSubtotal" },
    outflow: { "现金流出 小计": "investingOutSubtotal" },
  },
  financing: {
    inflow: { "现金流入 小计": "financingInSubtotal" },
    outflow: { "现金流出 小计": "financingOutSubtotal" },
  },
};

const SECTION_NET_MARKERS = ["经营活动 小计", "投资活动 小计", "筹资活动 小计"] as const;
const SECTION_NET_CODES: Record<string, string> = {
  "经营活动 小计": "operatingNet",
  "投资活动 小计": "investingNet",
  "筹资活动 小计": "financingNet",
};

interface ParsedRow {
  project: string;
  direction: string;
  amount: number;
  section?: string; // new format: explicit section name from col A
}

interface FileSummary {
  file: string;
  companyCode: string;
  year: number;
  month: number;
  mapped: { lineCode: string; project: string; direction: string; amount: number }[];
  unmapped: { project: string; direction: string; amount: number }[];
  ignored: { project: string; direction: string; amount: number }[];
  written: number;
}

// ─── Filename parsing ────────────────────────────────────────

function parseFilename(fn: string): { companyCode: string; year: number; month: number } | null {
  const base = fn.replace(/\.(xlsx?)$/i, "");
  const match = base.match(/^现金流-(.+?)(\d{4})(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const companyCode = COMPANY_MAP[match[1]];
  if (!companyCode) return null;
  return {
    companyCode,
    year: parseInt(match[2], 10),
    month: match[3] ? parseInt(match[3], 10) : 12,
  };
}

// ─── File reading ────────────────────────────────────────────

function parseAmount(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  // Remove commas, trim
  const s = String(v).replace(/,/g, "").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function isOldFormat(firstRow: unknown[]): boolean {
  if (!Array.isArray(firstRow)) return false;
  return firstRow.length >= 2 && firstRow[0] === "项目" && firstRow[1] === "方向";
}

/** Find the header row index in a new-format xlsx, or -1 if not found. */
function findXlsxHeader(rows: unknown[][]): number {
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!Array.isArray(r) || r.length < 5) continue;
    const cells = r.map((c) => String(c ?? "").trim());
    if (
      cells.some((c) => c.includes("现金流量项目分类名称")) &&
      cells.some((c) => c.includes("现金流量项目名称")) &&
      cells.some((c) => c === "方向") &&
      cells.some((c) => c === "金额")
    ) {
      return i;
    }
  }
  return -1;
}

/** Find column indices from the header row. Returns null if columns not found. */
function resolveXlsxColumns(header: unknown[]): {
  colSection: number; colCode: number; colName: number; colDir: number; colAmt: number;
} | null {
  const cols: Record<string, number> = {};
  for (let i = 0; i < header.length; i++) {
    const h = String(header[i] ?? "").trim();
    if (h.includes("分类名称")) cols.section = i;
    else if (h.includes("编码")) cols.code = i;
    else if (h.includes("项目名称")) cols.name = i;
    else if (h === "方向") cols.dir = i;
    else if (h === "金额") cols.amt = i;
  }
  if (cols.section == null || cols.code == null || cols.name == null || cols.dir == null || cols.amt == null) {
    return null;
  }
  return {
    colSection: cols.section,
    colCode: cols.code,
    colName: cols.name,
    colDir: cols.dir,
    colAmt: cols.amt,
  };
}

const SKIP_PATTERNS = /^(合计[：:]|制表人[：:]|打印日期[：:]|第\d+页)/;

function readOldFormat(rows: unknown[][]): ParsedRow[] {
  const out: ParsedRow[] = [];
  for (const r of rows) {
    if (!Array.isArray(r) || r.length < 3) continue;
    const project = String(r[0] ?? "").trim();
    const direction = String(r[1] ?? "").trim();
    const amount = parseAmount(r[2]);
    if (!project || project === "项目") continue;
    out.push({ project, direction, amount });
  }
  return out;
}

function readNewFormat(rows: unknown[][]): ParsedRow[] {
  const headerIdx = findXlsxHeader(rows);
  if (headerIdx < 0) return [];

  const cols = resolveXlsxColumns(rows[headerIdx]);
  if (!cols) return [];

  const out: ParsedRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!Array.isArray(r)) continue;

    const sectionName = String(r[cols.colSection] ?? "").trim();
    const itemCode = String(r[cols.colCode] ?? "").trim();
    const itemName = String(r[cols.colName] ?? "").trim();
    const direction = String(r[cols.colDir] ?? "").trim();
    const amount = parseAmount(r[cols.colAmt]);

    // Skip empty rows, summary rows, footer rows
    if (!itemName && !itemCode && !sectionName) continue;
    if (SKIP_PATTERNS.test(itemName) || SKIP_PATTERNS.test(itemCode) || SKIP_PATTERNS.test(sectionName)) continue;

    // Handle subtotals — may appear in either code or name column
    const candidate = itemName || itemCode;

    // "(经营活动)小计：" / "(投资活动)小计：" / "(筹资活动)小计："
    const stMatch = candidate.match(/^[(（](.+?)[)）]小计[：:]?$/);
    if (stMatch) {
      // Skip non-cash-flow subtotals like "(不影响现金流量的项目)小计："
      if (candidate.includes("不影响")) continue;
      const secLabel = stMatch[1].trim();
      const secMap: Record<string, string> = {
        "经营活动": "经营",
        "投资活动": "投资",
        "筹资活动": "筹资",
      };
      const short = secMap[secLabel] || secLabel;
      out.push({ project: `${short}活动 小计`, direction, amount, section: sectionName });
      continue;
    }

    if (!itemName && !itemCode) continue;
    // Prefer item name; fall back to item code if name is empty
    const displayName = itemName || itemCode;
    out.push({ project: displayName, direction, amount, section: sectionName });
  }
  return out;
}

// ─── Classification ──────────────────────────────────────────

/** Get marker positions for old-format two-pass section resolution. */
function getMarkerPositions(rows: ParsedRow[]): { idx: number; type: Section }[] {
  const markers: { idx: number; type: Section }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const p = rows[i].project;
    if (p === "经营活动 小计") markers.push({ idx: i, type: "operating" });
    else if (p === "投资活动 小计") markers.push({ idx: i, type: "investing" });
    else if (p === "筹资活动 小计") markers.push({ idx: i, type: "financing" });
  }
  return markers;
}

/** Old format: determine section at position by looking for the NEXT section net marker. */
function getSectionAt(idx: number, markers: { idx: number; type: Section }[]): Section | null {
  for (const m of markers) {
    if (m.idx > idx) return m.type;
  }
  return null; // past all markers → unmapped area
}

function classifyRows(rows: ParsedRow[], isNew: boolean): {
  mapped: FileSummary["mapped"];
  unmapped: FileSummary["unmapped"];
  ignored: FileSummary["ignored"];
} {
  const mapped: FileSummary["mapped"] = [];
  const unmapped: FileSummary["unmapped"] = [];
  const ignored: FileSummary["ignored"] = [];

  const markers = isNew ? [] : getMarkerPositions(rows);
  let newFmtSection: Section | null = null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const p = row.project;

    // Ignore certain items
    if (IGNORED_ITEMS.has(p)) {
      ignored.push({ project: p, direction: row.direction, amount: row.amount });
      continue;
    }

    // Section net lines (explicit markers)
    const netCode = SECTION_NET_CODES[p];
    if (netCode) {
      mapped.push({ lineCode: netCode, project: p, direction: row.direction, amount: row.amount });
      continue;
    }

    // Explicit line mapping
    const lineCode = LINE_MAP[p];
    if (lineCode) {
      mapped.push({ lineCode, project: p, direction: row.direction, amount: row.amount });
      continue;
    }

    // Subtotal resolution
    let section: Section | null;
    if (isNew) {
      // New format: section from row data
      if (row.section) {
        if (row.section.includes("经营")) newFmtSection = "operating";
        else if (row.section.includes("投资")) newFmtSection = "investing";
        else if (row.section.includes("筹资")) newFmtSection = "financing";
      }
      section = newFmtSection;
    } else {
      section = getSectionAt(i, markers);
    }

    if (section) {
      const stResult = resolveSubtotal(p, row.direction, section);
      if (stResult) {
        mapped.push({ lineCode: stResult, project: p, direction: row.direction, amount: row.amount });
        continue;
      }
    }

    // Not mapped
    unmapped.push({ project: p, direction: row.direction, amount: row.amount });
  }

  return { mapped, unmapped, ignored };
}

function resolveSubtotal(project: string, direction: string, section: Section): string | null {
  const table = SUBTOTAL_MAP[section];
  if (!table) return null;

  let flowType: "inflow" | "outflow" | null = null;
  if (direction === "净流入" || direction === "流入") flowType = "inflow";
  else if (direction === "净流出" || direction === "流出") flowType = "outflow";
  if (!flowType) return null;

  return table[flowType]?.[project] ?? null;
}

// ─── DB write ────────────────────────────────────────────────

async function writeWorkpaper(
  companyCode: string,
  year: number,
  month: number,
  mapped: FileSummary["mapped"],
  source: string,
): Promise<number> {
  const reportType = "cashFlow";

  const existing = await prisma.financeStatementWorkpaper.findUnique({
    where: { companyCode_year_month_reportType: { companyCode, year, month, reportType } },
    include: { lines: true },
  });

  const incomingCodes = new Set(mapped.map((m) => m.lineCode));
  const lines: {
    lineCode: string;
    manualAmount: number;
    importedAmount: number;
    formulaText: string | null;
    note: string | null;
    source: string | null;
  }[] = [];

  // Keep existing lines not in this import
  if (existing) {
    for (const el of existing.lines) {
      if (!incomingCodes.has(el.lineCode)) {
        lines.push({
          lineCode: el.lineCode,
          manualAmount: el.manualAmount,
          importedAmount: el.importedAmount,
          formulaText: el.formulaText,
          note: el.note,
          source: el.source,
        });
      }
    }
  }

  // Add/update imported lines
  for (const m of mapped) {
    const prev = existing?.lines.find((l) => l.lineCode === m.lineCode);
    lines.push({
      lineCode: m.lineCode,
      manualAmount: prev?.manualAmount ?? 0,
      importedAmount: m.amount,
      formulaText: prev?.formulaText ?? null,
      // Preserve existing note if user-added; use import description for new lines
      note: prev?.note ?? `${m.project}（${m.direction}）`,
      source,
    });
  }

  // Sort by config order
  lines.sort((a, b) => {
    const ao = LINE_ORDER.get(a.lineCode) ?? 999;
    const bo = LINE_ORDER.get(b.lineCode) ?? 999;
    return ao - bo;
  });

  let written = 0;
  await prisma.$transaction(async (tx) => {
    const wp = await tx.financeStatementWorkpaper.upsert({
      where: { companyCode_year_month_reportType: { companyCode, year, month, reportType } },
      create: { companyCode, year, month, reportType, status: "draft" },
      update: { version: { increment: 1 }, editedAt: new Date() },
    });

    const keepCodes = new Set(lines.map((l) => l.lineCode));
    await tx.financeStatementWorkpaperLine.deleteMany({
      where: { workpaperId: wp.id, lineCode: { notIn: [...keepCodes] } },
    });

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      await tx.financeStatementWorkpaperLine.upsert({
        where: { workpaperId_lineCode: { workpaperId: wp.id, lineCode: l.lineCode } },
        create: {
          workpaperId: wp.id,
          lineCode: l.lineCode,
          manualAmount: l.manualAmount,
          importedAmount: l.importedAmount,
          formulaText: l.formulaText,
          note: l.note,
          source: l.source,
          sortOrder: i,
        },
        update: {
          importedAmount: l.importedAmount,
          note: l.note,
          source: l.source,
          sortOrder: i,
        },
      });
      written++;
    }
  });

  return written;
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  const files = fs
    .readdirSync(SRC_DIR)
    .filter((f) => /\.(xlsx?)$/i.test(f))
    .filter((f) => !f.startsWith("."))
    .sort();

  if (files.length === 0) {
    console.log("No cash flow files found in", SRC_DIR);
    process.exit(1);
  }

  const xlsFiles = files.filter((f) => /\.xls$/i.test(f));
  const xlsxFiles = files.filter((f) => /\.xlsx$/i.test(f));
  console.log(`${IS_EXEC ? "EXECUTE" : "DRY-RUN"}: ${files.length} files (${xlsFiles.length} .xls + ${xlsxFiles.length} .xlsx)\n`);

  const summaries: FileSummary[] = [];

  for (const fn of files) {
    const meta = parseFilename(fn);
    if (!meta) {
      console.log(`SKIP ${fn} — cannot parse filename`);
      continue;
    }

    const fp = path.join(SRC_DIR, fn);
    const wb = XLSX.readFile(fp);

    // xlsx: read sheet "第一页" if available, otherwise first sheet
    const sheetName = wb.SheetNames.includes("第一页") ? "第一页" : wb.SheetNames[0];
    const sh = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sh, { header: 1 }) as unknown[][];

    const isNew = findXlsxHeader(rows) >= 0;
    let parsed: ParsedRow[];

    if (isNew) {
      parsed = readNewFormat(rows);
    } else if (isOldFormat(rows[0])) {
      parsed = readOldFormat(rows);
    } else {
      console.log(`SKIP ${fn} — unknown format, first row: ${JSON.stringify(rows[0])}`);
      continue;
    }

    const { mapped, unmapped, ignored } = classifyRows(parsed, isNew);

    let written = 0;
    if (IS_EXEC) {
      written = await writeWorkpaper(meta.companyCode, meta.year, meta.month, mapped, fn);
    }

    const summary: FileSummary = { file: fn, ...meta, mapped, unmapped, ignored, written };
    summaries.push(summary);

    // Per-file summary
    const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2 });
    console.log(`${fn} → co=${meta.companyCode} yr=${meta.year} mo=${meta.month}`);
    const extra = [];
    if (ignored.length) extra.push(`ignored: ${ignored.length}`);
    console.log(`  mapped: ${mapped.length}, unmapped: ${unmapped.length}${extra.length ? ", " + extra.join(", ") : ""}${IS_EXEC ? `, written: ${written}` : ""}`);
    for (const m of mapped) {
      console.log(`    ✓ ${m.lineCode}  ←  "${m.project}"  ${m.direction}  ${fmt(m.amount)}`);
    }
    for (const u of unmapped) {
      console.log(`    ✗ UNMAPPED: "${u.project}"  ${u.direction}  ${fmt(u.amount)}`);
    }
    for (const ig of ignored) {
      console.log(`    ~ IGNORED: "${ig.project}"  ${ig.direction}  ${fmt(ig.amount)}`);
    }
    console.log();
  }

  // Grand summary
  const totalMapped = summaries.reduce((s, f) => s + f.mapped.length, 0);
  const totalUnmapped = summaries.reduce((s, f) => s + f.unmapped.length, 0);
  const totalIgnored = summaries.reduce((s, f) => s + f.ignored.length, 0);
  const totalWritten = summaries.reduce((s, f) => s + f.written, 0);
  console.log(`=== ${summaries.length} files processed ===`);
  console.log(`  Total mapped:   ${totalMapped}`);
  console.log(`  Total unmapped: ${totalUnmapped}`);
  console.log(`  Total ignored:  ${totalIgnored}`);
  console.log(`  Total written:  ${totalWritten}${IS_EXEC ? "" : " (dry-run)"}`);

  if (!IS_EXEC) console.log("\n  Run with --execute to write to DB.");
}

main()
  .catch((e) => {
    console.error("Import failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
