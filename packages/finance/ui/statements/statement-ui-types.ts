export type ConsolidationWorkpaperView = "preparation" | "eliminations" | "workpaper" | "report";

export interface ConsolidationCapabilities {
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  canReject: boolean;
  canLock: boolean;
  canExport: boolean;
}
