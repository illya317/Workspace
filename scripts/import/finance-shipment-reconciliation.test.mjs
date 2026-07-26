import assert from "node:assert/strict";
import test from "node:test";

import { reconcileShipmentReceivedAmount } from "./finance-shipment-reconciliation.mjs";

test("keeps a source received amount unchanged", () => {
  assert.deepEqual(reconcileShipmentReceivedAmount({
    amount: 100,
    receivedAmount: 70,
    uncollectedAmount: 30,
  }), { value: 70, reconciled: false });
});

test("normalizes a blank received amount to zero when the full amount is uncollected", () => {
  assert.deepEqual(reconcileShipmentReceivedAmount({
    amount: 100,
    receivedAmount: null,
    uncollectedAmount: 100,
  }), { value: 0, reconciled: true });
  assert.deepEqual(reconcileShipmentReceivedAmount({
    amount: -100,
    receivedAmount: null,
    uncollectedAmount: -100,
  }), { value: 0, reconciled: true });
});

test("does not invent a received amount when the source values do not fully reconcile", () => {
  assert.deepEqual(reconcileShipmentReceivedAmount({
    amount: 100,
    receivedAmount: null,
    uncollectedAmount: 30,
  }), { value: null, reconciled: false });
  assert.deepEqual(reconcileShipmentReceivedAmount({
    amount: 100,
    receivedAmount: null,
    uncollectedAmount: null,
  }), { value: null, reconciled: false });
});
