export type LedgerFacts = {
  periodId: number | null;
  balanceIds: number[];
  vouchers: Array<{
    id: number;
    voucherNo: string;
    status: string;
    totalDebit: number;
    totalCredit: number;
    items: Array<{ debit: number; credit: number; account: { id: number; isActive: boolean; companyCode: string; year: number | null } }>;
  }>;
};

export type RelatedPartyFacts = {
  rows: Array<{ id: string; relatedPartyType: string | null; closingDebit: number; closingCredit: number }>;
  complete: boolean;
  expectedTotal: number;
};

export type ConsolidationFacts = {
  applicability: "parent_required" | "not_applicable";
  relationIds: number[];
  batch: {
    id: number;
    status: string;
    revision: number;
    entries: Array<{ id: number; entryNo: string; status: string; entryType: string }>;
    controlDecisions: Array<{ controlKey: string; decision: string }>;
    outputSnapshot: { outputFingerprint: string } | null;
  } | null;
};

export function canonicalLedgerFacts(facts: LedgerFacts): LedgerFacts {
  return {
    ...facts,
    balanceIds: [...facts.balanceIds].sort((left, right) => left - right),
    vouchers: facts.vouchers.map((voucher) => ({
      ...voucher,
      items: [...voucher.items].sort((left, right) => left.account.id - right.account.id
        || left.debit - right.debit
        || left.credit - right.credit),
    })).sort((left, right) => left.id - right.id || left.voucherNo.localeCompare(right.voucherNo)),
  };
}

export function canonicalConsolidationFacts(facts: ConsolidationFacts): ConsolidationFacts {
  return {
    ...facts,
    relationIds: [...facts.relationIds].sort((left, right) => left - right),
    batch: facts.batch ? {
      ...facts.batch,
      entries: [...facts.batch.entries].sort((left, right) => left.id - right.id
        || left.entryNo.localeCompare(right.entryNo)),
      controlDecisions: [...facts.batch.controlDecisions].sort((left, right) => left.controlKey.localeCompare(right.controlKey)
        || left.decision.localeCompare(right.decision)),
    } : null,
  };
}

export function canonicalRelatedPartyFacts(facts: RelatedPartyFacts): RelatedPartyFacts {
  const rows = [...facts.rows].sort((left, right) => left.id.localeCompare(right.id)
    || (left.relatedPartyType ?? "").localeCompare(right.relatedPartyType ?? "")
    || left.closingDebit - right.closingDebit
    || left.closingCredit - right.closingCredit);
  return {
    rows,
    complete: facts.complete && new Set(rows.map((row) => row.id)).size === rows.length,
    expectedTotal: facts.expectedTotal,
  };
}
