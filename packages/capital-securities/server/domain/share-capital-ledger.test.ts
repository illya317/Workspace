import assert from "node:assert/strict";
import test from "node:test";

import {
  projectShareCapitalLedger,
  shareRatioFromRegisteredCapital,
  ShareCapitalProjectionError,
  type ShareCapitalEventState,
} from "./share-capital-ledger";

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

function event(
  input: Omit<ShareCapitalEventState, "id" | "effectiveDate"> & { effectiveDate: string },
): ShareCapitalEventState {
  return { ...input, id: input.sequence, effectiveDate: date(input.effectiveDate) };
}

test("registered-capital transactions derive the confirmed captable", () => {
  const result = projectShareCapitalLedger([
    event({ sequence: 1, eventType: "incorporation", effectiveDate: "2016-09-07", recordStatus: "confirmed", transactions: [
      { id: 1, sequence: 1, fromPartyId: null, toPartyId: 10, registeredCapitalAmountYuan: 100_000_000 },
    ] }),
    event({ sequence: 2, eventType: "capital_reduction", effectiveDate: "2017-10-24", recordStatus: "confirmed", transactions: [
      { id: 2, sequence: 1, fromPartyId: 10, toPartyId: null, registeredCapitalAmountYuan: 20_000_000 },
    ] }),
    event({ sequence: 3, eventType: "capital_increase", effectiveDate: "2018-01-17", recordStatus: "confirmed", transactions: [
      { id: 3, sequence: 1, fromPartyId: null, toPartyId: 20, registeredCapitalAmountYuan: 8_000_000 },
      { id: 4, sequence: 2, fromPartyId: null, toPartyId: 30, registeredCapitalAmountYuan: 10_000_000 },
    ] }),
    event({ sequence: 4, eventType: "transfer", effectiveDate: "2022-06-27", recordStatus: "confirmed", transactions: [
      { id: 5, sequence: 1, fromPartyId: 10, toPartyId: 40, registeredCapitalAmountYuan: 18_000_000 },
    ] }),
  ], date("2026-01-01"));

  assert.equal(result.totalRegisteredCapitalYuan, 98_000_000);
  assert.equal(result.confirmedBalances.get(10), 62_000_000);
  assert.equal(result.confirmedBalances.get(20), 8_000_000);
  assert.equal(result.confirmedBalances.get(30), 10_000_000);
  assert.equal(result.confirmedBalances.get(40), 18_000_000);
  assert.equal(shareRatioFromRegisteredCapital(62_000_000, result.totalRegisteredCapitalYuan), 62 / 98);
});

test("pending transfer remains visible without changing the confirmed captable", () => {
  const result = projectShareCapitalLedger([
    event({ sequence: 1, eventType: "incorporation", effectiveDate: "2024-01-01", recordStatus: "confirmed", transactions: [
      { id: 1, sequence: 1, fromPartyId: null, toPartyId: 10, registeredCapitalAmountYuan: 100 },
    ] }),
    event({ sequence: 2, eventType: "transfer", effectiveDate: "2024-07-01", recordStatus: "pending", transactions: [
      { id: 2, sequence: 1, fromPartyId: 10, toPartyId: 20, registeredCapitalAmountYuan: 25 },
    ] }),
  ], date("2024-12-31"));

  assert.equal(result.confirmedBalances.get(10), 100);
  assert.equal(result.confirmedBalances.has(20), false);
  assert.equal(result.pendingDeltas.get(10), -25);
  assert.equal(result.pendingDeltas.get(20), 25);
  assert.equal(result.snapshots[1]?.balances.get(10), 75);
  assert.equal(result.snapshots[1]?.balances.get(20), 25);
});

test("projection rejects transaction shapes that do not match the event type", () => {
  assert.throws(() => projectShareCapitalLedger([
    event({ sequence: 1, eventType: "transfer", effectiveDate: "2024-01-01", recordStatus: "confirmed", transactions: [
      { id: 1, sequence: 1, fromPartyId: null, toPartyId: 10, registeredCapitalAmountYuan: 100 },
    ] }),
  ], date("2024-01-01")), ShareCapitalProjectionError);
});

test("projection rejects transfers that exceed the registered-capital balance", () => {
  assert.throws(() => projectShareCapitalLedger([
    event({ sequence: 1, eventType: "incorporation", effectiveDate: "2024-01-01", recordStatus: "confirmed", transactions: [
      { id: 1, sequence: 1, fromPartyId: null, toPartyId: 10, registeredCapitalAmountYuan: 100 },
    ] }),
    event({ sequence: 2, eventType: "transfer", effectiveDate: "2024-02-01", recordStatus: "confirmed", transactions: [
      { id: 2, sequence: 1, fromPartyId: 10, toPartyId: 20, registeredCapitalAmountYuan: 101 },
    ] }),
  ], date("2024-02-01")), ShareCapitalProjectionError);
});
