import assert from "node:assert/strict";
import test from "node:test";

import {
  consolidationPeriodRateRequirements,
} from "./consolidation-period-rates";

test("requires monthly averages through the selected month and closing rates for balance and cash points", () => {
  assert.deepEqual(consolidationPeriodRateRequirements(2026, 6), {
    closing: {
      current: ["2025-12-31", "2026-05-31", "2026-06-30"],
      comparative: ["2024-12-31", "2025-05-31", "2025-06-30"],
    },
    monthlyAverage: {
      current: [
        "2026-01-31",
        "2026-02-28",
        "2026-03-31",
        "2026-04-30",
        "2026-05-31",
        "2026-06-30",
      ],
      comparative: [
        "2025-01-31",
        "2025-02-28",
        "2025-03-31",
        "2025-04-30",
        "2025-05-31",
        "2025-06-30",
      ],
    },
  });
});

test("deduplicates the prior year end when January is selected", () => {
  assert.deepEqual(consolidationPeriodRateRequirements(2026, 1).closing.current, [
    "2025-12-31",
    "2026-01-31",
  ]);
});
