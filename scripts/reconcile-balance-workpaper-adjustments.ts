/**
 * Reconcile a statutory balance-sheet workpaper to mapping-based ledger output.
 *
 * Writes only when paired source/target line deltas agree and inferred
 * movements explain the full asset/liability difference. Equity is never a
 * balancing plug.
 *
 * Usage:
 *   npm run finance:statements-reconcile-balance -- --company=01 --years=2024,2025
 *   npm run finance:statements-reconcile-balance -- --company=01 --years=2024,2025 --execute
 */
import "dotenv/config";
import { prisma } from "@workspace/platform/server/prisma";
import { aggregateMappingBasedBalances } from "@workspace/finance/server/statements/mapping-based-balances";
import { loadBalanceSheetConfig } from "@workspace/finance/server/statements/config/load-config";
import { computeBalanceSheet } from "@workspace/finance/server/statements/compute-balance-sheet";
import { resolveReclassEntriesToLines } from "@workspace/finance/server/statements/mapping/reclass-routing";

interface ReclassPair {
  sourceAccountCode: string;
  sourceLineCode: string;
  targetAccountCode: string;
  targetLineCode: string;
}

const REFERENCE_RECLASS_PAIRS: ReclassPair[] = [
  { sourceAccountCode: "2202", sourceLineCode: "payables", targetAccountCode: "1123", targetLineCode: "prepaid" },
  { sourceAccountCode: "2241", sourceLineCode: "otherPayables", targetAccountCode: "1221", targetLineCode: "otherReceivableNet" },
  { sourceAccountCode: "2221", sourceLineCode: "taxes", targetAccountCode: "1463", targetLineCode: "otherCurrentAssets" },
];

const execute = process.argv.includes("--execute");
const companyCode = argument("company");
const years = argument("years").split(",").map((value) => Number(value.trim())).filter(Number.isInteger);
const month = Number(optionalArgument("month") ?? "12");

if (years.length === 0 || !Number.isInteger(month) || month < 1 || month > 12) {
  throw new Error("用法: --company=01 --years=2024,2025 [--month=12] [--execute]");
}

function argument(name: string) {
  const value = optionalArgument(name);
  if (!value) throw new Error(`缺少 --${name}=...`);
  return value;
}

function optionalArgument(name: string) {
  return process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function assertMoneyEqual(actual: number, expected: number, message: string) {
  if (money(actual - expected) !== 0) {
    throw new Error(`${message}: ${actual.toFixed(2)} ≠ ${expected.toFixed(2)}`);
  }
}

async function rawLineAmounts(year: number) {
  const [config, aggregate] = await Promise.all([
    loadBalanceSheetConfig(companyCode, year),
    aggregateMappingBasedBalances(companyCode, year, month, "balance"),
  ]);
  const mappingByLine = new Map(aggregate.byLineCode.map((line) => [
    line.lineCode,
    { debit: line.debit, credit: line.credit },
  ]));
  const emptyRouting = { deductionsByLine: new Map(), additionsByLine: new Map(), unresolved: [] };
  return new Map(computeBalanceSheet(config, mappingByLine, emptyRouting).lines.map((line) => [line.lineCode, line.amount]));
}

async function reconcileYear(year: number) {
  const [period, workpaper, raw] = await Promise.all([
    prisma.financePeriod.findUnique({ where: { companyCode_year_month: { companyCode, year, month } } }),
    prisma.financeStatementWorkpaper.findUnique({
      where: { companyCode_year_month_reportType: { companyCode, year, month, reportType: "balanceSheet" } },
      include: { lines: true },
    }),
    rawLineAmounts(year),
  ]);
  if (!period) throw new Error(`${companyCode}/${year}/${month} 期间不存在`);
  if (!workpaper) throw new Error(`${companyCode}/${year}/${month} 没有资产负债表底稿`);

  const source = new Map(workpaper.lines.map((line) => [line.lineCode, money(line.importedAmount + line.manualAmount)]));
  const candidates = REFERENCE_RECLASS_PAIRS.map((pair) => {
    const sourceDelta = money((source.get(pair.sourceLineCode) ?? 0) - (raw.get(pair.sourceLineCode) ?? 0));
    const targetDelta = money((source.get(pair.targetLineCode) ?? 0) - (raw.get(pair.targetLineCode) ?? 0));
    if (sourceDelta < 0 || targetDelta < 0) {
      throw new Error(`${year} ${pair.sourceLineCode}/${pair.targetLineCode} 不是正向重分类差额`);
    }
    assertMoneyEqual(sourceDelta, targetDelta, `${year} ${pair.sourceLineCode}/${pair.targetLineCode} 两端差额不一致`);
    return { ...pair, amount: sourceDelta };
  }).filter((candidate) => candidate.amount !== 0);

  const inferredTotal = money(candidates.reduce((sum, candidate) => sum + candidate.amount, 0));
  const assetDelta = money((source.get("totalAssets") ?? 0) - (raw.get("totalAssets") ?? 0));
  const liabilityDelta = money((source.get("totalLiabilities") ?? 0) - (raw.get("totalLiabilities") ?? 0));
  assertMoneyEqual(inferredTotal, assetDelta, `${year} 推导重分类未解释全部资产差额`);
  assertMoneyEqual(inferredTotal, liabilityDelta, `${year} 推导重分类未解释全部负债差额`);
  assertMoneyEqual(source.get("totalEquity") ?? 0, raw.get("totalEquity") ?? 0, `${year} 权益不应作为配平项`);
  assertMoneyEqual(
    source.get("totalAssets") ?? 0,
    money((source.get("totalLiabilities") ?? 0) + (source.get("totalEquity") ?? 0)),
    `${year} 源底稿自身不平衡`,
  );

  console.log(`${execute ? "RECONCILE" : "DRY-RUN"} ${companyCode}/${year}/${month}`);
  for (const candidate of candidates) {
    console.log(`  ${candidate.sourceAccountCode} → ${candidate.targetAccountCode}: ${candidate.amount.toFixed(2)}`);
  }
  console.log(`  total: ${inferredTotal.toFixed(2)} | assets: ${assetDelta.toFixed(2)} | liabilities: ${liabilityDelta.toFixed(2)}`);

  if (!execute) return;

  const protectedRows = await prisma.financeBalanceReclassAdjustment.findMany({
    where: { periodId: period.id, status: { in: ["adjusted", "rejected"] } },
    select: { sourceAccountCode: true, status: true },
  });
  if (protectedRows.length > 0) {
    throw new Error(`${year} 存在受保护的余额调整，拒绝覆盖: ${protectedRows.map((row) => `${row.sourceAccountCode}/${row.status}`).join(", ")}`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.financeBalanceReclassAdjustment.deleteMany({
      where: { periodId: period.id, sourceType: { in: ["balance_residual", "reference_workpaper"] }, status: "approved" },
    });
    for (const candidate of candidates) {
      const note = JSON.stringify({
        basis: "statutory_balance_workpaper",
        workpaperId: workpaper.id,
        sourceLineCode: candidate.sourceLineCode,
        targetLineCode: candidate.targetLineCode,
      });
      await tx.financeBalanceReclassAdjustment.upsert({
        where: { periodId_sourceAccountCode: { periodId: period.id, sourceAccountCode: candidate.sourceAccountCode } },
        create: {
          periodId: period.id,
          companyCode,
          year,
          sourceAccountCode: candidate.sourceAccountCode,
          targetAccountCode: candidate.targetAccountCode,
          amount: candidate.amount,
          sourceType: "reference_workpaper",
          status: "approved",
          note,
        },
        update: {
          targetAccountCode: candidate.targetAccountCode,
          amount: candidate.amount,
          sourceType: "reference_workpaper",
          status: "approved",
          note,
        },
      });
    }
  });

  const [config, aggregate, adjustments] = await Promise.all([
    loadBalanceSheetConfig(companyCode, year),
    aggregateMappingBasedBalances(companyCode, year, month, "balance"),
    prisma.financeBalanceReclassAdjustment.findMany({
      where: { periodId: period.id, status: { in: ["approved", "adjusted"] } },
      select: { sourceAccountCode: true, targetAccountCode: true, amount: true },
    }),
  ]);
  const mappingByLine = new Map(aggregate.byLineCode.map((line) => [
    line.lineCode,
    { debit: line.debit, credit: line.credit },
  ]));
  const routing = await resolveReclassEntriesToLines(companyCode, year, adjustments.map((row) => ({
    sourceAccount: row.sourceAccountCode,
    targetAccount: row.targetAccountCode,
    amount: row.amount,
  })));
  const reconciled = new Map(computeBalanceSheet(config, mappingByLine, routing).lines.map((line) => [line.lineCode, line.amount]));
  const differences = [...source.entries()].filter(([lineCode, amount]) => money(amount - (reconciled.get(lineCode) ?? 0)) !== 0);
  if (differences.length > 0) {
    throw new Error(`${year} 执行后仍有报表差异: ${differences.map(([lineCode, amount]) => `${lineCode}=${money(amount - (reconciled.get(lineCode) ?? 0)).toFixed(2)}`).join(", ")}`);
  }
  console.log("  verified: exact");
}

async function main() {
  try {
    for (const year of years) await reconcileYear(year);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
