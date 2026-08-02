import assert from "node:assert/strict";
import test from "node:test";

import type { EquityLedgerEventState } from "./equity-ledger";
import {
  buildOwnershipProjectionRebuildCommand,
  hashOwnershipProjectionLedger,
} from "./ownership-projection-rebuild";

function event(id: number, sequence: number, amount: number): EquityLedgerEventState {
  return {
    id,
    sequence,
    eventType: "incorporation",
    eventName: "设立",
    effectiveDate: new Date("2024-01-01T00:00:00.000Z"),
    ledgerMode: "transactions",
    dataCompleteness: "complete",
    recordStatus: "confirmed",
    registeredCapitalCheckpointYuan: amount,
    consolidatedByPartyIdAfter: 10,
    transactions: [{
      id,
      sequence: 1,
      fromPartyId: null,
      toPartyId: 10,
      registeredCapitalAmountYuan: amount,
    }],
    snapshotPositions: [],
  };
}

test("rebuild command validates the issuer and normalizes audit input", () => {
  const command = buildOwnershipProjectionRebuildCommand({
    issuerCompanyId: "7",
    triggeredBy: "11",
    triggerReason: "  event confirmed  ",
  });
  assert.deepEqual(command, {
    ok: true,
    data: { issuerCompanyId: 7, triggeredBy: 11, triggerReason: "event confirmed" },
  });
  assert.equal(buildOwnershipProjectionRebuildCommand({ issuerCompanyId: 0 }).ok, false);
  assert.equal(buildOwnershipProjectionRebuildCommand({ issuerCompanyId: 7, triggeredBy: -1 }).ok, false);
});

test("ledger hash is stable across return order and changes with projector input", () => {
  const first = event(1, 1, 100);
  const second = event(2, 2, 25);
  assert.equal(
    hashOwnershipProjectionLedger([second, first]),
    hashOwnershipProjectionLedger([first, second]),
  );
  assert.notEqual(
    hashOwnershipProjectionLedger([first]),
    hashOwnershipProjectionLedger([event(1, 1, 101)]),
  );
});
