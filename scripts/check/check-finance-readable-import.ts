import { prisma, Prisma } from "@workspace/platform/server/prisma";
import { FINANCE_READABLE_BATCHES } from "../../packages/finance/server/import/readable/source-plan";
import { generateFinanceReport } from "../../packages/finance/server/statements/report-generator";

type Control = Record<string, number>;
type TrialMismatch = {
  companyCode: string;
  year: number;
  month: number;
  openingDifference: number;
  currentDifference: number;
  closingDifference: number;
};
type ContinuityMismatch = {
  companyCode: string;
  year: number;
  month: number;
  accountCode: string;
  debitDifference: number;
  creditDifference: number;
};
type SourceDifference = {
  companyCode: string;
  year: number;
  month: number;
  accountCode: string;
  debitDifference: number;
  creditDifference: number;
};

const failures: string[] = [];
function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function expectEqual(label: string, actual: number | string, expected: number | string) {
  if (actual !== expected) failures.push(`${label}: expected ${expected}, received ${actual}`);
}
function parseWarnings(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [value];
  } catch {
    return [value];
  }
}

function expectedBatchKey(spec: (typeof FINANCE_READABLE_BATCHES)[number]) {
  return `finance-readable:${spec.sourceSystem}:${spec.sourceDatabase}:${spec.year}`;
}

async function checkBatchControls() {
  const imports = await prisma.financeLedgerImport.findMany({
    where: { batchKey: { startsWith: "finance-readable:" } },
    include: {
      _count: {
        select: {
          vouchers: true,
          items: true,
          sourceBalances: true,
          auxiliaryBalances: true,
          cashFlowAllocations: true,
          openItems: true,
        },
      },
    },
  });
  const byKey = new Map(imports.flatMap((item) => item.batchKey ? [[item.batchKey, item] as const] : []));
  expectEqual("readable batch count", imports.length, FINANCE_READABLE_BATCHES.length);

  for (const spec of FINANCE_READABLE_BATCHES) {
    const batch = byKey.get(expectedBatchKey(spec));
    if (!batch) {
      failures.push(`missing batch ${spec.companyCode}-${spec.year}`);
      continue;
    }
    expectEqual(`${spec.companyCode}-${spec.year} status`, batch.status, "completed");
    const warnings = parseWarnings(batch.warnings);
    if (warnings.length) failures.push(`${spec.companyCode}-${spec.year} warnings: ${warnings.join("; ")}`);
    const control = (batch.controlJson ?? {}) as Control;
    const [posted, draft, itemTotals, accounts] = await Promise.all([
      prisma.financeVoucher.count({ where: { importId: batch.id, status: "posted" } }),
      prisma.financeVoucher.count({ where: { importId: batch.id, status: "draft" } }),
      prisma.financeVoucherItem.aggregate({
        where: { importId: batch.id },
        _sum: { debit: true, credit: true },
      }),
      prisma.financeAccount.count({
        where: {
          companyCode: spec.companyCode,
          year: spec.year,
          sourceSystem: spec.sourceSystem,
          sourceDatabase: spec.sourceDatabase,
        },
      }),
    ]);
    const actual = {
      accounts,
      vouchers: batch._count.vouchers,
      postedVouchers: posted,
      draftVouchers: draft,
      items: batch._count.items,
      debit: roundMoney(itemTotals._sum.debit ?? 0),
      credit: roundMoney(itemTotals._sum.credit ?? 0),
      sourceBalances: batch._count.sourceBalances,
      auxiliaryBalances: batch._count.auxiliaryBalances,
      cashFlowAllocations: batch._count.cashFlowAllocations,
      openItems: batch._count.openItems,
    };
    for (const [key, value] of Object.entries(actual)) {
      expectEqual(`${spec.companyCode}-${spec.year} ${key}`, value, Number(control[key] ?? -1));
    }
    expectEqual(`${spec.companyCode}-${spec.year} debit-credit`, actual.debit, actual.credit);
  }
  return imports.length;
}

function importedScopeSql() {
  return Prisma.join(FINANCE_READABLE_BATCHES.map((spec) => Prisma.sql`
    (p."companyCode" = ${spec.companyCode} AND p."year" = ${spec.year})
  `), " OR ");
}

async function checkBalanceCaches() {
  const scope = importedScopeSql();
  const trialMismatches = await prisma.$queryRaw<TrialMismatch[]>(Prisma.sql`
    SELECT p."companyCode", p."year", p."month",
      ROUND(CAST(SUM(b."openingDebit" - b."openingCredit") AS numeric), 2)::double precision AS "openingDifference",
      ROUND(CAST(SUM(b."currentDebit" - b."currentCredit") AS numeric), 2)::double precision AS "currentDifference",
      ROUND(CAST(SUM(b."closingDebit" - b."closingCredit") AS numeric), 2)::double precision AS "closingDifference"
    FROM "FinanceAccountBalance" b
    JOIN "FinancePeriod" p ON p."id" = b."periodId"
    JOIN "FinanceAccount" a ON a."id" = b."accountId"
    WHERE a."parentId" IS NULL AND (${scope})
    GROUP BY p."companyCode", p."year", p."month"
    HAVING ABS(SUM(b."openingDebit" - b."openingCredit")) > 0.005
      OR ABS(SUM(b."currentDebit" - b."currentCredit")) > 0.005
      OR ABS(SUM(b."closingDebit" - b."closingCredit")) > 0.005
  `);
  if (trialMismatches.length) failures.push(`trial-balance mismatches: ${JSON.stringify(trialMismatches)}`);

  const continuityMismatches = await prisma.$queryRaw<ContinuityMismatch[]>(Prisma.sql`
    SELECT p."companyCode", p."year", p."month", a."code" AS "accountCode",
      ROUND(CAST(n."openingDebit" - b."closingDebit" AS numeric), 2)::double precision AS "debitDifference",
      ROUND(CAST(n."openingCredit" - b."closingCredit" AS numeric), 2)::double precision AS "creditDifference"
    FROM "FinanceAccountBalance" b
    JOIN "FinancePeriod" p ON p."id" = b."periodId"
    JOIN "FinancePeriod" np ON np."companyCode" = p."companyCode"
      AND np."year" = p."year" AND np."month" = p."month" + 1
    JOIN "FinanceAccountBalance" n ON n."periodId" = np."id" AND n."accountId" = b."accountId"
    JOIN "FinanceAccount" a ON a."id" = b."accountId"
    WHERE p."month" < 12 AND (${scope})
      AND (ABS(n."openingDebit" - b."closingDebit") > 0.005
        OR ABS(n."openingCredit" - b."closingCredit") > 0.005)
  `);
  if (continuityMismatches.length) {
    failures.push(`opening continuity mismatches: ${JSON.stringify(continuityMismatches.slice(0, 20))}`);
  }
  return { trialMismatches: trialMismatches.length, continuityMismatches: continuityMismatches.length };
}

async function sourceVoucherDifferences() {
  return prisma.$queryRaw<SourceDifference[]>(Prisma.sql`
    SELECT s."companyCode", p."year", p."month", a."code" AS "accountCode",
      ROUND(CAST(s."currentDebit" - b."currentDebit" AS numeric), 2)::double precision AS "debitDifference",
      ROUND(CAST(s."currentCredit" - b."currentCredit" AS numeric), 2)::double precision AS "creditDifference"
    FROM "FinanceSourceAccountBalance" s
    JOIN "FinanceAccountBalance" b ON b."periodId" = s."periodId" AND b."accountId" = s."accountId"
    JOIN "FinancePeriod" p ON p."id" = s."periodId"
    JOIN "FinanceAccount" a ON a."id" = s."accountId"
    WHERE s."sourceSystem" = 'T6'
      AND (ABS(CAST(s."currentDebit" AS double precision) - b."currentDebit") > 0.005
        OR ABS(CAST(s."currentCredit" AS double precision) - b."currentCredit") > 0.005)
    ORDER BY s."companyCode", p."year", p."month", a."code"
  `);
}

async function checkReports() {
  const historicalCashFlowExceptions: object[] = [];
  for (const spec of FINANCE_READABLE_BATCHES) {
    const month = spec.year === 2026 ? 6 : 12;
    const balanceResponse = await generateFinanceReport({
      companyCode: spec.companyCode,
      year: spec.year,
      month,
      reportType: "balance",
    });
    const balance = await balanceResponse.json() as Record<string, unknown>;
    const assets = balance.assets as { label: string; amount: number }[] | undefined;
    const assetTotal = assets?.find((line) => line.label === "资产总计")?.amount;
    const liabilityTotal = Number(balance.totalLiabilitiesAndEquity ?? 0);
    if (balanceResponse.status !== 200 || assetTotal === undefined || roundMoney(assetTotal - liabilityTotal) !== 0) {
      failures.push(`${spec.companyCode}-${spec.year} balance sheet does not balance`);
    }
    if (Array.isArray(balance.diagnostics) && balance.diagnostics.length) {
      failures.push(`${spec.companyCode}-${spec.year} balance diagnostics: ${JSON.stringify(balance.diagnostics)}`);
    }

    if (spec.year !== 2026) {
      const cashResponse = await generateFinanceReport({
        companyCode: spec.companyCode, year: spec.year, month, reportType: "cashflow",
      });
      const cash = await cashResponse.json() as Record<string, unknown>;
      if (cash.source === "empty" || (Array.isArray(cash.diagnostics) && cash.diagnostics.length)) {
        historicalCashFlowExceptions.push({
          companyCode: spec.companyCode, year: spec.year, source: cash.source,
          diagnostics: cash.diagnostics ?? [],
        });
      }
      continue;
    }

    for (const reportType of ["income", "cashflow"] as const) {
      const response = await generateFinanceReport({
        companyCode: spec.companyCode, year: spec.year, month, reportType,
      });
      const report = await response.json() as Record<string, unknown>;
      if (response.status !== 200 || report.source !== "system") {
        failures.push(`${spec.companyCode}-2026 ${reportType} source is ${String(report.source)}`);
      }
      if (Array.isArray(report.diagnostics) && report.diagnostics.length) {
        failures.push(`${spec.companyCode}-2026 ${reportType} diagnostics: ${JSON.stringify(report.diagnostics)}`);
      }
    }
  }
  return historicalCashFlowExceptions;
}

async function main() {
  const excluded = await prisma.financeLedgerImport.count({
    where: { type: "readable", companyCode: "04" },
  });
  expectEqual("excluded company 04 readable batches", excluded, 0);
  const batches = await checkBatchControls();
  const balances = await checkBalanceCaches();
  const [sourceDifferences, historicalCashFlowExceptions] = await Promise.all([
    sourceVoucherDifferences(),
    checkReports(),
  ]);
  const result = {
    ok: failures.length === 0,
    batches,
    excludedCompany04Batches: excluded,
    ...balances,
    sourceVoucherDifferences: sourceDifferences,
    historicalCashFlowExceptions,
    failures,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (failures.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
