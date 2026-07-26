import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveOwnershipPeriods,
  EquityLedgerProjectionError,
  projectEquityLedger,
  type EquityLedgerEventState,
} from "./equity-ledger";

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

function event(input: Partial<EquityLedgerEventState> & Pick<EquityLedgerEventState, "id" | "sequence" | "eventType">): EquityLedgerEventState {
  return {
    eventName: input.eventType,
    effectiveDate: day("2020-01-01"),
    ledgerMode: "transactions",
    dataCompleteness: "complete",
    recordStatus: "confirmed",
    registeredCapitalCheckpointYuan: null,
    consolidatedByPartyIdAfter: null,
    transactions: [],
    snapshotPositions: [],
    ...input,
  };
}

test("transaction events are the normal applied ledger", () => {
  const result = projectEquityLedger([
    event({ id: 1, sequence: 1, eventType: "incorporation", transactions: [
      { id: 1, sequence: 1, fromPartyId: null, toPartyId: 10, registeredCapitalAmountYuan: 100 },
    ] }),
    event({ id: 2, sequence: 2, eventType: "transfer", transactions: [
      { id: 2, sequence: 1, fromPartyId: 10, toPartyId: 20, registeredCapitalAmountYuan: 30 },
    ] }),
  ], day("2026-07-25"));
  assert.equal(result.confirmedState.registeredCapitalYuan, 100);
  assert.deepEqual([...result.confirmedState.holdings], [
    [10, { registeredCapitalAmountYuan: 70, shareRatio: 0.7 }],
    [20, { registeredCapitalAmountYuan: 30, shareRatio: 0.3 }],
  ]);
});

test("confirmation snapshots preserve an unknown middle period and restore a later transaction baseline", () => {
  const events = [
    event({
      id: 1, sequence: 1, eventType: "confirmation_snapshot", eventName: "设立确认",
      effectiveDate: day("2020-07-10"), ledgerMode: "confirmation_snapshot", registeredCapitalCheckpointYuan: 30,
      consolidatedByPartyIdAfter: 1,
      snapshotPositions: [{ id: 1, sequence: 1, partyId: 1, registeredCapitalAmountYuan: 30, assertedShareRatio: null }],
    }),
    event({
      id: 2, sequence: 2, eventType: "confirmation_snapshot", eventName: "四股东名单",
      effectiveDate: day("2022-03-24"), ledgerMode: "confirmation_snapshot", dataCompleteness: "party_list_only",
      registeredCapitalCheckpointYuan: 30, consolidatedByPartyIdAfter: 1,
      snapshotPositions: [1, 2, 3, 4].map((partyId) => ({ id: partyId, sequence: partyId, partyId, registeredCapitalAmountYuan: null, assertedShareRatio: null })),
    }),
    event({
      id: 3, sequence: 3, eventType: "confirmation_snapshot", eventName: "恢复独资确认",
      effectiveDate: day("2022-07-04"), ledgerMode: "confirmation_snapshot", registeredCapitalCheckpointYuan: 30,
      consolidatedByPartyIdAfter: 1,
      snapshotPositions: [{ id: 5, sequence: 1, partyId: 1, registeredCapitalAmountYuan: 30, assertedShareRatio: null }],
    }),
    event({
      id: 4, sequence: 4, eventType: "transfer", eventName: "全部股权转让", effectiveDate: day("2026-06-18"),
      registeredCapitalCheckpointYuan: 30, consolidatedByPartyIdAfter: 5,
      transactions: [{ id: 6, sequence: 1, fromPartyId: 1, toPartyId: 5, registeredCapitalAmountYuan: 30 }],
    }),
  ];
  const projection = projectEquityLedger(events, day("2026-07-25"));
  assert.deepEqual([...projection.confirmedState.holdings], [[5, { registeredCapitalAmountYuan: 30, shareRatio: 1 }]]);
  assert.equal(projection.snapshots[1]?.dataCompleteness, "party_list_only");
  assert.equal(projection.snapshots[1]?.holdings.get(2)?.shareRatio, null);
  const periods = deriveOwnershipPeriods(events, day("2026-07-25"));
  assert.equal(periods.length, 7);
  assert.deepEqual(periods.filter((period) => period.ownerPartyId === 1).map((period) => [
    period.effectiveFrom?.toISOString().slice(0, 10) ?? null,
    period.effectiveTo?.toISOString().slice(0, 10) ?? null,
    period.shareRatio,
  ]), [
    ["2020-07-10", "2022-03-23", 1],
    ["2022-03-24", "2022-07-03", null],
    ["2022-07-04", "2026-06-17", 1],
  ]);
});

test("a quantitative transaction cannot cross an amount-unknown state", () => {
  assert.throws(() => projectEquityLedger([
    event({
      id: 1, sequence: 1, eventType: "confirmation_snapshot", ledgerMode: "confirmation_snapshot",
      dataCompleteness: "party_list_only",
      snapshotPositions: [{ id: 1, sequence: 1, partyId: 1, registeredCapitalAmountYuan: null, assertedShareRatio: null }],
    }),
    event({ id: 2, sequence: 2, eventType: "transfer", transactions: [
      { id: 2, sequence: 1, fromPartyId: 1, toPartyId: 2, registeredCapitalAmountYuan: 10 },
    ] }),
  ], day("2026-07-25")), EquityLedgerProjectionError);
});

test("a known-interest snapshot can preserve a sourced ratio without fabricating capital", () => {
  const result = projectEquityLedger([event({
    id: 1, sequence: 1, eventType: "confirmation_snapshot", ledgerMode: "confirmation_snapshot",
    dataCompleteness: "known_interests_only",
    snapshotPositions: [{ id: 1, sequence: 1, partyId: 1, registeredCapitalAmountYuan: null, assertedShareRatio: 0.75 }],
  })], day("2026-07-25"));
  assert.deepEqual(result.confirmedState.holdings.get(1), { registeredCapitalAmountYuan: null, shareRatio: 0.75 });
  assert.equal(result.confirmedState.registeredCapitalYuan, null);
});
