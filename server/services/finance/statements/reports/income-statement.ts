import { NextResponse } from "next/server";
import type { ReportPeriod, BalanceItem } from "../report-helpers";
import { yearlyCurrentLeaf } from "../report-helpers";
import { INCOME_STATEMENT_LINES, type IncomeLineConfig } from "../config/income-statement-lines";

// ─── Helpers ───────────────────────────────────────────────

function pickPrefixes(line: IncomeLineConfig, isCanada: boolean): string[] {
  return isCanada ? (line.canPrefixes || []) : (line.chnPrefixes || []);
}

function computeLineAmount(
  line: IncomeLineConfig,
  yearBalances: BalanceItem[],
  isCanada: boolean,
  accumulatedProfit: number,
): { amount: number; newAccumulated: number } {
  // Totals are computed from accumulated profit
  if (line.isTotal || line.isGrandTotal) {
    return { amount: +accumulatedProfit.toFixed(2), newAccumulated: accumulatedProfit };
  }

  const prefixes = pickPrefixes(line, isCanada);
  if (prefixes.length === 0) {
    return { amount: 0, newAccumulated: accumulatedProfit };
  }

  const raw = yearlyCurrentLeaf(yearBalances, prefixes, line.direction);
  const amount = +raw.toFixed(2);
  const delta = line.subtract ? -amount : amount;
  return { amount, newAccumulated: accumulatedProfit + delta };
}

// ─── Main generator ────────────────────────────────────────

export function generateIncomeStatement(
  period: ReportPeriod,
  yearBalances: BalanceItem[],
  isCanada: boolean,
) {
  let accumulated = 0; // running profit (revenue - expenses + other)
  const lines: { label: string; amount: number; isTotal?: boolean; isGrandTotal?: boolean }[] = [];

  for (const line of INCOME_STATEMENT_LINES) {
    const { amount, newAccumulated } = computeLineAmount(line, yearBalances, isCanada, accumulated);
    accumulated = newAccumulated;
    lines.push({
      label: line.label,
      amount,
      ...(line.isTotal ? { isTotal: true as const } : {}),
      ...(line.isGrandTotal ? { isGrandTotal: true as const } : {}),
    });
  }

  return NextResponse.json({ type: "income", period, lines });
}
