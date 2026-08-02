export type FinanceUiRequestScope = {
  companyCode: string;
  year: number;
  month: number;
};

export type LatestRequestTicket = {
  generation: number;
  key: string;
  signal: AbortSignal;
};

export function createLatestRequestGate() {
  let generation = 0;
  let controller: AbortController | null = null;
  return {
    begin(key: string): LatestRequestTicket {
      controller?.abort();
      controller = new AbortController();
      generation += 1;
      return { generation, key, signal: controller.signal };
    },
    invalidate() {
      generation += 1;
      controller?.abort();
      controller = null;
    },
    isCurrent(ticket: LatestRequestTicket) {
      return ticket.generation === generation && !ticket.signal.aborted;
    },
  };
}

export function createCurrentValueTracker<T>(initialValue: T) {
  let currentValue = initialValue;
  return {
    set(value: T) {
      currentValue = value;
    },
    isCurrent(value: T) {
      return Object.is(currentValue, value);
    },
  };
}

export function financeUiRequestScopeKey(scope: FinanceUiRequestScope) {
  return `${scope.companyCode}:${scope.year}:${scope.month}`;
}

export function financeUiResponseMatchesScope(
  response: { companyCode: string; year: number; month: number },
  request: FinanceUiRequestScope,
) {
  return response.companyCode === request.companyCode
    && response.year === request.year
    && response.month === request.month;
}
