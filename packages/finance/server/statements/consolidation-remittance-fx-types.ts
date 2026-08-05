export interface RemittanceFxEntryLine {
  lineNo: number;
  entitySnapshotId: number;
  companyId: number;
  companyCode: string;
  statementType: "balanceSheet";
  lineCode: string;
  accountCode: string;
  debit: number;
  credit: number;
  currencyCode: "CNY";
  periodBasis: "current";
  note: string;
  matchSide: "left" | "right" | null;
  sourceKind: "voucher" | "workpaper";
  sourceId: string;
  sourceFingerprint: string;
  sourceAmount: number;
  sourceCurrency: string;
  counterpartyEntitySnapshotId: number | null;
  counterpartyCompanyId: number;
  sourceVoucherItemId?: number;
}

export interface RemittanceFxEntryCandidate {
  documentType: "elimination";
  postingLevel: "20";
  entryType: "investmentEquity";
  title: string;
  description: string;
  evidence: string;
  matchDifference: number;
  differenceResolution: string;
  generationKey: string;
  postingDate?: string;
  generationFingerprint: string;
  lines: RemittanceFxEntryLine[];
}

export interface RemittanceFxGenerationIssue {
  entryType: "investmentEquity";
  generationKey: string;
  title: string;
  differenceAmount: number;
  conclusion: string;
  evidence: string;
}

export interface RemittanceFxEntryPackage {
  entries: RemittanceFxEntryCandidate[];
  issues: RemittanceFxGenerationIssue[];
}
