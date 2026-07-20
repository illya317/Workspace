import { workspacePath } from "@workspace/core/routing";

import {
  parseAssistantProposalStatus,
  successfulSettlementStatus,
} from "./proposal-state";
import type { AssistantProposalStatus } from "./types";

type ProposalSettlementAction = "confirm" | "cancel";

export type ProposalSettlementOutcome = {
  ok: boolean;
  message: string;
  status: AssistantProposalStatus | null;
};

function bodyMessage(body: unknown) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const value = body as { message?: unknown; error?: unknown };
  if (typeof value.message === "string" && value.message) return value.message;
  if (typeof value.error === "string" && value.error) return value.error;
  return null;
}

function bodyStatus(body: unknown) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  return parseAssistantProposalStatus((body as { status?: unknown }).status);
}

async function safeJson(response: Response) {
  try {
    return await response.json() as unknown;
  } catch {
    return null;
  }
}

export async function requestProposalSettlement(
  proposalId: number,
  action: ProposalSettlementAction,
  fetcher: typeof fetch = fetch,
): Promise<ProposalSettlementOutcome> {
  let failureMessage = "处理失败";
  try {
    const response = await fetcher(workspacePath(`/api/agent/proposals/${proposalId}/${action}`), {
      method: "POST",
    });
    const body = await safeJson(response);
    if (response.ok) {
      return {
        ok: true,
        message: bodyMessage(body) || (action === "confirm" ? "变更已执行。" : "变更已取消。"),
        status: successfulSettlementStatus(action, bodyStatus(body)),
      };
    }
    failureMessage = bodyMessage(body) || failureMessage;
  } catch (error) {
    failureMessage = error instanceof Error ? error.message : failureMessage;
  }

  let status: AssistantProposalStatus | null = null;
  try {
    const response = await fetcher(workspacePath(`/api/agent/proposals/${proposalId}`));
    if (response.ok) status = bodyStatus(await safeJson(response));
  } catch {
    // Status refresh is a recovery aid; preserve the original settlement error.
  }
  return { ok: false, message: failureMessage, status };
}
