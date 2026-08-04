import type {
  ConsolidatedOutputLine,
  ConsolidatedOutputRateBasis,
  ConsolidatedOutputTranslationPeriodTrace,
  StatementReportType,
} from "@workspace/finance/types";

export type TranslationTracePolicy = {
  currency: "CNY";
} | {
  currency: "CAD";
  entitySnapshotId: number;
  entityLabel: string;
  closingRate: number;
  comparativeClosingRate: number | null;
  historicalCapitalRates: Record<"current" | "comparative", Record<string, number | null>>;
  flowRates: Record<"current" | "comparative", Map<string, number>>;
  cashPointRates: Record<"current" | "comparative", Map<string, number>>;
};

interface TranslationSourceLine {
  amount: number;
  currentMonthAmount?: number;
  previousAmount: number;
}

function monthEndDate(year: number, month: number) {
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthOpeningDate(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10);
}

function tracePeriod(
  sourceAmount: number,
  translatedAmount: number,
  basis: ConsolidatedOutputRateBasis,
  rate: number | null,
): ConsolidatedOutputTranslationPeriodTrace {
  return { sourceAmount, translatedAmount, basis, rate };
}

export function attachTranslationTraces(input: {
  year: number;
  month: number;
  policy: TranslationTracePolicy;
  reportType: StatementReportType;
  sourceByCode: ReadonlyMap<string, TranslationSourceLine>;
  lines: ConsolidatedOutputLine[];
  hasRetainedEarningsOpening: boolean;
}) {
  const currentMonthEnd = monthEndDate(input.year, input.month);
  return input.lines.map((line) => {
    const source = input.sourceByCode.get(line.lineCode);
    if (!source) return line;
    if (input.policy.currency === "CNY") {
      return {
        ...line,
        translationTrace: {
          sourceCurrency: "CNY",
          presentationCurrency: "CNY",
          current: tracePeriod(source.amount, line.amount, "identity", 1),
          ...(source.currentMonthAmount === undefined || line.currentMonthAmount === undefined ? {} : {
            currentMonth: tracePeriod(source.currentMonthAmount, line.currentMonthAmount, "identity", 1),
          }),
          comparative: tracePeriod(source.previousAmount, line.previousAmount, "identity", 1),
        },
      };
    }

    const aggregate = line.isHeader || line.isTotal || line.isGrandTotal;
    let currentBasis: ConsolidatedOutputRateBasis = "closing";
    let currentRate: number | null = input.policy.closingRate;
    let comparativeBasis: ConsolidatedOutputRateBasis = "closing";
    let comparativeRate: number | null = input.policy.comparativeClosingRate;
    let currentMonthBasis: ConsolidatedOutputRateBasis = currentBasis;
    let currentMonthRate: number | null = currentRate;
    if (aggregate) {
      currentBasis = comparativeBasis = currentMonthBasis = "aggregate";
      currentRate = comparativeRate = currentMonthRate = null;
    } else if (input.reportType === "balanceSheet") {
      if (line.lineCode === "otherComprehensiveIncome") {
        currentBasis = comparativeBasis = currentMonthBasis = "balancing";
        currentRate = comparativeRate = currentMonthRate = null;
      } else if (line.lineCode === "undistributedProfit" && input.hasRetainedEarningsOpening) {
        currentBasis = comparativeBasis = currentMonthBasis = "rolling";
        currentRate = comparativeRate = currentMonthRate = null;
      } else if (["paidInCapital", "otherEquityInstruments", "capitalReserve", "treasuryStock"].includes(line.lineCode)) {
        currentBasis = comparativeBasis = currentMonthBasis = "historical";
        currentRate = input.policy.historicalCapitalRates.current[line.lineCode] ?? null;
        comparativeRate = input.policy.historicalCapitalRates.comparative[line.lineCode] ?? null;
        currentMonthRate = currentRate;
      }
    } else if (input.reportType === "cashFlow" && line.lineCode === "fxEffect") {
      currentBasis = comparativeBasis = currentMonthBasis = "balancing";
      currentRate = comparativeRate = currentMonthRate = null;
    } else if (input.reportType === "cashFlow" && line.lineCode === "openingCash") {
      currentBasis = comparativeBasis = currentMonthBasis = "cashPoint";
      currentRate = input.policy.cashPointRates.current.get(`${input.year - 1}-12-31`) ?? null;
      comparativeRate = input.policy.cashPointRates.comparative.get(`${input.year - 2}-12-31`) ?? null;
      currentMonthRate = input.policy.cashPointRates.current.get(monthOpeningDate(input.year, input.month)) ?? null;
    } else if (input.reportType === "cashFlow" && line.lineCode === "endingCash") {
      currentBasis = comparativeBasis = currentMonthBasis = "closing";
    } else {
      currentBasis = comparativeBasis = "monthlyAverageMultiple";
      currentRate = comparativeRate = null;
      currentMonthBasis = "monthlyAverage";
      currentMonthRate = input.policy.flowRates.current.get(currentMonthEnd) ?? null;
    }

    return {
      ...line,
      translationTrace: {
        sourceCurrency: "CAD",
        presentationCurrency: "CNY",
        current: tracePeriod(source.amount, line.amount, currentBasis, currentRate),
        ...(source.currentMonthAmount === undefined || line.currentMonthAmount === undefined ? {} : {
          currentMonth: tracePeriod(source.currentMonthAmount, line.currentMonthAmount, currentMonthBasis, currentMonthRate),
        }),
        comparative: tracePeriod(source.previousAmount, line.previousAmount, comparativeBasis, comparativeRate),
      },
    };
  });
}
