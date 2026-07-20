export const ERP_DILIGENCE_CAMPAIGN_KEY = "order-to-cash-2026";
export const ERP_DILIGENCE_DEFINITION_VERSION = 1;

export type ErpDiligenceStatus = "draft" | "submitted";

export interface ErpDiligenceProcessStep {
  key: string;
  name: string;
  trigger: string;
  owner: string;
  inputOutput: string;
  tool: string;
  handoff: string;
  exceptions: string;
}

export interface ErpDiligenceEvidenceItem {
  key: string;
  documentType: string;
  sampleLocation: string;
  owner: string;
  notes: string;
}

export interface ErpDiligenceDraft {
  respondentName: string;
  departmentName: string;
  roleTitle: string;
  primaryArea: string;
  status: ErpDiligenceStatus;
  answers: Record<string, string>;
  processSteps: ErpDiligenceProcessStep[];
  evidenceItems: ErpDiligenceEvidenceItem[];
}

export interface ErpDiligenceSubmissionDto extends ErpDiligenceDraft {
  id: number;
  respondentUserId: number;
  campaignKey: string;
  definitionVersion: number;
  submittedAt: string | null;
  updatedAt: string;
  version: number;
  completionPercent: number;
}

export interface ErpDiligenceWorkspaceDto {
  submission: ErpDiligenceSubmissionDto | null;
  submissions: ErpDiligenceSubmissionDto[];
  canViewAll: boolean;
}
