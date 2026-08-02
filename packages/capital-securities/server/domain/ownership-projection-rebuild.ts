import { createHash } from "node:crypto";

import { failCommand, okCommand } from "@workspace/platform/server/domain-validation";

import {
  OWNERSHIP_PROJECTOR_KEY,
  OWNERSHIP_PROJECTOR_VERSION,
} from "../../ownership-projection-contract";
import type { EquityLedgerEventState } from "./equity-ledger";

export { OWNERSHIP_PROJECTOR_KEY, OWNERSHIP_PROJECTOR_VERSION };

export function buildOwnershipProjectionRebuildCommand(input: {
  issuerCompanyId: unknown;
  triggerReason?: unknown;
  triggeredBy?: unknown;
}) {
  const issuerCompanyId = Number(input.issuerCompanyId);
  if (!Number.isInteger(issuerCompanyId) || issuerCompanyId <= 0) {
    return failCommand("发行主体无效", 400, "issuerCompanyId");
  }
  const triggeredBy = input.triggeredBy === null || input.triggeredBy === undefined
    ? null
    : Number(input.triggeredBy);
  if (triggeredBy !== null && (!Number.isInteger(triggeredBy) || triggeredBy <= 0)) {
    return failCommand("投影操作人无效", 400, "triggeredBy");
  }
  const triggerReason = input.triggerReason === null || input.triggerReason === undefined
    ? null
    : String(input.triggerReason).trim() || null;
  if (triggerReason && triggerReason.length > 500) {
    return failCommand("投影重建原因不能超过 500 个字符", 400, "triggerReason");
  }
  return okCommand({ issuerCompanyId, triggeredBy, triggerReason });
}

/** Hashes the normalized projector input, independent of database return order. */
export function hashOwnershipProjectionLedger(events: readonly EquityLedgerEventState[]) {
  const canonical = [...events]
    .sort(compareEvents)
    .map((event) => ({
      id: event.id,
      sequence: event.sequence,
      eventType: event.eventType,
      eventName: event.eventName ?? null,
      effectiveDate: event.effectiveDate?.toISOString() ?? null,
      ledgerMode: event.ledgerMode,
      dataCompleteness: event.dataCompleteness,
      recordStatus: event.recordStatus,
      registeredCapitalCheckpointYuan: event.registeredCapitalCheckpointYuan,
      consolidatedByPartyIdAfter: event.consolidatedByPartyIdAfter,
      supersedesEventId: event.supersedesEventId ?? null,
      sourceType: event.sourceType ?? null,
      sourceLabel: event.sourceLabel ?? null,
      sourceReference: event.sourceReference ?? null,
      transactions: [...event.transactions]
        .sort((left, right) => left.sequence - right.sequence || left.id - right.id)
        .map((transaction) => ({
          id: transaction.id,
          sequence: transaction.sequence,
          fromPartyId: transaction.fromPartyId,
          toPartyId: transaction.toPartyId,
          registeredCapitalAmountYuan: transaction.registeredCapitalAmountYuan,
        })),
      snapshotPositions: [...event.snapshotPositions]
        .sort((left, right) => left.sequence - right.sequence || left.id - right.id)
        .map((position) => ({
          id: position.id,
          sequence: position.sequence,
          partyId: position.partyId,
          registeredCapitalAmountYuan: position.registeredCapitalAmountYuan,
          assertedShareRatio: position.assertedShareRatio,
        })),
    }));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function compareEvents(left: EquityLedgerEventState, right: EquityLedgerEventState) {
  return left.sequence - right.sequence || left.id - right.id;
}
