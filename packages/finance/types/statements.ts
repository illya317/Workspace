import type { StatementReportType } from "./statement-shared";
import type { ConsolidationAdjustmentComparison } from "./consolidation-adjustment";
import type { StatementPeriodKind } from "./statement-period";

export type { StatementReportType } from "./statement-shared";
export type * from "./consolidated-output";

export type ConsolidationReadinessStatus = "ready" | "attention" | "blocked";
export type ConsolidationBatchStatus = "draft" | "submitted" | "reviewed" | "locked" | "published";
export type ConsolidationBatchLifecycleAction = "create" | "submit" | "return" | "review" | "lock" | "publish";
export type ConsolidationBatchEventAction = ConsolidationBatchLifecycleAction
  | "entry.generate"
  | "entry.approve"
  | "entry.return"
  | "entry.delete"
  | "taxEffect.delete";
export type ConsolidationEntryStatus = "draft" | "submitted" | "approved" | "reversed";
export type ConsolidationEntryType =
  | "investmentEquity"
  | "nonControllingInterest"
  | "intercompanyBalance"
  | "internalTrading"
  | "internalLongTermAsset"
  | "incomeDividend"
  | "cashFlow";
export type ConsolidationControlKey =
  | "scope"
  | "ownership"
  | "sources"
  | "fx"
  | "tax"
  | `elimination:${ConsolidationEntryType}`;
export type StatementSourceKind = "workpaper" | "system" | "missing";
export type StatementExchangeRateKind = "centralParity" | "closing" | "historicalInvestment";

export interface ConsolidationPeriodOption {
  year: number;
  month: number;
  label: string;
}

export interface ConsolidationCompanyRef {
  id?: number;
  code: string;
  name: string;
  fullName: string | null;
}

export interface StatementSourceCoverage {
  snapshotId?: number | null;
  kind: StatementSourceKind;
  status: "submitted" | "draft" | "available" | "missing";
  label: string;
  detail: string;
  lineCount: number;
  sourcedLineCount: number;
  manualLineCount: number;
  importedLineCount: number;
  formulaLineCount: number;
  workpaperId?: number | null;
  workpaperVersion?: number | null;
  fingerprint?: string | null;
  evidence?: string | null;
}

export interface ConsolidationEntityCoverage {
  entitySnapshotId?: number | null;
  companyId?: number;
  relationId: number | null;
  relationVersion: number | null;
  isConsolidated: boolean;
  code: string;
  name: string;
  fullName: string | null;
  role: "母公司" | "子公司";
  parentCode: string | null;
  parentName: string | null;
  shareRatio: number | null;
  balanceSheet: StatementSourceCoverage;
  incomeStatement: StatementSourceCoverage;
  cashFlow: StatementSourceCoverage;
  status: ConsolidationReadinessStatus;
}

export interface ConsolidationControlResolution {
  ownerModule: "finance" | "capitalSecurities";
  actionKey: string;
  target: string;
}

export interface ConsolidationReadinessCheck {
  key: string;
  label: string;
  status: ConsolidationReadinessStatus;
  detail: string;
  facts: Record<string, string | number | boolean | null>;
  evidence: string[];
  dependencyKeys: string[];
  resolution: ConsolidationControlResolution;
}

export interface ConsolidationEliminationPackage {
  key: string;
  label: string;
  description: string;
  workpaper: "investmentEquity" | "balancesTransactions" | "cashFlow" | "tax";
  requiredEvidence: string;
  reviewCheck: string;
  status: "notStarted" | "sourceReady" | "draft" | "submitted" | "approved";
  entryCount?: number;
}

export interface StatementExchangeRateSnapshot {
  id: number;
  version: number;
  baseCurrency: string;
  quoteCurrency: string;
  rateKind: StatementExchangeRateKind;
  rateDate: string;
  rate: number;
  sourceName: string;
  sourceField: string;
  sourceUrl: string;
  publishedAt: string | null;
  capturedAt: string;
  note: string | null;
  updatedBy: number | null;
}

export interface StatementExchangeRateRefreshInput {
  currencyCode: string;
  targetDate: string;
}

export interface ConsolidationInvestmentEvidence {
  id: number;
  companyCode: string;
  voucherNo: string;
  voucherDate: string;
  description: string;
  accountCode: string;
  bookedAmountCny: number;
  currencyCode: string | null;
  originalAmount: number | null;
  transactionRate: number | null;
  rateStatus: "recorded" | "missingOriginalCurrency" | "missingRate";
}

export interface ConsolidationReportOutput {
  key: "balanceSheet" | "incomeStatement" | "cashFlow";
  label: string;
  status: "unpublished" | "published";
  description: string;
}

export interface ConsolidationSourceSnapshot {
  id: number;
  entitySnapshotId: number;
  reportType: StatementReportType;
  sourceKind: StatementSourceKind;
  sourceStatus: StatementSourceCoverage["status"];
  workpaperId: number | null;
  workpaperVersion: number | null;
  sourceChecksum: string | null;
  workpaperUpdatedBy: number | null;
  sourcePackageId: number | null;
  sourcePackageRevision: number | null;
  sourcePackageStatus: string | null;
  sourcePackageChecksum: string | null;
  sourcePackageUploadedBy: number | null;
  sourcePackageSubmittedBy: number | null;
  lineCount: number;
  sourcedLineCount: number;
  importedLineCount: number;
  manualLineCount: number;
  formulaLineCount: number;
  fingerprint: string;
  evidence: string | null;
  selectedBy: number;
  selectedAt: string;
  reportPayload: unknown;
}

export interface ConsolidationEntitySnapshot {
  id: number;
  companyId: number;
  companyCode: string;
  companyName: string;
  role: "parent" | "subsidiary";
  directParentCompanyId: number | null;
  directParentCode: string | null;
  relationId: number | null;
  relationUpdatedAt: string | null;
  relationEffectiveFrom: string | null;
  relationEffectiveTo: string | null;
  relationVersion: number | null;
  shareRatio: number | null;
  isConsolidated: boolean;
  functionalCurrency: string | null;
  currencyEvidence: string | null;
  currencyDecidedBy: number | null;
}

export interface ConsolidationRateApplicationSnapshot {
  applicationType: "closing" | "historicalInvestment" | "historicalCapital";
  periodBasis: "current" | "comparative";
  entitySnapshotId: number;
  voucherItemId: number | null;
  targetDate: string;
  evidence: string;
  capitalOriginalAmount?: number | null;
  voucher: {
    companyCode: string;
    voucherNo: string;
    voucherDate: string;
    description: string;
    accountCode: string;
    bookedAmountCny: number;
    currencyCode: string | null;
    originalAmount: number | null;
  } | null;
}

export interface ConsolidationRateReferenceSnapshot {
  id: number;
  exchangeRateId: number;
  exchangeRateVersion: number;
  baseCurrency: string;
  quoteCurrency: string;
  rateKind: StatementExchangeRateKind;
  rateDate: string;
  rate: number;
  sourceUrl: string;
  publishedAt: string | null;
  recordedBy: number | null;
  recordedAt: string | null;
  applications: ConsolidationRateApplicationSnapshot[];
}

export interface ConsolidationEntryLineSnapshot {
  id: number;
  lineNo: number;
  entitySnapshotId: number;
  companyId: number;
  companyCode: string;
  statementType: StatementReportType;
  lineCode: string;
  accountCode: string | null;
  debit: number;
  credit: number;
  currencyCode: string;
  periodBasis?: "current" | "comparative";
  note: string | null;
  matchSide?: "left" | "right" | null;
  sourceKind?: ConsolidationMatchSourceKind | null;
  sourceId?: string | null;
  sourceFingerprint?: string | null;
  sourceAmount?: number | null;
  sourceCurrency?: string | null;
  sourceRecordId?: number | null;
  counterpartyEntitySnapshotId?: number | null;
  counterpartyCompanyId?: number | null;
}

export type ConsolidationMatchSourceKind =
  | "auxiliaryBalance"
  | "openItem"
  | "cashFlowAllocation"
  | "workpaper"
  | "voucher";

export interface ConsolidationTaxEffectSnapshot {
  id: number;
  entitySnapshotId?: number | null;
  effectKey: string;
  taxEffectType: "deductible" | "taxable";
  differenceAmount: number;
  taxRate: number;
  derivedTaxAmount: number;
  recognition: "asset" | "liability" | "unrecognized";
  periodBasis?: "current" | "comparative";
  jurisdiction?: string | null;
  recognitionLocation?: "profitOrLoss" | "otherComprehensiveIncome" | "equity" | null;
  balanceSheetLineCode?: string | null;
  counterpartLineCode?: string | null;
  reversalPeriod: string | null;
  recoverabilityConclusion: string;
  evidence: string;
  preparedBy: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConsolidationEntrySnapshot {
  id: number;
  entryNo: string;
  entryType: ConsolidationEntryType;
  title: string;
  description: string | null;
  evidence: string;
  matchDifference?: number | null;
  differenceResolution?: string | null;
  origin?: "manual" | "system";
  generationKey?: string | null;
  generationFingerprint?: string | null;
  generatedAt?: string | null;
  status: ConsolidationEntryStatus;
  version: number;
  supersedesEntryId: number | null;
  reversalOfEntryId: number | null;
  predecessorEntryId: number | null;
  preparedBy: number;
  submittedBy: number | null;
  submittedAt: string | null;
  approvedBy: number | null;
  approvedAt: string | null;
  approvalNote: string | null;
  reversedBy: number | null;
  reversedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lines: ConsolidationEntryLineSnapshot[];
  taxEffects: ConsolidationTaxEffectSnapshot[];
}

export interface GenerateConsolidationEntriesInput {
  expectedRevision: number;
}

export interface ConsolidationControlDecisionSnapshot {
  id: number;
  controlKey: ConsolidationControlKey;
  decision: "completed" | "requiresReview" | "notApplicable";
  conclusion: string;
  evidence: string;
  decidedBy: number;
  decidedAt: string;
}

export interface ConsolidationBatchEventSnapshot {
  id: number;
  eventType: "lifecycle" | "mutation";
  action: ConsolidationBatchEventAction;
  fromStatus: string;
  toStatus: string;
  note: string | null;
  actorUserId: number;
  actorName: string;
  batchRevision: number;
  targetType: "entry" | "taxEffect" | null;
  targetId: number | null;
  snapshot: unknown;
  createdAt: string;
}

export interface ConsolidationBatchSnapshot {
  id: number;
  parentCompanyId: number;
  parentCompanyCode: string;
  parentCompanyName: string;
  year: number;
  month: number;
  periodKind: StatementPeriodKind;
  version: number;
  revision: number;
  status: ConsolidationBatchStatus;
  baseBatchId: number | null;
  scopeFingerprint: string;
  sourceFingerprint: string;
  rateFingerprint: string;
  createdBy: number;
  submittedBy: number | null;
  submittedAt: string | null;
  reviewedBy: number | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  lockedBy: number | null;
  lockedAt: string | null;
  publishedBy: number | null;
  publishedAt: string | null;
  entities: ConsolidationEntitySnapshot[];
  sources: ConsolidationSourceSnapshot[];
  exchangeRates: ConsolidationRateReferenceSnapshot[];
  entries: ConsolidationEntrySnapshot[];
  controlDecisions: ConsolidationControlDecisionSnapshot[];
  events: ConsolidationBatchEventSnapshot[];
}

export interface ConsolidationBatchVersionSummary {
  id: number;
  version: number;
  revision: number;
  status: ConsolidationBatchStatus;
  baseBatchId: number | null;
}

export interface EnsureConsolidationBatchInput {
  parentCompanyId: number;
  year: number;
  month: number;
  periodKind?: StatementPeriodKind;
  baseBatchId?: number | null;
}

export interface SaveConsolidationSourcesInput {
  expectedRevision: number;
  intent: "refresh" | "completePreparation";
}

export interface ConsolidationEntryLineInput {
  entitySnapshotId: number;
  statementType: StatementReportType;
  lineCode: string;
  accountCode?: string | null;
  debit: number;
  credit: number;
  currencyCode?: string;
  periodBasis?: "current" | "comparative";
  note?: string | null;
  matchSide?: "left" | "right" | null;
  sourceKind?: ConsolidationMatchSourceKind | null;
  sourceRecordId?: number | null;
  counterpartyEntitySnapshotId?: number | null;
}

export interface SaveConsolidationEntryInput {
  expectedRevision: number;
  entryId?: number | null;
  entryNo: string;
  entryType: ConsolidationEntryType;
  title: string;
  description?: string | null;
  evidence: string;
  differenceResolution?: string | null;
  supersedesEntryId?: number | null;
  reversalOfEntryId?: number | null;
  lines: ConsolidationEntryLineInput[];
}

export interface SaveConsolidationTaxEffectInput {
  expectedRevision: number;
  entitySnapshotId?: number | null;
  effectKey: string;
  taxEffectType: "deductible" | "taxable";
  differenceAmount: number;
  taxRate: number;
  recognition: "asset" | "liability" | "unrecognized";
  periodBasis?: "current" | "comparative";
  jurisdiction?: string | null;
  recognitionLocation?: "profitOrLoss" | "otherComprehensiveIncome" | "equity" | null;
  balanceSheetLineCode?: string | null;
  counterpartLineCode?: string | null;
  reversalPeriod?: string | null;
  recoverabilityConclusion: string;
  evidence: string;
}

export type ConsolidationControlDecisionDraft = {
  mode: "setAll";
  decision: "completed" | "requiresReview";
} | {
  mode: "notApplicable";
  controlKey: `elimination:${ConsolidationEntryType}`;
  conclusion: string;
  evidence: string;
};

export type SaveConsolidationControlDecisionInput = ConsolidationControlDecisionDraft & {
  expectedRevision: number;
};

export interface ConsolidationBatchLifecycleInput {
  expectedRevision: number;
  note?: string | null;
}

export interface DeleteConsolidationMutationInput {
  expectedRevision: number;
  note: string;
}

export interface ConsolidationOverview {
  scope: {
    parent: ConsolidationCompanyRef | null;
    parentCompanyId: number | null;
    batchId: number | null;
    year: number;
    month: number;
    periodKind: StatementPeriodKind;
    periodLabel: string;
    availablePeriods: ConsolidationPeriodOption[];
  };
  batch: ConsolidationBatchSnapshot | null;
  batchVersions: ConsolidationBatchVersionSummary[];
  batchCreation: { allowed: boolean; unavailableReasons: string[] };
  metrics: {
    entityCount: number;
    coveredSources: number;
    totalSources: number;
    blockerCount: number;
  };
  entities: ConsolidationEntityCoverage[];
  adjustmentComparisons: ConsolidationAdjustmentComparison[];
  checks: ConsolidationReadinessCheck[];
  eliminations: ConsolidationEliminationPackage[];
  fxPolicy: {
    pair: "CAD/CNY";
    sourceName: "中国外汇交易中心";
    sourceField: "人民币汇率中间价";
    unit: "人民币/1外币";
    sourceUrl: string;
    status: "notConfigured" | "partiallyConfigured" | "ready";
    periodEndDate: string;
    comparativePeriodEndDate: string;
    closingRate: StatementExchangeRateSnapshot | null;
    comparativeClosingRate: StatementExchangeRateSnapshot | null;
    historicalRateCount: number;
    rates: StatementExchangeRateSnapshot[];
    investmentEvidence: ConsolidationInvestmentEvidence[];
    missingInvestmentRateCount: number;
    canadaSourceStatementsReady: boolean;
    note: string;
  };
  outputs: ConsolidationReportOutput[];
  outputStatus: "blocked" | "ready";
  outputMessage: string;
}
