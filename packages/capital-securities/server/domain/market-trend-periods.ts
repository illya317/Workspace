import type {
  MarketTrendPeriod,
  MarketTrendPoint,
  MarketTrendSeries,
} from "../../types/market-intelligence";

const PERIOD_POINT_LIMITS: Record<Exclude<MarketTrendPeriod, "day">, number> = {
  week: 156,
  month: 60,
  quarter: 40,
  year: 10,
};

export function emptyMarketTrendSeries(): MarketTrendSeries {
  return { day: [], week: [], month: [], quarter: [], year: [] };
}

export function createMarketTrendSeries(points: readonly MarketTrendPoint[]): MarketTrendSeries {
  const daily = [...points].sort((left, right) => left.date.localeCompare(right.date));
  if (daily.length === 0) return emptyMarketTrendSeries();
  return {
    day: withinYears(daily, 1),
    week: withinYears(aggregateMarketTrend(daily, "week"), 3).slice(-PERIOD_POINT_LIMITS.week),
    month: withinYears(aggregateMarketTrend(daily, "month"), 5).slice(-PERIOD_POINT_LIMITS.month),
    quarter: withinYears(aggregateMarketTrend(daily, "quarter"), 10).slice(-PERIOD_POINT_LIMITS.quarter),
    year: withinYears(aggregateMarketTrend(daily, "year"), 10).slice(-PERIOD_POINT_LIMITS.year),
  };
}

export function aggregateMarketTrend(
  points: readonly MarketTrendPoint[],
  period: Exclude<MarketTrendPeriod, "day">,
): MarketTrendPoint[] {
  const groups = new Map<string, MarketTrendPoint[]>();
  for (const point of [...points].sort((left, right) => left.date.localeCompare(right.date))) {
    const key = periodKey(point.date, period);
    groups.set(key, [...(groups.get(key) ?? []), point]);
  }
  const aggregated = [...groups.values()].map((group): MarketTrendPoint => {
    const first = group[0]!;
    const last = group.at(-1)!;
    const highs = group.flatMap((point) => point.high === null ? [] : [point.high]);
    const lows = group.flatMap((point) => point.low === null ? [] : [point.low]);
    const volumes = group.flatMap((point) => point.volume === null ? [] : [point.volume]);
    return {
      date: last.date,
      open: first.open,
      high: highs.length ? Math.max(...highs) : null,
      low: lows.length ? Math.min(...lows) : null,
      close: last.close,
      changePercent: null,
      volume: volumes.length ? volumes.reduce((sum, value) => sum + value, 0) : null,
    };
  });
  return aggregated.map((point, index) => ({
    ...point,
    changePercent: index === 0 || aggregated[index - 1]!.close === 0
      ? null
      : (point.close - aggregated[index - 1]!.close) / aggregated[index - 1]!.close * 100,
  }));
}

function withinYears(points: readonly MarketTrendPoint[], years: number) {
  const last = points.at(-1);
  if (!last) return [];
  const cutoff = new Date(`${last.date}T00:00:00Z`);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years);
  const cutoffText = cutoff.toISOString().slice(0, 10);
  return points.filter((point) => point.date >= cutoffText);
}

function periodKey(dateText: string, period: Exclude<MarketTrendPeriod, "day">) {
  if (period === "month") return dateText.slice(0, 7);
  if (period === "quarter") {
    const month = Number(dateText.slice(5, 7));
    return `${dateText.slice(0, 4)}-Q${Math.ceil(month / 3)}`;
  }
  if (period === "year") return dateText.slice(0, 4);
  const date = new Date(`${dateText}T00:00:00Z`);
  const dayFromMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayFromMonday);
  return date.toISOString().slice(0, 10);
}
