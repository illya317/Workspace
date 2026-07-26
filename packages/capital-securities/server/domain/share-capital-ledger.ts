export type ShareCapitalEventType =
  | "incorporation"
  | "capital_increase"
  | "capital_reduction"
  | "transfer"
  | "buyback"
  | "adjustment";

export type ShareCapitalRecordStatus = "confirmed" | "pending";

export type ShareCapitalTransactionState = {
  id: number;
  sequence: number;
  fromPartyId: number | null;
  toPartyId: number | null;
  registeredCapitalAmountYuan: number;
};

export type ShareCapitalEventState = {
  id: number;
  sequence: number;
  eventType: ShareCapitalEventType;
  effectiveDate: Date;
  recordStatus: ShareCapitalRecordStatus;
  transactions: ShareCapitalTransactionState[];
};

export type ShareCapitalEventSnapshot = {
  eventId: number;
  balances: ReadonlyMap<number, number>;
  totalRegisteredCapitalYuan: number;
};

export type ShareCapitalProjection = {
  confirmedBalances: ReadonlyMap<number, number>;
  pendingDeltas: ReadonlyMap<number, number>;
  totalRegisteredCapitalYuan: number;
  snapshots: ShareCapitalEventSnapshot[];
};

const CAPITAL_TOLERANCE = 0.005;

export class ShareCapitalProjectionError extends Error {}

export function projectShareCapitalLedger(
  events: ShareCapitalEventState[],
  asOf: Date,
): ShareCapitalProjection {
  const confirmedBalances = new Map<number, number>();
  const pendingDeltas = new Map<number, number>();
  const snapshots: ShareCapitalEventSnapshot[] = [];
  const ordered = [...events].sort(compareEvents);

  for (const event of ordered) {
    if (event.effectiveDate.getTime() > asOf.getTime()) continue;
    const scenarioBalances = applyEvent(new Map(confirmedBalances), event);
    snapshots.push({
      eventId: event.id,
      balances: scenarioBalances,
      totalRegisteredCapitalYuan: sumBalances(scenarioBalances),
    });
    if (event.recordStatus === "confirmed") {
      replaceMap(confirmedBalances, scenarioBalances);
    } else {
      accumulatePendingDeltas(pendingDeltas, event);
    }
  }

  return {
    confirmedBalances,
    pendingDeltas,
    totalRegisteredCapitalYuan: sumBalances(confirmedBalances),
    snapshots,
  };
}

export function shareRatioFromRegisteredCapital(
  registeredCapitalAmountYuan: number,
  totalRegisteredCapitalYuan: number,
) {
  return totalRegisteredCapitalYuan > CAPITAL_TOLERANCE
    ? registeredCapitalAmountYuan / totalRegisteredCapitalYuan
    : 0;
}

function applyEvent(balances: Map<number, number>, event: ShareCapitalEventState) {
  if (event.transactions.length === 0) {
    throw new ShareCapitalProjectionError(`股本事件 ${event.sequence} 没有交易明细`);
  }
  for (const transaction of [...event.transactions].sort((left, right) => left.sequence - right.sequence || left.id - right.id)) {
    validateTransactionShape(event, transaction);
    const amount = transaction.registeredCapitalAmountYuan;
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ShareCapitalProjectionError(`股本事件 ${event.sequence} 的认缴资本额必须大于 0`);
    }
    if (transaction.fromPartyId !== null) {
      const next = (balances.get(transaction.fromPartyId) ?? 0) - amount;
      if (next < -CAPITAL_TOLERANCE) {
        throw new ShareCapitalProjectionError(`股本事件 ${event.sequence} 的转出额超过股东余额`);
      }
      setBalance(balances, transaction.fromPartyId, next);
    }
    if (transaction.toPartyId !== null) {
      setBalance(
        balances,
        transaction.toPartyId,
        (balances.get(transaction.toPartyId) ?? 0) + amount,
      );
    }
  }
  return balances;
}

function validateTransactionShape(
  event: ShareCapitalEventState,
  transaction: ShareCapitalTransactionState,
) {
  const { fromPartyId, toPartyId } = transaction;
  const invalid = fromPartyId !== null && fromPartyId === toPartyId;
  const shapeValid = event.eventType === "incorporation" || event.eventType === "capital_increase"
    ? fromPartyId === null && toPartyId !== null
    : event.eventType === "capital_reduction" || event.eventType === "buyback"
      ? fromPartyId !== null && toPartyId === null
      : event.eventType === "transfer"
        ? fromPartyId !== null && toPartyId !== null
        : fromPartyId !== null || toPartyId !== null;
  if (invalid || !shapeValid) {
    throw new ShareCapitalProjectionError(`股本事件 ${event.sequence} 的交易方向与事件类型不一致`);
  }
}

function accumulatePendingDeltas(
  pendingDeltas: Map<number, number>,
  event: ShareCapitalEventState,
) {
  for (const transaction of event.transactions) {
    if (transaction.fromPartyId !== null) {
      pendingDeltas.set(
        transaction.fromPartyId,
        (pendingDeltas.get(transaction.fromPartyId) ?? 0) - transaction.registeredCapitalAmountYuan,
      );
    }
    if (transaction.toPartyId !== null) {
      pendingDeltas.set(
        transaction.toPartyId,
        (pendingDeltas.get(transaction.toPartyId) ?? 0) + transaction.registeredCapitalAmountYuan,
      );
    }
  }
}

function compareEvents(left: ShareCapitalEventState, right: ShareCapitalEventState) {
  return left.effectiveDate.getTime() - right.effectiveDate.getTime()
    || left.sequence - right.sequence
    || left.id - right.id;
}

function replaceMap(target: Map<number, number>, source: Map<number, number>) {
  target.clear();
  for (const [key, value] of source) target.set(key, value);
}

function setBalance(balances: Map<number, number>, partyId: number, value: number) {
  if (Math.abs(value) <= CAPITAL_TOLERANCE) balances.delete(partyId);
  else balances.set(partyId, value);
}

function sumBalances(balances: ReadonlyMap<number, number>) {
  return [...balances.values()].reduce((sum, value) => sum + value, 0);
}
