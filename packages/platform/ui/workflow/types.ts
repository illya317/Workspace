import type { ReactNode } from "react";
import type { ActionGlyphKind, BodySurfaceSectionSpec } from "@workspace/core/ui";
import type { WorkflowFlowType, WorkflowStatus } from "../WorkflowStatusBadge";

export type WorkflowActionPlacement = "row" | "formFooter" | "modalFooter" | "toolbar";

export type WorkflowActionCommandKind =
  | "direct"
  | "save"
  | "submit"
  | "withdraw"
  | "cancel"
  | "revise"
  | "resubmit"
  | "approve"
  | "reject"
  | "open";

export interface WorkflowActionCommand {
  key: string;
  kind: WorkflowActionCommandKind;
  label: ReactNode;
  icon?: ActionGlyphKind;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  onClick?: () => void;
}

export interface WorkflowActionViewModel {
  businessActionKey: string;
  flowType: WorkflowFlowType;
  mode: "direct" | "workflow";
  status?: WorkflowStatus;
  requestId?: number | string | null;
  title: ReactNode;
  summary?: ReactNode;
  href?: string;
  placement: WorkflowActionPlacement;
  payloadMode?: "none" | "readonly" | "editable";
  commands: WorkflowActionCommand[];
}

export interface WorkflowRequestTimelineEvent {
  id: string | number;
  actor: ReactNode;
  type: ReactNode;
  at: ReactNode;
  comment?: ReactNode;
}

export interface WorkflowRequestModalProps {
  open: boolean;
  onClose: () => void;
  viewModel: WorkflowActionViewModel;
  payloadSections?: BodySurfaceSectionSpec[];
  timelineEvents?: WorkflowRequestTimelineEvent[];
}
