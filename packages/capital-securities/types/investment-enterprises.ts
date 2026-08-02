export type InvestmentEnterpriseProfileRecord = {
  id: number;
  profileUid: string;
  companyId: number;
  companyCode: string;
  companyName: string;
  companyFullName: string | null;
  portfolioCode: string;
  investmentStatus: string;
  investmentStage: string | null;
  industry: string | null;
  investmentDate: string | null;
  exitDate: string | null;
  investmentCurrency: string;
  investedAmount: number | null;
  currentValuation: number | null;
  valuationDate: string | null;
  investmentLead: string | null;
  dealTeam: string | null;
  boardSeat: string | null;
  investmentThesis: string | null;
  keyRisks: string | null;
  exitPlan: string | null;
  nextReviewDate: string | null;
  version: number;
};

export type InvestmentEnterpriseShareholderRecord = {
  partyId: number;
  name: string;
  confirmedSubscribedCapitalYuan: number | null;
  pendingCapitalDeltaYuan: number | null;
  projectedSubscribedCapitalYuan: number | null;
  shareRatio: number | null;
  firstEventDate: string | null;
  latestEventDate: string | null;
};

export type InvestmentEnterpriseMeetingRecord = {
  id: number; profileId: number; meetingType: string; title: string; meetingDate: string | null;
  status: string; decisionSummary: string | null; votingResult: string | null; followUpOwner: string | null;
  followUpDueDate: string | null; notes: string | null; sourceReference: string | null; version: number;
};

export type InvestmentEnterpriseDiligenceRecord = {
  id: number; profileId: number; workstream: string; title: string; riskLevel: string; status: string;
  finding: string | null; recommendation: string | null; ownerName: string | null; dueDate: string | null;
  remediationStatus: string; remediationEvidence: string | null; sourceReference: string | null; version: number;
};

export type InvestmentEnterpriseContractRecord = {
  id: number; profileId: number; contractType: string; title: string; counterpartyText: string | null;
  signedDate: string | null; effectiveDate: string | null; expiryDate: string | null; noticeDate: string | null;
  status: string; currency: string; amount: number | null; keyTerms: string | null;
  obligationSummary: string | null; sourceReference: string | null; version: number;
};

export type InvestmentEnterpriseMonitoringRecord = {
  id: number; profileId: number; periodEnd: string; status: string; currency: string; revenue: number | null;
  netProfit: number | null; cashBalance: number | null; valuation: number | null; headcount: number | null;
  highlights: string | null; risks: string | null; sourceReference: string | null; version: number;
};

export type InvestmentEnterpriseDocumentRecord = {
  id: number; linkUid: string; profileId: number; libraryDocumentUid: string | null; documentCategory: string;
  title: string; notes: string | null; uploadStatus: string; failureReason: string | null; linkedAt: string | null;
  documentId: number | null; versionUid: string | null; fileName: string | null; reviewStatus: string | null;
  extractionStatus: string; ocrStatus: string; vectorStatus: string; ocrUsed: boolean; modelKey: string | null;
  pageCount: number | null; updatedAt: string;
};

export type InvestmentEnterpriseWorkspace = {
  profiles: InvestmentEnterpriseProfileRecord[];
  companyCandidates: Array<{ id: number; code: string; name: string; fullName: string | null }>;
  selectedProfile: InvestmentEnterpriseProfileRecord | null;
  shareholders: InvestmentEnterpriseShareholderRecord[];
  meetings: InvestmentEnterpriseMeetingRecord[];
  diligenceItems: InvestmentEnterpriseDiligenceRecord[];
  contracts: InvestmentEnterpriseContractRecord[];
  monitoring: InvestmentEnterpriseMonitoringRecord[];
  documents: InvestmentEnterpriseDocumentRecord[];
  metrics: { openDiligence: number; upcomingObligations: number; pendingActions: number; documentCount: number };
};

export type InvestmentEnterpriseRecordKind = "meeting" | "diligence" | "contract" | "monitoring";

export type InvestmentEnterpriseSearchResponse = {
  mode: "vector" | "unavailable";
  modelKey: string | null;
  message: string | null;
  results: Array<{ documentUid: string; versionUid: string; chunkUid: string; title: string; score: number; quote: string; locator: Record<string, unknown> }>;
};
