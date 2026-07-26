export type EquityLedgerMode = "transactions" | "confirmation_snapshot";
export type EquityDataCompleteness = "complete" | "party_list_only" | "known_interests_only";
export type EquityRecordStatus = "confirmed" | "pending";

export type EquityTransactionState = {
  id: number;
  sequence: number;
  fromPartyId: number | null;
  toPartyId: number | null;
  registeredCapitalAmountYuan: number;
};

export type EquitySnapshotPositionState = {
  id: number;
  sequence: number;
  partyId: number;
  registeredCapitalAmountYuan: number | null;
  assertedShareRatio: number | null;
};

export type EquityLedgerEventState = {
  id: number;
  sequence: number;
  eventType: string;
  eventName?: string;
  effectiveDate: Date | null;
  ledgerMode: EquityLedgerMode;
  dataCompleteness: EquityDataCompleteness;
  recordStatus: EquityRecordStatus;
  registeredCapitalCheckpointYuan: number | null;
  consolidatedByPartyIdAfter: number | null;
  supersedesEventId?: number | null;
  sourceType?: string | null;
  sourceLabel?: string | null;
  sourceReference?: string | null;
  transactions: readonly EquityTransactionState[];
  snapshotPositions: readonly EquitySnapshotPositionState[];
};

export type EquityHoldingState = {
  registeredCapitalAmountYuan: number | null;
  shareRatio: number | null;
};

export type EquityLedgerState = {
  holdings: ReadonlyMap<number, EquityHoldingState>;
  registeredCapitalYuan: number | null;
  dataCompleteness: EquityDataCompleteness;
  consolidatedByPartyId: number | null;
};

export type EquityLedgerSnapshot = EquityLedgerState & {
  eventId: number;
  sequence: number;
  effectiveDate: Date | null;
  recordStatus: EquityRecordStatus;
};

export type EquityLedgerProjection = {
  confirmedState: EquityLedgerState;
  projectedState: EquityLedgerState;
  snapshots: EquityLedgerSnapshot[];
  pendingEventIds: number[];
};

export type DerivedOwnershipPeriod = {
  ownerPartyId: number;
  shareRatio: number | null;
  isConsolidated: boolean;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  sourceEventId: number;
  sourceEventName: string;
  sourceType: string | null;
  sourceLabel: string | null;
  sourceReference: string | null;
};

const CAPITAL_TOLERANCE = 0.005;
const RATIO_TOLERANCE = 0.0000001;

export class EquityLedgerProjectionError extends Error {}

export function projectEquityLedger(
  events: readonly EquityLedgerEventState[],
  asOf: Date,
): EquityLedgerProjection {
  const ordered = activeEvents(events, asOf);
  let confirmedState = emptyState();
  let projectedState = confirmedState;
  const snapshots: EquityLedgerSnapshot[] = [];
  const pendingEventIds: number[] = [];

  for (const event of ordered) {
    const base = event.recordStatus === "confirmed" ? confirmedState : projectedState;
    const next = event.ledgerMode === "confirmation_snapshot"
      ? applySnapshot(event)
      : applyTransactions(base, event);
    snapshots.push({
      ...next,
      eventId: event.id,
      sequence: event.sequence,
      effectiveDate: event.effectiveDate,
      recordStatus: event.recordStatus,
    });
    if (event.recordStatus === "confirmed") {
      confirmedState = next;
      projectedState = next;
    } else {
      pendingEventIds.push(event.id);
      projectedState = next;
    }
  }

  return { confirmedState, projectedState, snapshots, pendingEventIds };
}

export function deriveOwnershipPeriods(
  events: readonly EquityLedgerEventState[],
  asOf: Date,
): DerivedOwnershipPeriod[] {
  const projection = projectEquityLedger(events, asOf);
  const eventById = new Map(events.map((event) => [event.id, event]));
  const periods: DerivedOwnershipPeriod[] = [];
  const open = new Map<number, DerivedOwnershipPeriod & { signature: string }>();

  for (const snapshot of projection.snapshots.filter((item) => item.recordStatus === "confirmed")) {
    const event = eventById.get(snapshot.eventId);
    if (!event) throw new EquityLedgerProjectionError(`股权事件 ${snapshot.eventId} 不存在`);
    const next = new Map([...snapshot.holdings].map(([partyId, holding]) => [
      partyId,
      {
        holding,
        consolidated: snapshot.consolidatedByPartyId === partyId,
        signature: holdingSignature(holding, snapshot.consolidatedByPartyId === partyId),
      },
    ]));

    for (const [partyId, current] of [...open]) {
      const replacement = next.get(partyId);
      if (replacement?.signature === current.signature) continue;
      current.effectiveTo = snapshot.effectiveDate ? previousDay(snapshot.effectiveDate) : null;
      periods.push(withoutSignature(current));
      open.delete(partyId);
    }
    for (const [partyId, replacement] of next) {
      if (open.has(partyId)) continue;
      open.set(partyId, {
        ownerPartyId: partyId,
        shareRatio: replacement.holding.shareRatio,
        isConsolidated: replacement.consolidated,
        effectiveFrom: snapshot.effectiveDate,
        effectiveTo: null,
        sourceEventId: event.id,
        sourceEventName: event.eventName ?? event.eventType,
        sourceType: event.sourceType ?? null,
        sourceLabel: event.sourceLabel ?? null,
        sourceReference: event.sourceReference ?? null,
        signature: replacement.signature,
      });
    }
  }
  periods.push(...[...open.values()].map(withoutSignature));
  return periods.sort((left, right) => (
    compareNullableDates(left.effectiveFrom, right.effectiveFrom)
      || left.ownerPartyId - right.ownerPartyId
      || left.sourceEventId - right.sourceEventId
  ));
}

function activeEvents(events: readonly EquityLedgerEventState[], asOf: Date) {
  const candidates = events.filter((event) => event.effectiveDate === null || event.effectiveDate <= asOf);
  const superseded = new Set(candidates.flatMap((event) => event.supersedesEventId ? [event.supersedesEventId] : []));
  const ordered = candidates
    .filter((event) => !superseded.has(event.id))
    .sort((left, right) => left.sequence - right.sequence || left.id - right.id);
  const sequences = new Set<number>();
  for (const event of ordered) {
    if (sequences.has(event.sequence)) throw new EquityLedgerProjectionError(`股权事件序号重复：${event.sequence}`);
    sequences.add(event.sequence);
  }
  return ordered;
}

function applySnapshot(event: EquityLedgerEventState): EquityLedgerState {
  if (event.recordStatus === "pending") throw new EquityLedgerProjectionError(`确认快照 ${event.sequence} 不能处于待变更状态`);
  if (event.transactions.length > 0 || event.snapshotPositions.length === 0) {
    throw new EquityLedgerProjectionError(`确认快照 ${event.sequence} 必须且只能包含快照股东`);
  }
  const holdings = new Map<number, EquityHoldingState>();
  for (const position of [...event.snapshotPositions].sort((left, right) => left.sequence - right.sequence || left.id - right.id)) {
    if (holdings.has(position.partyId)) throw new EquityLedgerProjectionError(`确认快照 ${event.sequence} 的股东重复`);
    validateOptionalPositive(position.registeredCapitalAmountYuan, `确认快照 ${event.sequence} 的认缴资本`);
    validateOptionalRatio(position.assertedShareRatio, `确认快照 ${event.sequence} 的持股比例`);
    holdings.set(position.partyId, {
      registeredCapitalAmountYuan: position.registeredCapitalAmountYuan,
      shareRatio: position.assertedShareRatio,
    });
  }
  if (event.dataCompleteness === "complete" && [...holdings.values()].some((holding) => holding.registeredCapitalAmountYuan === null)) {
    throw new EquityLedgerProjectionError(`完整确认快照 ${event.sequence} 必须提供全部认缴资本`);
  }
  const knownAmounts = [...holdings.values()].flatMap((holding) => holding.registeredCapitalAmountYuan === null ? [] : [holding.registeredCapitalAmountYuan]);
  const sum = knownAmounts.reduce((total, amount) => total + amount, 0);
  const registeredCapitalYuan = event.registeredCapitalCheckpointYuan
    ?? (knownAmounts.length === holdings.size ? sum : null);
  if (event.registeredCapitalCheckpointYuan !== null && knownAmounts.length === holdings.size) {
    assertMoneyEqual(sum, event.registeredCapitalCheckpointYuan, `确认快照 ${event.sequence} 的认缴资本合计与注册资本不一致`);
  }
  return finalizeState(holdings, registeredCapitalYuan, event.dataCompleteness, event.consolidatedByPartyIdAfter);
}

function applyTransactions(state: EquityLedgerState, event: EquityLedgerEventState): EquityLedgerState {
  if (event.snapshotPositions.length > 0 || event.transactions.length === 0) {
    throw new EquityLedgerProjectionError(`交易事件 ${event.sequence} 必须且只能包含资本流向`);
  }
  if ([...state.holdings.values()].some((holding) => holding.registeredCapitalAmountYuan === null)) {
    throw new EquityLedgerProjectionError(`交易事件 ${event.sequence} 之前存在金额未知状态，必须先用完整确认快照重建基准`);
  }
  const balances = new Map([...state.holdings].map(([partyId, holding]) => [partyId, holding.registeredCapitalAmountYuan ?? 0]));
  for (const transaction of [...event.transactions].sort((left, right) => left.sequence - right.sequence || left.id - right.id)) {
    applyTransaction(balances, event, transaction);
  }
  const total = [...balances.values()].reduce((sum, amount) => sum + amount, 0);
  if (event.registeredCapitalCheckpointYuan !== null) {
    assertMoneyEqual(total, event.registeredCapitalCheckpointYuan, `交易事件 ${event.sequence} 的账本余额与注册资本检查点不一致`);
  }
  const holdings = new Map([...balances].flatMap(([partyId, amount]) => (
    amount > CAPITAL_TOLERANCE ? [[partyId, { registeredCapitalAmountYuan: amount, shareRatio: null }] as const] : []
  )));
  const controller = event.consolidatedByPartyIdAfter ?? (
    state.consolidatedByPartyId !== null && holdings.has(state.consolidatedByPartyId)
      ? state.consolidatedByPartyId
      : null
  );
  return finalizeState(holdings, total, "complete", controller);
}

function applyTransaction(
  balances: Map<number, number>,
  event: EquityLedgerEventState,
  transaction: EquityTransactionState,
) {
  const amount = transaction.registeredCapitalAmountYuan;
  if (!Number.isFinite(amount) || amount <= 0) throw new EquityLedgerProjectionError(`股权事件 ${event.sequence} 的认缴资本必须大于0`);
  const { fromPartyId, toPartyId } = transaction;
  const shapeValid = event.eventType === "incorporation" || event.eventType === "capital_increase"
    ? fromPartyId === null && toPartyId !== null
    : event.eventType === "capital_reduction" || event.eventType === "buyback"
      ? fromPartyId !== null && toPartyId === null
      : event.eventType === "transfer"
        ? fromPartyId !== null && toPartyId !== null
        : fromPartyId !== null || toPartyId !== null;
  if (!shapeValid || fromPartyId !== null && fromPartyId === toPartyId) {
    throw new EquityLedgerProjectionError(`股权事件 ${event.sequence} 的资本流向与事件类型不一致`);
  }
  if (fromPartyId !== null) {
    const next = (balances.get(fromPartyId) ?? 0) - amount;
    if (next < -CAPITAL_TOLERANCE) throw new EquityLedgerProjectionError(`股权事件 ${event.sequence} 的转出额超过股东余额`);
    if (next > CAPITAL_TOLERANCE) balances.set(fromPartyId, next);
    else balances.delete(fromPartyId);
  }
  if (toPartyId !== null) balances.set(toPartyId, (balances.get(toPartyId) ?? 0) + amount);
}

function finalizeState(
  holdings: Map<number, EquityHoldingState>,
  registeredCapitalYuan: number | null,
  dataCompleteness: EquityDataCompleteness,
  consolidatedByPartyId: number | null,
): EquityLedgerState {
  const normalized = new Map<number, EquityHoldingState>();
  for (const [partyId, holding] of holdings) {
    normalized.set(partyId, {
      registeredCapitalAmountYuan: holding.registeredCapitalAmountYuan,
      shareRatio: holding.registeredCapitalAmountYuan !== null && registeredCapitalYuan !== null
        ? holding.registeredCapitalAmountYuan / registeredCapitalYuan
        : holding.shareRatio,
    });
  }
  if (consolidatedByPartyId !== null && !normalized.has(consolidatedByPartyId)) {
    throw new EquityLedgerProjectionError("并表控制方必须是该期已知股东");
  }
  return { holdings: normalized, registeredCapitalYuan, dataCompleteness, consolidatedByPartyId };
}

function emptyState(): EquityLedgerState {
  return { holdings: new Map(), registeredCapitalYuan: 0, dataCompleteness: "complete", consolidatedByPartyId: null };
}

function holdingSignature(holding: EquityHoldingState, consolidated: boolean) {
  return JSON.stringify([
    holding.registeredCapitalAmountYuan === null ? null : rounded(holding.registeredCapitalAmountYuan),
    holding.shareRatio === null ? null : rounded(holding.shareRatio),
    consolidated,
  ]);
}

function withoutSignature(period: DerivedOwnershipPeriod & { signature: string }): DerivedOwnershipPeriod {
  const { signature: _signature, ...result } = period;
  return result;
}

function previousDay(value: Date) {
  return new Date(value.getTime() - 86_400_000);
}

function compareNullableDates(left: Date | null, right: Date | null) {
  if (left === null || right === null) return left === right ? 0 : left === null ? -1 : 1;
  return left.getTime() - right.getTime();
}

function assertMoneyEqual(actual: number, expected: number, message: string) {
  if (Math.abs(actual - expected) > CAPITAL_TOLERANCE) throw new EquityLedgerProjectionError(message);
}

function validateOptionalPositive(value: number | null, label: string) {
  if (value !== null && (!Number.isFinite(value) || value <= 0)) throw new EquityLedgerProjectionError(`${label}必须大于0`);
}

function validateOptionalRatio(value: number | null, label: string) {
  if (value !== null && (!Number.isFinite(value) || value <= 0 || value > 1 + RATIO_TOLERANCE)) {
    throw new EquityLedgerProjectionError(`${label}必须大于0且不超过100%`);
  }
}

function rounded(value: number) {
  return Math.round(value * 100_000_000) / 100_000_000;
}
