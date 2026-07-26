"use client";

import { ActionGlyph, type ActionGlyphKind } from "@workspace/core/ui";
import {
  getWorkflowFlowTypeLabel,
  getWorkflowStatusLabel,
  type WorkflowFlowType,
  type WorkflowStatus,
} from "../workflow-status";
export {
  getWorkflowFlowTypeLabel,
  getWorkflowStatusLabel,
  getWorkflowStatusTone,
  getWorkflowStatusView,
  normalizeWorkflowStatus,
  parseWorkflowStatus,
} from "../workflow-status";
export type { WorkflowFlowType, WorkflowStatus, WorkflowStatusTone } from "../workflow-status";

type WorkflowTone = "gray" | "slate" | "amber" | "blue" | "red" | "emerald" | "green";

type WorkflowStateDefinition = {
  icon: ActionGlyphKind;
  tone: WorkflowTone;
};

export type WorkflowStatusBadgeProps = {
  status: WorkflowStatus;
  flowType?: WorkflowFlowType;
  size?: "sm" | "md";
  className?: string;
};

export type WorkflowStateIconProps = {
  status: WorkflowStatus;
  flowType?: WorkflowFlowType;
  className?: string;
};

const STATE_DEFINITIONS: Record<WorkflowStatus, WorkflowStateDefinition> = {
  draft: {
    icon: "edit",
    tone: "gray",
  },
  submitted: {
    icon: "send",
    tone: "amber",
  },
  in_review: {
    icon: "verified",
    tone: "blue",
  },
  rejected: {
    icon: "x",
    tone: "red",
  },
  withdrawn: {
    icon: "withdraw",
    tone: "slate",
  },
  approved: {
    icon: "verified",
    tone: "emerald",
  },
  published: {
    icon: "verified",
    tone: "green",
  },
  cancelled: {
    icon: "cancel",
    tone: "gray",
  },
  failed: {
    icon: "stop",
    tone: "red",
  },
};

const BADGE_TONE_CLASS: Record<WorkflowTone, string> = {
  gray: "bg-gray-100 text-gray-600 ring-gray-200",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  blue: "bg-sky-50 text-sky-700 ring-sky-200",
  red: "bg-rose-50 text-rose-600 ring-rose-200",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  green: "bg-green-50 text-green-700 ring-green-200",
};

const ICON_TONE_CLASS: Record<WorkflowTone, string> = {
  gray: "text-gray-500",
  slate: "text-slate-500",
  amber: "text-amber-600",
  blue: "text-sky-600",
  red: "text-rose-600",
  emerald: "text-emerald-600",
  green: "text-green-600",
};

function joinClassNames(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

export function getWorkflowStatusIcon(status: WorkflowStatus) {
  return STATE_DEFINITIONS[status].icon;
}

export function WorkflowStateIcon({
  status,
  flowType = "approval",
  className,
}: WorkflowStateIconProps) {
  const definition = STATE_DEFINITIONS[status];
  return (
    <span
      className={joinClassNames("inline-flex shrink-0 items-center justify-center", ICON_TONE_CLASS[definition.tone], className)}
      title={`${getWorkflowFlowTypeLabel(flowType)}：${getWorkflowStatusLabel(status, flowType)}`}
    >
      <ActionGlyph kind={definition.icon} className="h-4 w-4" />
    </span>
  );
}

export default function WorkflowStatusBadge({
  status,
  flowType = "approval",
  size = "md",
  className,
}: WorkflowStatusBadgeProps) {
  const definition = STATE_DEFINITIONS[status];
  const label = getWorkflowStatusLabel(status, flowType);
  return (
    <span
      className={joinClassNames(
        "inline-flex shrink-0 items-center gap-1 rounded ring-1 ring-inset",
        size === "sm" ? "px-1.5 py-0.5 text-[11px] font-medium" : "px-2 py-1 text-xs font-semibold",
        BADGE_TONE_CLASS[definition.tone],
        className,
      )}
      title={`${getWorkflowFlowTypeLabel(flowType)}：${label}`}
    >
      <ActionGlyph kind={definition.icon} className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      <span>{label}</span>
    </span>
  );
}
