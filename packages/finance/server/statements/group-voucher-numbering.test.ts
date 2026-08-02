import assert from "node:assert/strict";
import test from "node:test";

import {
  groupVoucherNumber,
  isGroupVoucherNumber,
  nextGroupVoucherSequence,
} from "./group-voucher-numbering";

test("group voucher numbers follow the normal period-type-sequence format", () => {
  assert.equal(groupVoucherNumber(2026, 6, 1), "2026-06-合-0001");
  assert.equal(groupVoucherNumber(2026, 12, 23), "2026-12-合-0023");
});

test("group voucher sequence continues only within the same accounting month", () => {
  assert.equal(nextGroupVoucherSequence([
    "2026-05-合-0019",
    "2026-06-合-0002",
    "2026-06-合-0011",
    "AUTO-INV-OLD",
  ], 2026, 6), 12);
});

test("legacy generated identifiers are not accepted as group voucher numbers", () => {
  assert.equal(isGroupVoucherNumber("2026-06-合-0001"), true);
  assert.equal(isGroupVoucherNumber("AUTO-INV-ABC"), false);
  assert.equal(isGroupVoucherNumber("GJ-2018-OPENING-CAPITAL"), false);
});
