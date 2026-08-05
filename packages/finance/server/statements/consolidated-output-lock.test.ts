import assert from "node:assert/strict";
import test from "node:test";

import type { ConsolidatedReportOutputPackage } from "@workspace/finance/types";

import { validateNciWorkpaperForLock } from "./consolidated-output-service";

function report(status: "reconciled" | "difference", crossCheckStatus: "reconciled" | "difference") {
  return {
    nciEquityWorkpaper: {
      status,
      crossCheckStatus,
      rollforwardDifference: status === "difference" ? 10 : 0,
      crossCheckDifference: crossCheckStatus === "difference" ? 10 : 0,
    },
  } as ConsolidatedReportOutputPackage;
}

test("lock gate rejects an NCI rollforward difference", () => {
  const invalid = validateNciWorkpaperForLock(report("difference", "reconciled"));
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.issue.field, "nciEquityWorkpaper");
});

test("lock gate keeps the net-assets cross-check independent", () => {
  assert.equal(validateNciWorkpaperForLock(report("reconciled", "difference")).ok, true);
});
