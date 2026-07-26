import { prisma } from "@workspace/platform/server/prisma";

import { generateFinanceReport } from "../../packages/finance/server/statements/report-generator";
import { FINANCE_READABLE_BATCHES } from "../import/finance-readable-source-plan";

const TARGET_YEAR = 2026;
const TARGET_MONTH = 6;

async function main() {
  const companyCodes = [...new Set(FINANCE_READABLE_BATCHES
    .filter((batch) => batch.year === TARGET_YEAR)
    .map((batch) => batch.companyCode))].sort();
  if (companyCodes.length !== 5) {
    throw new Error(`630 三表验收应覆盖 5 家公司，当前来源计划为 ${companyCodes.length} 家`);
  }

  const results: Array<{
    companyCode: string;
    balance: number;
    reports: Record<string, { status: number; source: unknown; diagnostics: unknown[] }>;
  }> = [];
  const failures: string[] = [];

  for (const companyCode of companyCodes) {
    const reports: Record<string, { status: number; source: unknown; diagnostics: unknown[] }> = {};
    let balanceDifference = 0;
    for (const reportType of ["balance", "income", "cashflow"] as const) {
      const response = await generateFinanceReport({
        companyCode,
        year: TARGET_YEAR,
        month: TARGET_MONTH,
        reportType,
      });
      const payload = await response.json() as Record<string, unknown>;
      const diagnostics = Array.isArray(payload.diagnostics) ? payload.diagnostics : [];
      reports[reportType] = { status: response.status, source: payload.source, diagnostics };
      if (response.status !== 200) failures.push(`${companyCode} ${reportType} 返回 ${response.status}`);
      if (payload.source !== "system") failures.push(`${companyCode} ${reportType} 未使用系统账来源`);
      if (diagnostics.length > 0) failures.push(`${companyCode} ${reportType} 存在诊断：${JSON.stringify(diagnostics)}`);
      if (reportType === "balance") {
        const assets = Array.isArray(payload.assets)
          ? payload.assets as Array<{ label?: string; amount?: number }>
          : [];
        const totalAssets = assets.find((line) => line.label === "资产总计")?.amount ?? 0;
        const totalLiabilitiesAndEquity = Number(payload.totalLiabilitiesAndEquity ?? 0);
        balanceDifference = roundMoney(totalAssets - totalLiabilitiesAndEquity);
        if (balanceDifference !== 0) failures.push(`${companyCode} 资产负债表不平：${balanceDifference}`);
      }
    }
    results.push({ companyCode, balance: balanceDifference, reports });
  }

  process.stdout.write(`${JSON.stringify({
    ok: failures.length === 0,
    period: `${TARGET_YEAR}-${String(TARGET_MONTH).padStart(2, "0")}-30`,
    companies: companyCodes.length,
    results,
    failures,
  }, null, 2)}\n`);
  if (failures.length > 0) process.exitCode = 1;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
