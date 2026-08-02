import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateSimpleMovingAverage,
  candlestickPriceRange,
  candlestickVolumeMax,
  normalizeCandlestickPoints,
} from "./VisualizationCandlestickMath";

test("calculates a simple moving average with an explicit warm-up window", () => {
  assert.deepEqual(calculateSimpleMovingAverage([10, 12, 14, 16], 3), [null, null, 12, 14]);
  assert.deepEqual(calculateSimpleMovingAverage([10, 12], 0), [null, null]);
});

test("normalizes candlestick bounds and rejects non-finite prices", () => {
  const points = normalizeCandlestickPoints([
    { key: "a", label: "07-29", open: 10, high: 9, low: 11, close: 12, volume: 25 },
    { key: "b", label: "07-30", open: Number.NaN, high: 13, low: 11, close: 12, volume: 30 },
  ]);
  assert.deepEqual(points, [{ key: "a", label: "07-29", open: 10, high: 12, low: 9, close: 12, volume: 25 }]);
  assert.equal(candlestickVolumeMax(points), 25);
  const range = candlestickPriceRange(points);
  assert.ok(range.min < 9);
  assert.ok(range.max > 12);
});
