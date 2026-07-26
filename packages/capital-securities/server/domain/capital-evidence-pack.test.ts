import assert from "node:assert/strict";
import test from "node:test";

import { ownershipRatio, validateCapitalEvidencePack } from "./capital-evidence-pack";

test("ownership ratio is derived from registered capital amounts", () => {
  assert.equal(ownershipRatio(32_000_000, 62_000_000), 32 / 62);
  assert.equal(ownershipRatio(null, null), null);
  assert.throws(() => ownershipRatio(63, 62), /不得超过/);
});

test("evidence pack rejects transactions after an amount-unknown snapshot", () => {
  assert.throws(() => validateCapitalEvidencePack({
    schemaVersion: 2,
    id: "test",
    baselineDate: "2026-07-25",
    managedIssuerCompanyCodes: ["ZX02"],
    managedRegistrySourceLabels: ["source"],
    companies: [{ companyCode: "ZX02" }],
    parties: [
      { key: "owner", companyCode: "ZX01" },
      { key: "buyer", companyCode: "ZX03" },
    ],
    partyNames: [],
    registryFacts: [],
    equityEvents: [
      {
        key: "unknown", issuerCompanyCode: "ZX02", sequence: 1, eventType: "confirmation_snapshot", eventName: "名单确认",
        effectiveDate: "2026-01-01", effectiveDatePrecision: "day", ledgerMode: "confirmation_snapshot", dataCompleteness: "party_list_only",
        registeredCapitalCheckpointYuan: 100, recordStatus: "confirmed", consolidatedByPartyRefAfter: "owner", observedDate: null,
        sourceLabel: "source", sourceReference: "source", transactions: [],
        snapshotPositions: [{ sequence: 1, partyRef: "owner", registeredCapitalAmountYuan: null, assertedShareRatio: null }],
      },
      {
        key: "transfer", issuerCompanyCode: "ZX02", sequence: 2, eventType: "transfer", eventName: "转让",
        effectiveDate: "2026-02-01", effectiveDatePrecision: "day", ledgerMode: "transactions", dataCompleteness: "complete",
        registeredCapitalCheckpointYuan: 100, recordStatus: "confirmed", consolidatedByPartyRefAfter: "buyer", observedDate: null,
        sourceLabel: "source", sourceReference: "source",
        transactions: [{ sequence: 1, fromPartyRef: "owner", toPartyRef: "buyer", registeredCapitalAmountYuan: 100 }], snapshotPositions: [],
      },
    ],
  }), /必须先用完整确认快照/);
});

test("a synthetic evidence pack keeps registry facts separate from ledger snapshots", () => {
  const pack = validateCapitalEvidencePack({
    schemaVersion: 2,
    id: "synthetic-evidence-pack",
    baselineDate: "2026-01-31",
    managedIssuerCompanyCodes: ["ZX99"],
    managedRegistrySourceLabels: ["synthetic-source"],
    companies: [{ companyCode: "ZX99" }],
    parties: [{ key: "synthetic-owner", companyCode: "ZX98" }],
    partyNames: [{
      key: "synthetic-owner-name",
      partyRef: "synthetic-owner",
      nameKind: "legal",
      name: "Synthetic Owner 9X",
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
      datePrecision: "day",
      observedDate: "2026-01-02",
      sourceLabel: "synthetic-source",
      sourceReference: "fixture://owner-name",
    }],
    registryFacts: [{
      key: "synthetic-ownership-fact",
      companyCode: "ZX99",
      changeDate: "2026-01-01",
      category: "ownership",
      item: "Synthetic ownership",
      before: null,
      after: "Synthetic Owner 9X",
      observedDate: "2026-01-02",
      sourceLabel: "synthetic-source",
      sourceReference: "fixture://ownership",
      beforePartyRefs: [],
      afterPartyRefs: ["synthetic-owner"],
    }],
    equityEvents: [{
      key: "synthetic-opening-snapshot",
      issuerCompanyCode: "ZX99",
      sequence: 1,
      eventType: "confirmation_snapshot",
      eventName: "Synthetic opening snapshot",
      effectiveDate: "2026-01-01",
      effectiveDatePrecision: "day",
      ledgerMode: "confirmation_snapshot",
      dataCompleteness: "complete",
      registeredCapitalCheckpointYuan: 100,
      recordStatus: "confirmed",
      consolidatedByPartyRefAfter: "synthetic-owner",
      observedDate: "2026-01-02",
      sourceLabel: "synthetic-source",
      sourceReference: "fixture://opening-snapshot",
      transactions: [],
      snapshotPositions: [{
        sequence: 1,
        partyRef: "synthetic-owner",
        registeredCapitalAmountYuan: 100,
        assertedShareRatio: 1,
      }],
    }],
  });
  assert.deepEqual(pack.managedIssuerCompanyCodes, ["ZX99"]);
  assert.equal(pack.partyNames[0]?.partyRef, "synthetic-owner");
  assert.equal(pack.registryFacts[0]?.category, "ownership");
  assert.equal(pack.equityEvents[0]?.ledgerMode, "confirmation_snapshot");
});
