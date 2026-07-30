import type { VisualizationCandlestickPointSpec } from "../../VisualizationSurfaceTypes";

export type NormalizedCandlestickPoint = VisualizationCandlestickPointSpec & {
  volume: number | null;
};

export function normalizeCandlestickPoints(
  points: readonly VisualizationCandlestickPointSpec[],
): NormalizedCandlestickPoint[] {
  return points.flatMap((point): NormalizedCandlestickPoint[] => {
    const prices = [point.open, point.high, point.low, point.close];
    if (prices.some((value) => !Number.isFinite(value))) return [];
    return [{
      ...point,
      high: Math.max(...prices),
      low: Math.min(...prices),
      volume: point.volume !== null && point.volume !== undefined && Number.isFinite(point.volume) && point.volume >= 0
        ? point.volume
        : null,
    }];
  });
}

export function calculateSimpleMovingAverage(values: readonly number[], period: number): Array<number | null> {
  if (!Number.isInteger(period) || period <= 0) return values.map(() => null);
  let rollingTotal = 0;
  return values.map((value, index) => {
    rollingTotal += value;
    if (index >= period) rollingTotal -= values[index - period]!;
    return index + 1 >= period ? rollingTotal / period : null;
  });
}

export function candlestickPriceRange(points: readonly NormalizedCandlestickPoint[]) {
  const low = Math.min(...points.map((point) => point.low));
  const high = Math.max(...points.map((point) => point.high));
  const rawRange = Math.max(high - low, Math.abs(high) * 0.01, 1e-6);
  const padding = rawRange * 0.06;
  return { min: low - padding, max: high + padding };
}

export function candlestickVolumeMax(points: readonly NormalizedCandlestickPoint[]) {
  return Math.max(...points.map((point) => point.volume ?? 0), 1);
}
