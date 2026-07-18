import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("period schedule matrix is removed from the mobile work surface", () => {
  const source = readFileSync(new URL("./WorkPeriodScheduleMatrix.tsx", import.meta.url), "utf8");

  assert.match(source, /key:\s*"work-period-schedule-matrix",\s*visibility:\s*"desktop"/);
});
