export const EQUITY_COMPONENT_CODES = [
  "paidInCapital",
  "otherEquityInstruments",
  "capitalReserve",
  "treasuryStock",
  "otherComprehensiveIncome",
  "surplusReserve",
  "undistributedProfit",
] as const;

export type EquityComponentCode = typeof EQUITY_COMPONENT_CODES[number];

export interface CapitalContributionEvent {
  id: string;
  occurrenceDate: string;
  originalAmount: number;
  rate: number;
  controlledAmountCny?: number | null;
}

export function equityMoney(value: number) {
  const rounded = Math.sign(value) * Math.round((Math.abs(value) + 1e-9) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function buildCapitalEventLedger(
  events: readonly CapitalContributionEvent[],
  cutoffDate: string,
) {
  const includedEvents = events
    .filter((event) => event.occurrenceDate <= cutoffDate)
    .map((event) => ({
      ...event,
      amountCny: equityMoney(event.controlledAmountCny ?? event.originalAmount * event.rate),
    }))
    .sort((left, right) => left.occurrenceDate.localeCompare(right.occurrenceDate)
      || left.id.localeCompare(right.id));
  return {
    cutoffDate,
    includedEvents,
    amountCny: equityMoney(includedEvents.reduce((sum, event) => sum + event.amountCny, 0)),
  };
}

export function allocateEquityAmount(amount: number, parentShareRatio: number) {
  const total = equityMoney(amount);
  const nci = equityMoney(total * (1 - parentShareRatio));
  return { total, parent: equityMoney(total - nci), nci };
}

export function buildEquityCheckpointLedger(input: {
  baselineDate: string;
  components: readonly { lineCode: EquityComponentCode; amount: number }[];
  parentShareRatio: number;
  parentLongTermInvestmentAmount: number;
}) {
  const components = input.components.map((component) => ({
    ...component,
    ...allocateEquityAmount(component.amount, input.parentShareRatio),
  }));
  const component = (lineCode: EquityComponentCode) => (
    components.find((item) => item.lineCode === lineCode)?.total ?? 0
  );
  const capital = equityMoney(component("paidInCapital") + component("capitalReserve"));
  const capitalAllocation = allocateEquityAmount(capital, input.parentShareRatio);
  const nci = equityMoney(components.reduce((sum, item) => sum + item.nci, 0));
  return {
    baselineDate: input.baselineDate,
    components,
    capital,
    parentLongTermInvestmentAmount: equityMoney(input.parentLongTermInvestmentAmount),
    consolidatedCapitalReserveAdjustment: equityMoney(
      capitalAllocation.parent - input.parentLongTermInvestmentAmount,
    ),
    nci,
  };
}

export function buildNciContinuityLedger(input: {
  openingBalance: number;
  movements: readonly { amount: number }[];
  reportedClosingBalance: number;
  netAssetsCrossCheck: number;
}) {
  const openingBalance = equityMoney(input.openingBalance);
  const calculatedClosingBalance = equityMoney(
    openingBalance + input.movements.reduce((sum, movement) => sum + movement.amount, 0),
  );
  const reportedClosingBalance = equityMoney(input.reportedClosingBalance);
  const netAssetsCrossCheck = equityMoney(input.netAssetsCrossCheck);
  return {
    openingBalance,
    calculatedClosingBalance,
    reportedClosingBalance,
    rollforwardDifference: equityMoney(reportedClosingBalance - calculatedClosingBalance),
    netAssetsCrossCheck,
    crossCheckDifference: equityMoney(reportedClosingBalance - netAssetsCrossCheck),
  };
}
