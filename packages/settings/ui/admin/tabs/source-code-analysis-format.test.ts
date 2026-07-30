import assert from "node:assert/strict";
import test from "node:test";

import {
  balanceCodeVolumeMatrix,
  formatBalancedCodeVolumeInTenThousands,
  formatCodeVolumeInTenThousands,
} from "./source-code-analysis-format";

test("source code volumes share one ten-thousand-line display scale", () => {
  assert.equal(formatCodeVolumeInTenThousands(0), "—");
  assert.equal(formatCodeVolumeInTenThousands(1), "<0.1");
  assert.equal(formatCodeVolumeInTenThousands(999), "<0.1");
  assert.equal(formatCodeVolumeInTenThousands(1_000), "0.10");
  assert.equal(formatCodeVolumeInTenThousands(1_200), "0.12");
  assert.equal(formatCodeVolumeInTenThousands(11_200), "1.12");
  assert.equal(formatCodeVolumeInTenThousands(52_300), "5.23");
});

test("balanced code-volume rounding preserves visible row and column totals", () => {
  const source = [
    [16_795, 6_451, 7_056, 16_099, 5_502],
    [55, 55, 55, 55, 55],
  ];
  const balanced = balanceCodeVolumeMatrix(source);
  const rowTotals = balanced.map((row) => row.reduce((sum, value) => sum + value, 0));
  const columnTotals = balanced[0].map((_, columnIndex) =>
    balanced.reduce((sum, row) => sum + row[columnIndex], 0));

  assert.equal(rowTotals.reduce((sum, value) => sum + value, 0), 52_200);
  assert.equal(columnTotals.reduce((sum, value) => sum + value, 0), 52_200);
  assert.deepEqual(rowTotals, [51_900, 300]);
  assert.equal(formatBalancedCodeVolumeInTenThousands(0, 55), "<0.1");
  assert.equal(formatBalancedCodeVolumeInTenThousands(0, 0), "—");
});
