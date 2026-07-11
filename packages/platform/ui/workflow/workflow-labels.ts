import type { ActionGlyphActionKey, ActionGlyphKind } from "@workspace/core/ui";
import type { WorkflowActionCommandKind, WorkflowActionPlacement } from "./types";

export function workflowActionCommandIcon(kind: WorkflowActionCommandKind): ActionGlyphKind {
  if (kind === "save") return "save";
  if (kind === "direct") return "send";
  if (kind === "submit" || kind === "resubmit") return "send";
  if (kind === "withdraw") return "withdraw";
  if (kind === "cancel") return "cancel";
  if (kind === "revise") return "revise";
  if (kind === "approve") return "approve";
  if (kind === "reject") return "reject";
  if (kind === "open") return "view";
  return "send";
}

export function workflowActionCommandAction(kind: WorkflowActionCommandKind): ActionGlyphActionKey {
  if (kind === "save") return "save";
  if (kind === "direct" || kind === "submit" || kind === "resubmit") return "submit";
  if (kind === "withdraw") return "reverse";
  if (kind === "cancel") return "cancel";
  if (kind === "revise") return "revise";
  if (kind === "approve") return "approve";
  if (kind === "reject") return "reject";
  return "open";
}

export function workflowPlacementDensity(placement: WorkflowActionPlacement) {
  return placement === "row" || placement === "toolbar" ? "compact" : "normal";
}
