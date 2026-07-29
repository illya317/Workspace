export type TreasuryRequestScope = { companyCode: string; year: number; month: number };

export type TreasuryRequestTicket = {
  generation: number;
  requested: TreasuryRequestScope;
};

export function treasuryWorkspaceMatchesScope(
  workspace: { scope: TreasuryRequestScope },
  requested: TreasuryRequestScope,
) {
  return workspace.scope.companyCode === requested.companyCode
    && workspace.scope.year === requested.year
    && workspace.scope.month === requested.month;
}

export function createTreasuryRequestGate() {
  let generation = 0;
  return {
    begin(requested: TreasuryRequestScope): TreasuryRequestTicket {
      generation += 1;
      return { generation, requested };
    },
    invalidate() {
      generation += 1;
    },
    isCurrent(ticket: TreasuryRequestTicket) {
      return ticket.generation === generation;
    },
    accepts(ticket: TreasuryRequestTicket, workspace: { scope: TreasuryRequestScope }) {
      return ticket.generation === generation
        && treasuryWorkspaceMatchesScope(workspace, ticket.requested);
    },
  };
}
