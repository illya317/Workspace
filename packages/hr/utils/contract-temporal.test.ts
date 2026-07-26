import assert from "node:assert/strict";
import test from "node:test";

import { contractTemporalPosition } from "./contract-temporal";

test("contract periods expose scheduled, current, gap and ended states", () => {
  assert.equal(contractTemporalPosition({
    firstContractStartDate: "2026-08-01",
    firstContractEndDate: "2027-07-31",
  }, "2026-07-26"), "upcoming");
  assert.equal(contractTemporalPosition({
    firstContractStartDate: "2026-01-01",
    firstContractEndDate: "2026-12-31",
  }, "2026-07-26"), "current");
  assert.equal(contractTemporalPosition({
    firstContractStartDate: "2025-01-01",
    firstContractEndDate: "2025-12-31",
    secondContractStartDate: "2026-08-01",
    secondContractEndDate: "2027-07-31",
  }, "2026-07-26"), "upcoming");
  assert.equal(contractTemporalPosition({
    firstContractStartDate: "2025-01-01",
    firstContractEndDate: "2026-12-31",
    endDate: "2026-07-25",
  }, "2026-07-26"), "past");
});

test("permanent and invalid contract dates keep four-state semantics", () => {
  assert.equal(contractTemporalPosition({ permanentContractDate: "2026-08-01" }, "2026-07-26"), "upcoming");
  assert.equal(contractTemporalPosition({
    firstContractStartDate: "2026-09-01",
    firstContractEndDate: "2026-08-01",
  }, "2026-07-26"), "invalid");
  assert.equal(contractTemporalPosition({}, "invalid"), "invalid");
});
