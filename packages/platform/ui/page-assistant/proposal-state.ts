import type { AssistantProposalStatus } from "./types";

export function parseAssistantProposalStatus(value: unknown): AssistantProposalStatus | null {
  if (
    value === "pending"
    || value === "executing"
    || value === "confirmed"
    || value === "cancelled"
    || value === "failed"
    || value === "expired"
  ) return value;
  return null;
}

export function proposalCanSettle(status: AssistantProposalStatus | undefined) {
  return status === "pending";
}

export function proposalStatusLabel(status: AssistantProposalStatus | undefined) {
  switch (status) {
    case "pending": return "待确认";
    case "executing": return "执行中";
    case "confirmed": return "已确认";
    case "cancelled": return "已取消";
    case "failed": return "执行失败";
    case "expired": return "已过期";
    default: return "状态未知";
  }
}

export function successfulSettlementStatus(
  action: "confirm" | "cancel",
  responseStatus: unknown,
): AssistantProposalStatus {
  return parseAssistantProposalStatus(responseStatus) ?? (action === "confirm" ? "confirmed" : "cancelled");
}
