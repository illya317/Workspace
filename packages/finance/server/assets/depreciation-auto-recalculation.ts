import { prisma } from "@workspace/platform/server/prisma";

import { recalculateFinanceAssetPeriod } from "./recalculation-service";

export const ASSET_DEPRECIATION_SCHEDULE_TIME_ZONE = "Asia/Shanghai";

export type AssetDepreciationAutoRecalculationDependencies = {
  database: Pick<typeof prisma, "financePeriod">;
  recalculate: typeof recalculateFinanceAssetPeriod;
  log: (event: Record<string, unknown>) => void;
};

export type AssetDepreciationAutoRecalculationResult = {
  companyCode: string;
  year: number;
  month: number;
  status: "recalculated" | "failed";
  message?: string;
};

const defaultDependencies: AssetDepreciationAutoRecalculationDependencies = {
  database: prisma,
  recalculate: recalculateFinanceAssetPeriod,
  log: (event) => console.log(JSON.stringify(event)),
};

function currentPeriodInTimeZone(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ASSET_DEPRECIATION_SCHEDULE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month) };
}

/** 重算所有未关账且不晚于当前月份的会计期间;单个期间失败不影响其他期间。 */
export async function runAssetDepreciationAutoRecalculation(
  now: Date,
  overrides: Partial<AssetDepreciationAutoRecalculationDependencies> = {},
): Promise<AssetDepreciationAutoRecalculationResult[]> {
  const dependencies = { ...defaultDependencies, ...overrides };
  const current = currentPeriodInTimeZone(now);
  const periods = await dependencies.database.financePeriod.findMany({
    where: {
      isClosed: false,
      OR: [
        { year: { lt: current.year } },
        { year: current.year, month: { lte: current.month } },
      ],
    },
    select: { companyCode: true, year: true, month: true },
    orderBy: [{ companyCode: "asc" }, { year: "asc" }, { month: "asc" }],
  });
  const results: AssetDepreciationAutoRecalculationResult[] = [];
  for (const period of periods) {
    try {
      await dependencies.recalculate(period);
      results.push({ ...period, status: "recalculated" });
    } catch (error) {
      results.push({ ...period, status: "failed", message: error instanceof Error ? error.message : String(error) });
    }
  }
  dependencies.log({
    event: "asset_depreciation_auto_recalculation",
    runAt: now.toISOString(),
    periods: results,
  });
  return results;
}
