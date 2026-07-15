import { createHash } from "node:crypto";
import XLSX from "xlsx";
import { prisma, type Prisma } from "@workspace/platform/server/prisma";
import { buildAssetWorkbookImportCommand } from "../domain/asset-validation";

type ParsedAsset = {
  sourceKey: string;
  assetCode: string;
  name: string;
  assetKind: "fixed_asset" | "intangible" | "prepaid" | "long_term_deferred";
  category?: string;
  assetAccountCode: string;
  accumulatedAccountCode?: string;
  acquisitionDate?: string;
  depreciationStartDate?: string;
  originalCost: number;
  residualRate: number;
  usefulLifeMonths?: number;
  openingAccumulatedAmount: number;
  openingAsOfDate?: string;
  nonAmortizationReason?: string;
  note?: string;
  sourceSheet: string;
  sourceRow: number;
  periodAmount: number;
  voucherNo?: string;
};

type ParsedCostLine = { sourceKey: string; sourceRow: number; referenceNo?: string; amount: number; treatment: "included" | "waived"; reason?: string };

export type ParsedAssetWorkbook = {
  assets: ParsedAsset[];
  adjustment: { amount: number; reason: string; voucherNo: string; sourceRow: number };
  renovationCostLines: ParsedCostLine[];
  checks: { fixedNormal: number; fixedAdjustment: number; fixedPosted: number; renovationGross: number; renovationWaived: number; renovationCapitalized: number };
};

const money = (value: unknown) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const rows = (workbook: XLSX.WorkBook, name: string) => XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: true, defval: null }) as unknown[][];

export function parseAssetWorkbook(buffer: Buffer): ParsedAssetWorkbook {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const fixed = rows(workbook, "9&10-1");
  const intangible = rows(workbook, "9&10-2");
  const deferred = rows(workbook, "9&10-3");
  const fixedAssets: ParsedAsset[] = fixed.slice(5, 156).filter((row) => Number.isFinite(Number(row[0]))).map((row, offset) => {
    const acquisitionDate = dateKey(row[3]);
    return {
      sourceKey: `9&10-1:${offset + 6}`,
      assetCode: `FA-${String(Number(row[0])).padStart(4, "0")}`,
      name: String(row[1] ?? "").trim(),
      assetKind: "fixed_asset",
      category: String(row[2] ?? "").trim() || undefined,
      assetAccountCode: "1601",
      accumulatedAccountCode: "1602",
      acquisitionDate,
      depreciationStartDate: nextMonth(acquisitionDate),
      originalCost: money(row[7]),
      residualRate: Number(row[9] ?? 0),
      usefulLifeMonths: Number(row[8]) * 12,
      openingAccumulatedAmount: money(row[19]),
      openingAsOfDate: "2026-04-30",
      sourceSheet: "9&10-1",
      sourceRow: offset + 6,
      periodAmount: money(row[12]),
      voucherNo: "2026-05-记-0052",
    };
  });
  const intangibleRow = intangible[2];
  const intangibleAsset: ParsedAsset = {
    sourceKey: "9&10-2:3",
    assetCode: "IA-0001",
    name: String(intangibleRow[1]),
    assetKind: "intangible",
    assetAccountCode: "1701",
    accumulatedAccountCode: "1702",
    acquisitionDate: dateKey(intangibleRow[2]),
    originalCost: money(intangibleRow[3]),
    residualRate: 0,
    openingAccumulatedAmount: money(intangibleRow[5]),
    nonAmortizationReason: "源表未提供使用期限和摊销政策，暂不自动摊销",
    sourceSheet: "9&10-2",
    sourceRow: 3,
    periodAmount: money(intangibleRow[4]),
  };
  const prepaidAssets = deferred.slice(2, 4).map<ParsedAsset>((row, index) => ({
    sourceKey: `9&10-3:${index + 3}`,
    assetCode: `PA-${String(index + 1).padStart(4, "0")}`,
    name: String(row[0]),
    assetKind: "prepaid",
    assetAccountCode: "1463",
    acquisitionDate: dateKey(row[1]),
    depreciationStartDate: dateKey(row[1]),
    originalCost: money(row[2]),
    residualRate: 0,
    usefulLifeMonths: Number(row[3]),
    openingAccumulatedAmount: money(Number(row[7]) - Number(row[6])),
    openingAsOfDate: "2026-04-30",
    sourceSheet: "9&10-3",
    sourceRow: index + 3,
    periodAmount: money(row[6]),
    voucherNo: "2026-05-记-0053",
  }));
  const renovationCapitalized = money(deferred[28][3]);
  const renovationMonthly = money(deferred[28][4]);
  const renovationAsset: ParsedAsset = {
    sourceKey: "9&10-3:18-29",
    assetCode: "LTDA-0001",
    name: "办公装修工程",
    assetKind: "long_term_deferred",
    assetAccountCode: "1801",
    depreciationStartDate: "2026-04-01",
    originalCost: renovationCapitalized,
    residualRate: 0,
    usefulLifeMonths: 60,
    openingAccumulatedAmount: renovationMonthly,
    openingAsOfDate: "2026-04-30",
    note: "起算日期依据2026年5月总账期末净额反推为2026-04-01；保留为导入警示事实",
    sourceSheet: "9&10-3",
    sourceRow: 29,
    periodAmount: renovationMonthly,
    voucherNo: "2026-05-记-0054",
  };
  const renovationCostLines = deferred.slice(17, 28).map<ParsedCostLine>((row, index) => ({
    sourceKey: `9&10-3:${index + 18}`,
    sourceRow: index + 18,
    referenceNo: String(row[0] ?? "").trim() || undefined,
    amount: money(row[3]),
    treatment: index + 18 === 20 ? "waived" : "included",
    reason: index + 18 === 20 ? "该发票金额已免除，不计入摊销原值" : undefined,
  }));
  const adjustmentRow = fixed[159];
  const fixedNormal = money(fixedAssets.reduce((sum, asset) => sum + asset.periodAmount, 0));
  const fixedAdjustment = money(adjustmentRow[8]);
  const fixedPosted = money(fixed[4][12]);
  const renovationGross = money(renovationCostLines.reduce((sum, line) => sum + line.amount, 0));
  const renovationWaived = money(renovationCostLines.filter((line) => line.treatment === "waived").reduce((sum, line) => sum + line.amount, 0));
  assertEqual(money(fixedNormal + fixedAdjustment), fixedPosted, "固定资产正常折旧+调整与总额不一致");
  assertEqual(money(renovationGross - renovationWaived), renovationCapitalized, "装修发票总额-免除金额与入账原值不一致");
  return {
    assets: [...fixedAssets, intangibleAsset, ...prepaidAssets, renovationAsset],
    adjustment: { amount: fixedAdjustment, reason: String(adjustmentRow[10]), voucherNo: String(adjustmentRow[16]), sourceRow: 160 },
    renovationCostLines,
    checks: { fixedNormal, fixedAdjustment, fixedPosted, renovationGross, renovationWaived, renovationCapitalized },
  };
}

export async function importAssetWorkbook(input: { buffer: Buffer; sourceFile: string; companyCode: string; year: number; month: number; userId?: number }) {
  const command = buildAssetWorkbookImportCommand(input);
  if (!command.ok) throw new Error(command.issue.message);
  input = command.data;
  const parsed = parseAssetWorkbook(input.buffer);
  const checksum = createHash("sha256").update(input.buffer).digest("hex");
  return prisma.$transaction(async (tx) => {
    const period = await tx.financePeriod.findUnique({ where: { companyCode_year_month: { companyCode: input.companyCode, year: input.year, month: input.month } } });
    if (!period) throw new Error("目标会计期间不存在");
    const voucherNos = [...new Set(parsed.assets.map((asset) => asset.voucherNo).filter((value): value is string => Boolean(value)).concat(parsed.adjustment.voucherNo))];
    const vouchers = await tx.financeVoucher.findMany({ where: { companyCode: input.companyCode, periodId: period.id, voucherNo: { in: voucherNos } } });
    const voucherByNo = new Map(vouchers.map((voucher) => [voucher.voucherNo, voucher.id]));
    if (voucherByNo.size !== voucherNos.length) throw new Error("0052/0053/0054凭证不完整，停止导入");
    const cardIds = new Map<string, number>();
    for (const asset of parsed.assets) {
      const card = await tx.financeAssetCard.upsert({
        where: { companyCode_sourceKey: { companyCode: input.companyCode, sourceKey: asset.sourceKey } },
        create: { ...assetData(asset, input), editedBy: input.userId },
        update: { ...assetData(asset, input), editedBy: input.userId, version: { increment: 1 } },
      });
      cardIds.set(asset.sourceKey, card.id);
      await tx.financeAssetPeriodEntry.upsert({
        where: { assetId_periodId: { assetId: card.id, periodId: period.id } },
        create: { assetId: card.id, periodId: period.id, normalAmount: asset.periodAmount, status: "voucher_linked", voucherId: asset.voucherNo ? voucherByNo.get(asset.voucherNo) : null, sourceFile: input.sourceFile, sourceSheet: asset.sourceSheet, sourceRow: asset.sourceRow },
        update: { normalAmount: asset.periodAmount, status: "voucher_linked", voucherId: asset.voucherNo ? voucherByNo.get(asset.voucherNo) : null, sourceFile: input.sourceFile, sourceSheet: asset.sourceSheet, sourceRow: asset.sourceRow },
      });
    }
    const renovationId = cardIds.get("9&10-3:18-29");
    if (!renovationId) throw new Error("装修资产卡片导入失败");
    for (const line of parsed.renovationCostLines) {
      await tx.financeAssetCostLine.upsert({
        where: { assetId_sourceKey: { assetId: renovationId, sourceKey: line.sourceKey } },
        create: { assetId: renovationId, ...line, lineType: "invoice", sourceFile: input.sourceFile, sourceSheet: "9&10-3" },
        update: { ...line, lineType: "invoice", sourceFile: input.sourceFile, sourceSheet: "9&10-3" },
      });
    }
    await upsertAllocation(tx, renovationId, "660236", ratio(62639.77 / parsed.assets.at(-1)!.periodAmount));
    await upsertAllocation(tx, renovationId, "53011111", ratio(19446.16 / parsed.assets.at(-1)!.periodAmount));
    await tx.financeAssetAdjustment.upsert({
      where: { companyCode_sourceKey: { companyCode: input.companyCode, sourceKey: "9&10-1:160" } },
      create: { companyCode: input.companyCode, periodId: period.id, accountCode: "1602", amount: parsed.adjustment.amount, reason: parsed.adjustment.reason, status: "confirmed", voucherId: voucherByNo.get(parsed.adjustment.voucherNo), sourceFile: input.sourceFile, sourceSheet: "9&10-1", sourceRow: parsed.adjustment.sourceRow, sourceKey: "9&10-1:160", createdBy: input.userId },
      update: { amount: parsed.adjustment.amount, reason: parsed.adjustment.reason, voucherId: voucherByNo.get(parsed.adjustment.voucherNo) },
    });
    await tx.financeAssetImportBatch.upsert({
      where: { companyCode_checksum: { companyCode: input.companyCode, checksum } },
      create: { companyCode: input.companyCode, sourceFile: input.sourceFile, checksum, cardCount: parsed.assets.length, costLineCount: parsed.renovationCostLines.length, warningCount: 2, importedBy: input.userId, note: "无形资产缺少摊销政策；装修起算日期依据总账反推" },
      update: { sourceFile: input.sourceFile, cardCount: parsed.assets.length, costLineCount: parsed.renovationCostLines.length, warningCount: 2, importedBy: input.userId },
    });
    return { cardCount: parsed.assets.length, costLineCount: parsed.renovationCostLines.length, adjustmentCount: 1, checks: parsed.checks };
  });
}

function assetData(asset: ParsedAsset, input: { sourceFile: string; companyCode: string }) {
  return { companyCode: input.companyCode, assetCode: asset.assetCode, name: asset.name, assetKind: asset.assetKind, category: asset.category, assetAccountCode: asset.assetAccountCode, accumulatedAccountCode: asset.accumulatedAccountCode, acquisitionDate: asset.acquisitionDate, depreciationStartDate: asset.depreciationStartDate, originalCost: asset.originalCost, residualRate: asset.residualRate, usefulLifeMonths: asset.usefulLifeMonths, openingAccumulatedAmount: asset.openingAccumulatedAmount, openingAsOfDate: asset.openingAsOfDate, nonAmortizationReason: asset.nonAmortizationReason, note: asset.note, status: "active", sourceFile: input.sourceFile, sourceSheet: asset.sourceSheet, sourceRow: asset.sourceRow, sourceKey: asset.sourceKey };
}

async function upsertAllocation(tx: Prisma.TransactionClient, assetId: number, expenseAccountCode: string, allocationRate: number) {
  await tx.financeAssetExpenseAllocation.upsert({ where: { assetId_expenseAccountCode: { assetId, expenseAccountCode } }, create: { assetId, expenseAccountCode, allocationRate }, update: { allocationRate } });
}

function dateKey(value: unknown) {
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return "";
    return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value ?? "").trim();
  if (!text) return "";
  return text.slice(0, 10);
}

function nextMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month, 1));
  return date.toISOString().slice(0, 10);
}

function assertEqual(actual: number, expected: number, message: string) {
  if (Math.abs(actual - expected) > 0.01) throw new Error(`${message}: ${actual} != ${expected}`);
}

function ratio(value: number) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}
