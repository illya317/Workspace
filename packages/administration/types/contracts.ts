export const CONTRACT_LIFECYCLE_OPTIONS = [
  { value: "draft", label: "草稿" },
  { value: "active", label: "有效" },
  { value: "terminated", label: "已终止" },
  { value: "expired", label: "已到期" },
  { value: "closed", label: "已关闭" },
  { value: "unknown", label: "待确认" },
] as const;

export const CONTRACT_SIGNATURE_OPTIONS = [
  { value: "unsigned", label: "未签署" },
  { value: "signed", label: "已签署" },
  { value: "unknown", label: "待确认" },
] as const;

export const CONTRACT_PERFORMANCE_OPTIONS = [
  { value: "not_started", label: "未开始" },
  { value: "in_progress", label: "履行中" },
  { value: "fulfilled", label: "已履行" },
  { value: "breached", label: "违约" },
  { value: "waived", label: "已豁免" },
  { value: "unknown", label: "待确认" },
] as const;

export const CONTRACT_CONFIDENTIALITY_OPTIONS = [
  { value: "2", label: "内部" },
  { value: "3", label: "机密" },
  { value: "4", label: "绝密" },
] as const;

export const CONTRACT_ATTACHMENT_KIND_OPTIONS = [
  { value: "signed_contract", label: "签署合同" },
  { value: "approval_record", label: "审批记录" },
  { value: "supplement", label: "补充协议" },
  { value: "supporting_material", label: "相关材料" },
  { value: "other", label: "其他附件" },
] as const;

export const CONTRACT_RECORD_TYPE_OPTIONS = [
  { value: "filing", label: "归档记录" },
  { value: "supplement", label: "补充记录" },
  { value: "note", label: "备注记录" },
] as const;

export type ContractLifecycleStatus = typeof CONTRACT_LIFECYCLE_OPTIONS[number]["value"];
export type ContractSignatureStatus = typeof CONTRACT_SIGNATURE_OPTIONS[number]["value"];
export type ContractPerformanceStatus = typeof CONTRACT_PERFORMANCE_OPTIONS[number]["value"];
export type ContractWorkView = "all" | "needs_attention" | "expiring" | "expired";
export type ContractStateAxis = "lifecycle" | "signature" | "performance";
export type ContractRevisionState = "draft" | "confirmed" | "superseded" | "cancelled";
export type ContractAttachmentKind = typeof CONTRACT_ATTACHMENT_KIND_OPTIONS[number]["value"];
export type ContractRecordInputType = typeof CONTRACT_RECORD_TYPE_OPTIONS[number]["value"];

export interface ContractCategoryOption {
  id: number;
  name: string;
}

export interface Contract {
  id: number;
  contractUid: string;
  version: number;
  contractNo: string | null;
  name: string;
  partyA: string | null;
  partyB: string | null;
  shareholder: string | null;
  categoryId: number;
  categoryName: string;
  content: string | null;
  owningCompanyId: number | null;
  owningCompanyName: string | null;
  ownerDepartmentId: number | null;
  ownerDepartmentName: string | null;
  partyAId: number | null;
  partyAIdentityName: string | null;
  partyBId: number | null;
  partyBIdentityName: string | null;
  handlerEmployeeId: number | null;
  handlerEmployeeName: string | null;
  handlerEmployeeActive: boolean | null;
  signedOn: string | null;
  expiresOn: string | null;
  signedOnPrecision: string | null;
  expiresOnPrecision: string | null;
  legacySignDateRaw: string | null;
  legacyEndDateRaw: string | null;
  lifecycleStatus: ContractLifecycleStatus;
  signatureStatus: ContractSignatureStatus;
  performanceStatus: ContractPerformanceStatus;
  legacyStatusRaw: string | null;
  amount: number | null;
  executedAmount: number | null;
  currencyCode: string;
  confidentialityLevel: number;
  location: string | null;
  remark: string | null;
  approvalSourceKey: string | null;
  approvalRecordId: string | null;
  approvalRecordUrl: string | null;
  approvalStatusSnapshot: string | null;
  approvedOn: string | null;
  approvalSyncedAt: string | null;
  currentRevisionId: number | null;
  isArchived: boolean;
  archivedAt: string | null;
  archivedBy: number | null;
  editedBy: number | null;
  editedAt: string | null;
  createdAt: string;
  updatedAt: string;
  dataQualityIssues: string[];
  canHardDelete: boolean;
}

export interface ContractRevisionSummary {
  id: number;
  revisionUid: string;
  revisionNo: number;
  recordState: ContractRevisionState;
  changeKind: "initial" | "revision" | "correction";
  effectiveOn: string;
  effectiveThrough: string | null;
  reason: string | null;
  sourceRevisionId: number | null;
  createdAt: string;
  confirmedAt: string | null;
}

export interface ContractStateEventSummary {
  id: number;
  eventUid: string;
  axis: ContractStateAxis;
  eventKind: "baseline" | "transition" | "reversal";
  fromState: string | null;
  toState: string;
  effectiveOn: string;
  recordState: "confirmed" | "reversed";
  reason: string | null;
  reversesEventId: number | null;
  createdAt: string;
  reversedAt: string | null;
}

export interface ContractLifecycleTimeline {
  contractId: number;
  currentRevision: ContractRevisionSummary | null;
  upcomingRevisions: ContractRevisionSummary[];
  draftRevisions: ContractRevisionSummary[];
  historicalRevisions: ContractRevisionSummary[];
  stateEvents: ContractStateEventSummary[];
}

export interface ContractAttachment {
  attachmentUid: string;
  kind: ContractAttachmentKind;
  fileName: string;
  mimeType: string;
  originalSizeBytes: number;
  optimizedSizeBytes: number | null;
  optimizationStatus: "not_applicable" | "optimized" | "retained_original" | "failed";
  optimizationError: string | null;
  compressionSavingsRatio: number | null;
  pageCount: number | null;
  note: string | null;
  uploadedByName: string | null;
  uploadedAt: string;
  removedAt: string | null;
  removalReason: string | null;
  version: number;
}

export interface ContractArchiveRecord {
  recordUid: string;
  recordType: "approval" | "filing" | "supplement" | "note" | "attachment_added" | "attachment_removed";
  occurredOn: string;
  title: string;
  content: string | null;
  sourceKey: string | null;
  externalRecordId: string | null;
  externalUrl: string | null;
  statusSnapshot: string | null;
  attachmentUid: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface ContractArchivePackage {
  contractId: number;
  approvalReference: {
    sourceKey: string;
    externalRecordId: string;
    externalUrl: string | null;
    statusSnapshot: string | null;
    approvedOn: string;
    syncedAt: string | null;
  } | null;
  attachments: ContractAttachment[];
  records: ContractArchiveRecord[];
}

export type ContractEditorMode = "create" | "edit" | null;

export function contractOptionLabel<T extends { value: string; label: string }>(
  options: readonly T[],
  value: string,
) {
  return options.find((option) => option.value === value)?.label ?? value;
}
