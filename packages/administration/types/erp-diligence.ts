export const ERP_DILIGENCE_CAMPAIGN_KEY = "order-to-cash-2026";
export const ERP_DILIGENCE_DEFINITION_VERSION = 2;

export type ErpDiligenceStatus = "draft" | "submitted";

export interface ErpDiligenceProcessStep {
  key: string;
  activityKey: string;
  ownerPositionId: number | null;
  ownerPositionName: string;
  ownerDepartmentName: string;
  frequency: string;
  volumeBand: string;
  touchTimeBand: string;
  waitTimeBand: string;
  executionMode: string;
  inputStructure: string;
  ruleType: string;
  variability: string;
  exceptionRate: string;
  errorRate: string;
  handoffMode: string;
  systemCount: string;
  logAvailability: string;
  riskLevel: string;
  reviewRequirement: string;
  painPoints: string[];
  notes: string;
}

export interface ErpDiligenceEvidenceItem {
  key: string;
  documentType: string;
  format: string;
  updateFrequency: string;
  completeness: string;
  sampleLocation: string;
  ownerPositionId: number | null;
  ownerPositionName: string;
  ownerDepartmentName: string;
  notes: string;
  /** 服务端管理的附件元数据；保存问卷 JSON 时不会回写此字段。 */
  attachments?: ErpDiligenceEvidenceAttachment[];
}

export interface ErpDiligenceEvidenceAttachment {
  attachmentUid: string;
  evidenceKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  checksumSha256: string;
  uploadedAt: string;
}

export type ErpDiligenceAnswerValue = string | string[];

export interface ErpDiligenceDraft {
  respondentName: string;
  positionAssignmentId: number | null;
  departmentName: string;
  roleTitle: string;
  primaryArea: string;
  status: ErpDiligenceStatus;
  answers: Record<string, ErpDiligenceAnswerValue>;
  processSteps: ErpDiligenceProcessStep[];
  evidenceItems: ErpDiligenceEvidenceItem[];
}

export interface ErpDiligencePositionOption {
  assignmentId: number;
  positionId: number;
  positionCode: string;
  positionName: string;
  departmentId: number;
  departmentCode: string;
  departmentName: string;
  isPrimary: boolean;
}

export interface ErpDiligenceResponsibilityPositionOption {
  positionId: number;
  positionCode: string;
  positionName: string;
  departmentId: number;
  departmentCode: string;
  departmentName: string;
  scopeDepartmentIds: number[];
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
  positionOptions: ErpDiligencePositionOption[];
  responsibilityPositionOptions: ErpDiligenceResponsibilityPositionOption[];
  canViewAll: boolean;
}
