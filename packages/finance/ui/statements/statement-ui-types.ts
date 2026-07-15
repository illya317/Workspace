export type ConsolidationWorkpaperView = "overview" | "ownership" | "sources" | "fx" | "eliminations" | "tax" | "review";

export interface ConsolidationCapabilities {
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  canReject: boolean;
  canLock: boolean;
}
