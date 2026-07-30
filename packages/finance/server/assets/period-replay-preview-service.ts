import { createHash } from "node:crypto";
import type { FinanceAssetKind } from "../../types/assets";
import { calculateFinanceAssetPeriod } from "./calculator";
import { moneyEquals, moneyToCents } from "./money-cents";
import type {
  FinanceAssetPeriodReplayPreviewCommand,
  FinanceAssetPeriodReplayPreviewRowInput,
} from "./period-replay-preview-validation";

const CALCULATION_VERSION = "asset-period-opening-replay-preview-v1";
const ASSET_KINDS: FinanceAssetKind[] = ["fixed_asset", "intangible", "prepaid", "long_term_deferred"];

type ReplayBlocker = {
  code: string;
  field: string;
  message: string;
};

type ReplayCalculation = {
  rule: "straight_line" | "fully_depreciated_to_residual" | "legacy_fully_depreciated" | "explicit_non_amortization";
  depreciationStartDate: string | null;
  depreciationStartDateRule: "provided" | "fixed_asset_first_day_next_month_after_acquisition" | "not_required";
  residualValue: number;
  depreciableAmount: number;
  openingNetBookValue: number;
  monthlyAmount: number;
  periodAmount: number;
  closingAccumulatedAmount: number;
  closingImpairmentAmount: number;
  closingNetBookValue: number;
  active: boolean;
};

export type FinanceAssetPeriodReplayPreviewRow = {
  sourceKey: string;
  assetKind: FinanceAssetKind;
  status: "ready" | "blocked";
  result: ReplayCalculation | null;
  blockers: ReplayBlocker[];
  controls: {
    sourcePeriodAmount: number;
    calculatedPeriodAmount: number | null;
    periodAmountDifference: number | null;
    periodAmountMatches: boolean | null;
    sourceClosingNet: number;
    calculatedClosingNet: number | null;
    closingNetDifference: number | null;
    closingNetMatches: boolean | null;
  };
};

type DifferenceSummary = {
  comparableRows: number;
  matchedRows: number;
  differenceRows: number;
  calculatedTotal: number;
  sourceControlTotal: number;
  differenceTotal: number;
  absoluteDifferenceTotal: number;
};

type KindTotals = {
  assetKind: FinanceAssetKind;
  rowCount: number;
  readyRowCount: number;
  blockerRowCount: number;
  originalCost: number;
  openingAccumulatedAmount: number;
  openingImpairmentAmount: number;
  openingNetBookValue: number;
  calculatedPeriodAmount: number;
  calculatedClosingAccumulatedAmount: number;
  calculatedClosingNetBookValue: number;
  sourcePeriodAmountControl: number;
  sourceClosingNetControl: number;
  comparableSourcePeriodAmountControl: number;
  comparableSourceClosingNetControl: number;
  periodAmountDifference: number;
  closingNetDifference: number;
};

export type FinanceAssetPeriodReplayPreview = {
  scope: { companyCode: string; year: number; month: number; openingAsOfDate: string };
  calculationVersion: typeof CALCULATION_VERSION;
  fingerprint: string;
  rows: FinanceAssetPeriodReplayPreviewRow[];
  totalsByKind: KindTotals[];
  diffSummary: {
    rowCount: number;
    readyRowCount: number;
    blockerRowCount: number;
    periodAmount: DifferenceSummary;
    closingNet: DifferenceSummary;
  };
};

export function previewFinanceAssetPeriodReplay(
  command: FinanceAssetPeriodReplayPreviewCommand,
): FinanceAssetPeriodReplayPreview {
  const expectedOpeningDate = priorMonthEnd(command.year, command.month);
  const duplicateKeys = duplicateSourceKeys(command.rows);
  const rows = command.rows.map((row) => previewRow(command, row, expectedOpeningDate, duplicateKeys));
  const totalsByKind = buildKindTotals(command.rows, rows);
  const diffSummary = buildDiffSummary(rows);
  const fingerprintPayload = {
    calculationVersion: CALCULATION_VERSION,
    scope: { companyCode: command.companyCode, year: command.year, month: command.month, openingAsOfDate: expectedOpeningDate },
    rows: rows.map((result, index) => ({ input: canonicalInput(command.rows[index]!), output: result }))
      .sort(compareCanonicalJson),
    totalsByKind,
    diffSummary,
  };
  return {
    scope: { companyCode: command.companyCode, year: command.year, month: command.month, openingAsOfDate: expectedOpeningDate },
    calculationVersion: CALCULATION_VERSION,
    fingerprint: createHash("sha256").update(JSON.stringify(fingerprintPayload)).digest("hex"),
    rows,
    totalsByKind,
    diffSummary,
  };
}

function previewRow(
  command: FinanceAssetPeriodReplayPreviewCommand,
  row: FinanceAssetPeriodReplayPreviewCommand["rows"][number],
  expectedOpeningDate: string,
  duplicateKeys: ReadonlySet<string>,
): FinanceAssetPeriodReplayPreviewRow {
  const blockers: ReplayBlocker[] = [];
  const block = (code: string, field: string, message: string) => blockers.push({ code, field, message });
  if (duplicateKeys.has(row.sourceKey)) block("duplicate_source_key", "sourceKey", "来源键在本次预览中重复");
  if (!isActualIsoDate(row.openingAsOfDate)) block("invalid_opening_date", "openingAsOfDate", "期初截止日期不是有效日期");
  else if (row.openingAsOfDate !== expectedOpeningDate) {
    block("opening_date_not_prior_month_end", "openingAsOfDate", `期初截止日期必须为目标期间上月末 ${expectedOpeningDate}`);
  }
  if (!isActualIsoDate(row.acquisitionDate)) {
    block("invalid_acquisition_date", "acquisitionDate", "取得日期不是有效日期");
  }
  if (row.depreciationStartDate && !isActualIsoDate(row.depreciationStartDate)) {
    block("invalid_depreciation_start_date", "depreciationStartDate", "折旧摊销起算日期不是有效日期");
  }

  const originalCost = money(row.originalCost);
  const openingAccumulated = money(row.openingAccumulatedAmount);
  const openingImpairment = money(row.openingImpairmentAmount);
  const openingNet = money(originalCost - openingAccumulated - openingImpairment);
  const depreciableAmount = money(Math.max(0, originalCost * (1 - row.residualRate) - openingImpairment));
  const residualValue = money(originalCost - openingImpairment - depreciableAmount);
  if (openingNet < 0) block("negative_opening_net", "openingAccumulatedAmount", "期初累计金额与减值超过资产原值");
  const accumulatedDifferenceCents = moneyToCents(openingAccumulated) - moneyToCents(depreciableAmount);
  const legacyFullyDepreciated = moneyEquals(openingNet, 0) && accumulatedDifferenceCents > 0;
  if (accumulatedDifferenceCents > 1 && !legacyFullyDepreciated) {
    block("opening_net_below_residual", "openingAccumulatedAmount", "期初净值已低于生产算法计算的剩余残值");
  }

  const alreadyAtResidual = Math.abs(accumulatedDifferenceCents) <= 1;
  const explicitNonAmortization = row.usefulLifeMonths == null && Boolean(row.nonAmortizationReason);
  let rule: ReplayCalculation["rule"] = "straight_line";
  if (legacyFullyDepreciated) rule = "legacy_fully_depreciated";
  else if (alreadyAtResidual) rule = "fully_depreciated_to_residual";
  else if (explicitNonAmortization) rule = "explicit_non_amortization";
  else if (row.usefulLifeMonths == null) {
    block("useful_life_required", "usefulLifeMonths", "仍有可折旧摊销净值时必须提供使用期限或明确不摊销依据");
  }

  let startDate: string | null = null;
  let startRule: ReplayCalculation["depreciationStartDateRule"] = "not_required";
  if (row.depreciationStartDate && isActualIsoDate(row.depreciationStartDate)) {
    startDate = row.depreciationStartDate;
    startRule = "provided";
  } else if (row.assetKind === "fixed_asset" && isActualIsoDate(row.acquisitionDate)) {
    startDate = firstDayOfMonthAfter(row.acquisitionDate);
    startRule = "fixed_asset_first_day_next_month_after_acquisition";
  } else if (rule === "straight_line") {
    if (row.assetKind !== "fixed_asset") {
      block("depreciation_start_date_required", "depreciationStartDate", "非固定资产必须提供明确的折旧摊销起算日期");
    }
  }

  let result: ReplayCalculation | null = null;
  if (blockers.length === 0) {
    if (rule !== "straight_line") {
      result = {
        rule,
        depreciationStartDate: startDate,
        depreciationStartDateRule: startRule,
        residualValue,
        depreciableAmount,
        openingNetBookValue: openingNet,
        monthlyAmount: 0,
        periodAmount: 0,
        closingAccumulatedAmount: openingAccumulated,
        closingImpairmentAmount: openingImpairment,
        closingNetBookValue: openingNet,
        active: false,
      };
    } else {
      try {
        const calculated = calculateFinanceAssetPeriod({
          originalCost,
          residualRate: row.residualRate,
          usefulLifeMonths: row.usefulLifeMonths!,
          accumulatedBefore: openingAccumulated,
          impairmentBefore: openingImpairment,
          depreciationStartDate: startDate!,
          year: command.year,
          month: command.month,
          assetKind: row.assetKind,
          disposalDate: null,
        });
        result = {
          rule,
          depreciationStartDate: startDate,
          depreciationStartDateRule: startRule,
          residualValue,
          depreciableAmount: money(calculated.depreciableAmount),
          openingNetBookValue: openingNet,
          monthlyAmount: money(calculated.monthlyAmount),
          periodAmount: money(calculated.periodAmount),
          closingAccumulatedAmount: money(calculated.accumulatedAfter),
          closingImpairmentAmount: openingImpairment,
          closingNetBookValue: money(calculated.netBookValue),
          active: calculated.active,
        };
      } catch (error) {
        block("calculation_failed", "rows", error instanceof Error ? error.message : "资产期间计算失败");
      }
    }
  }

  const controls = compareControls(row, result);
  return { sourceKey: row.sourceKey, assetKind: row.assetKind, status: blockers.length ? "blocked" : "ready", result, blockers, controls };
}

function compareControls(row: FinanceAssetPeriodReplayPreviewRowInput, result: ReplayCalculation | null) {
  const sourcePeriodAmount = money(row.sourcePeriodAmountControl);
  const sourceClosingNet = money(row.sourceClosingNetControl);
  if (!result) return {
    sourcePeriodAmount,
    calculatedPeriodAmount: null,
    periodAmountDifference: null,
    periodAmountMatches: null,
    sourceClosingNet,
    calculatedClosingNet: null,
    closingNetDifference: null,
    closingNetMatches: null,
  };
  return {
    sourcePeriodAmount,
    calculatedPeriodAmount: result.periodAmount,
    periodAmountDifference: money(result.periodAmount - sourcePeriodAmount),
    periodAmountMatches: moneyEquals(result.periodAmount, sourcePeriodAmount),
    sourceClosingNet,
    calculatedClosingNet: result.closingNetBookValue,
    closingNetDifference: money(result.closingNetBookValue - sourceClosingNet),
    closingNetMatches: moneyEquals(result.closingNetBookValue, sourceClosingNet),
  };
}

function buildKindTotals(
  inputs: FinanceAssetPeriodReplayPreviewCommand["rows"],
  outputs: FinanceAssetPeriodReplayPreviewRow[],
) {
  return ASSET_KINDS.map((assetKind): KindTotals => {
    const indexes = inputs.flatMap((row, index) => row.assetKind === assetKind ? [index] : []);
    const ready = indexes.filter((index) => outputs[index]?.status === "ready");
    return {
      assetKind,
      rowCount: indexes.length,
      readyRowCount: ready.length,
      blockerRowCount: indexes.length - ready.length,
      originalCost: sumMoney(indexes.map((index) => inputs[index]!.originalCost)),
      openingAccumulatedAmount: sumMoney(indexes.map((index) => inputs[index]!.openingAccumulatedAmount)),
      openingImpairmentAmount: sumMoney(indexes.map((index) => inputs[index]!.openingImpairmentAmount)),
      openingNetBookValue: sumMoney(indexes.map((index) => inputs[index]!.originalCost - inputs[index]!.openingAccumulatedAmount - inputs[index]!.openingImpairmentAmount)),
      calculatedPeriodAmount: sumMoney(ready.map((index) => outputs[index]!.result!.periodAmount)),
      calculatedClosingAccumulatedAmount: sumMoney(ready.map((index) => outputs[index]!.result!.closingAccumulatedAmount)),
      calculatedClosingNetBookValue: sumMoney(ready.map((index) => outputs[index]!.result!.closingNetBookValue)),
      sourcePeriodAmountControl: sumMoney(indexes.map((index) => outputs[index]!.controls.sourcePeriodAmount)),
      sourceClosingNetControl: sumMoney(indexes.map((index) => outputs[index]!.controls.sourceClosingNet)),
      comparableSourcePeriodAmountControl: sumMoney(ready.map((index) => outputs[index]!.controls.sourcePeriodAmount)),
      comparableSourceClosingNetControl: sumMoney(ready.map((index) => outputs[index]!.controls.sourceClosingNet)),
      periodAmountDifference: sumMoney(ready.map((index) => outputs[index]!.controls.periodAmountDifference!)),
      closingNetDifference: sumMoney(ready.map((index) => outputs[index]!.controls.closingNetDifference!)),
    };
  });
}

function buildDiffSummary(rows: FinanceAssetPeriodReplayPreviewRow[]) {
  const ready = rows.filter((row) => row.status === "ready");
  return {
    rowCount: rows.length,
    readyRowCount: ready.length,
    blockerRowCount: rows.length - ready.length,
    periodAmount: differenceSummary(ready, "period"),
    closingNet: differenceSummary(ready, "closing"),
  };
}

function differenceSummary(rows: FinanceAssetPeriodReplayPreviewRow[], kind: "period" | "closing"): DifferenceSummary {
  const calculated = rows.map((row) => kind === "period" ? row.controls.calculatedPeriodAmount! : row.controls.calculatedClosingNet!);
  const source = rows.map((row) => kind === "period" ? row.controls.sourcePeriodAmount : row.controls.sourceClosingNet);
  const differences = rows.map((row) => kind === "period" ? row.controls.periodAmountDifference! : row.controls.closingNetDifference!);
  const matches = rows.map((row) => kind === "period" ? row.controls.periodAmountMatches : row.controls.closingNetMatches);
  return {
    comparableRows: rows.length,
    matchedRows: matches.filter(Boolean).length,
    differenceRows: matches.filter((value) => value === false).length,
    calculatedTotal: sumMoney(calculated),
    sourceControlTotal: sumMoney(source),
    differenceTotal: sumMoney(differences),
    absoluteDifferenceTotal: sumMoney(differences.map(Math.abs)),
  };
}

function duplicateSourceKeys(rows: FinanceAssetPeriodReplayPreviewCommand["rows"]) {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.sourceKey, (counts.get(row.sourceKey) ?? 0) + 1);
  return new Set([...counts].filter(([, count]) => count > 1).map(([sourceKey]) => sourceKey));
}

function compareCanonicalJson(left: unknown, right: unknown) {
  const leftJson = JSON.stringify(left);
  const rightJson = JSON.stringify(right);
  if (leftJson < rightJson) return -1;
  if (leftJson > rightJson) return 1;
  return 0;
}

function canonicalInput(row: FinanceAssetPeriodReplayPreviewCommand["rows"][number]) {
  return {
    sourceKey: row.sourceKey,
    assetKind: row.assetKind,
    originalCost: money(row.originalCost),
    residualRate: row.residualRate,
    usefulLifeMonths: row.usefulLifeMonths,
    acquisitionDate: row.acquisitionDate,
    depreciationStartDate: row.depreciationStartDate,
    openingAccumulatedAmount: money(row.openingAccumulatedAmount),
    openingImpairmentAmount: money(row.openingImpairmentAmount),
    openingAsOfDate: row.openingAsOfDate,
    nonAmortizationReason: row.nonAmortizationReason,
    sourcePeriodAmountControl: money(row.sourcePeriodAmountControl),
    sourceClosingNetControl: money(row.sourceClosingNetControl),
  };
}

function priorMonthEnd(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10);
}

function firstDayOfMonthAfter(date: string) {
  const [year, month] = date.split("-").map(Number);
  return new Date(Date.UTC(year!, month!, 1)).toISOString().slice(0, 10);
}

function isActualIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const normalized = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).toISOString().slice(0, 10);
  return normalized === value;
}

function money(value: unknown) {
  return moneyToCents(value) / 100;
}

function sumMoney(values: number[]) {
  return values.reduce((sum, value) => sum + moneyToCents(value), 0) / 100;
}
