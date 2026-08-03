export interface CadInvestmentVoucherFact {
  id: number;
  companyCode: string;
  voucherNo: string;
  voucherDate: string;
  description: string;
  accountCode: string;
  bookedAmountCny: number;
  currencyCode: string | null;
  originalAmount: number | null;
  historicalRate: number | null;
  matchingCompanyCode: string | null;
  matchingLineCode: "paidInCapital" | "capitalReserve" | null;
  matchingLabel: string | null;
  capitalContributionDate: string | null;
}

export interface HistoricalCapitalFact {
  sourceRecordId: number;
  companyCode: string;
  targetDate: string;
  capitalEvidenceKind: "openingBalance" | "openingVoucher" | "cumulativeVoucher" | "voucher";
  capitalEvidenceDate: string;
  capitalContributionDate: string | null;
  originalAmount: number;
  historicalAmountCny: number | null;
  evidence: string;
  basis: "opening" | "movement";
  lineCode: "paidInCapital" | "capitalReserve";
}

export interface ConsolidationCurrencyPolicyFact {
  entitySnapshotId: number;
  functionalCurrency: string;
  evidence: string;
}

export interface ConsolidationRateApplicationFact {
  exchangeRateId: number;
  applicationType: "closing" | "flowAverage" | "cashPoint" | "historicalInvestment" | "historicalCapital";
  periodBasis: "current" | "comparative";
  entitySnapshotId: number;
  targetDate?: string;
  voucherItemId?: number | null;
  capitalContributionDate?: string | null;
  capitalEvidenceKind?: "openingBalance" | "openingVoucher" | "cumulativeVoucher" | "voucher" | null;
  capitalEvidenceDate?: string | null;
  capitalOriginalAmount?: number | null;
  capitalHistoricalAmountCny?: number | null;
  capitalLineCode?: "paidInCapital" | "capitalReserve" | null;
  evidence: string;
}
