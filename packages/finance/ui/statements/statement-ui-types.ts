export type ConsolidationWorkpaperView = "adjustments" | "report";

export interface ConsolidationCapabilities {
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  canReject: boolean;
  canLock: boolean;
}
