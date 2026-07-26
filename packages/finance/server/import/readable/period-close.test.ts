import assert from "node:assert/strict";
import test from "node:test";

import {
  assertDeclaredT6AccountingClose,
  resolveSourcePeriodClosed,
  T6_PERIOD_CLOSE_DERIVATION_VERSION,
} from "./period-close";
import type { NormalizedPeriodStatus } from "./types";

function status(glMonthEnd: boolean | null, accountingClosed: boolean | null): NormalizedPeriodStatus {
  return {
    month: 6,
    sourceKey: "UFDATA_007_2026:6",
    glMonthEnd,
    accountingClosed,
    moduleStatuses: {},
  };
}

test("T6 period close follows the GL_mend general-ledger month-end flag", () => {
  assert.equal(resolveSourcePeriodClosed("T6", status(true, false)), true);
  assert.equal(resolveSourcePeriodClosed("T6", status(false, true)), false);
  assert.equal(T6_PERIOD_CLOSE_DERIVATION_VERSION, "t6-GL_mend-bflag-v2");
});

test("non-T6 sources retain their explicit accounting-close contract", () => {
  assert.equal(resolveSourcePeriodClosed("TPLUS", status(null, true)), true);
  assert.equal(resolveSourcePeriodClosed("TPLUS", undefined), null);
});

test("a closed T6 source package must agree with GL_mend.bflag at the cutoff month", () => {
  assert.doesNotThrow(() => assertDeclaredT6AccountingClose({
    year: 2026,
    cutoffDate: "2026-06-30",
    isAccountingClose: true,
    periodStatuses: [status(true, false)],
  }));
  assert.throws(() => assertDeclaredT6AccountingClose({
    year: 2026,
    cutoffDate: "2026-06-30",
    isAccountingClose: true,
    periodStatuses: [status(false, true)],
  }), /GL_mend\.bflag/);
});
