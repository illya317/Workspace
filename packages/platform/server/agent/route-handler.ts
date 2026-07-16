import { NextResponse } from "next/server";
import { jsonErrorResponse } from "@workspace/platform/server/api";
import type { SessionUser } from "@workspace/platform/types";

import type { AgentExecutionContext } from "./execution";
import { AgentExecutionError, resolveAgentExecutionContext } from "./execution-context";
import {
  agentRuntimeAbortKindFromError,
  agentRuntimePartialResponseFromError,
  agentRuntimeTelemetryFromError,
  type AgentInputImage,
  type AgentResponse,
  type HistoryMessage,
} from "./runtime/contracts";
import { buildAgentIdentityAnswer, buildAgentIdentityContext } from "./identity-context";
import { processMessage } from "./orchestrator";
import { cancelProposal } from "./proposals";
import { parseAgentRequest, type ParsedAgentRequest } from "./route-input";
import { agentRunTerminalDecision, normalizeAgentResponseForTerminalOutcome } from "./run-status";
import {
  appendAgentSessionMessage,
  buildAgentHistory,
  buildContextualAgentMessage,
  compactAgentSessionIfNeeded,
  linkAgentProposalToSession,
  prepareAgentSession,
  storeAgentSessionImages,
  toStoredImageAttachment,
  type AgentSessionRow,
} from "./sessions";
import { createAgentStreamResponse } from "./stream-response";
import { finishAgentRun, startAgentRun } from "./run-audit";
import type { AgentTool } from "./tools";

export type AgentMessagePayload = AgentResponse & {
  session: { id: string; summaryShort: string | null };
  [key: string]: unknown;
};

type AgentMessageTransform = (
  result: AgentMessagePayload,
) => AgentMessagePayload | Promise<AgentMessagePayload>;

type PreparedAgentTurn = {
  agentMessage: string;
  history: HistoryMessage[];
  images: AgentInputImage[];
  session: AgentSessionRow;
  execution: AgentExecutionContext;
};

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

async function prepareAgentTurn(
  parsed: ParsedAgentRequest,
  user: SessionUser,
): Promise<{ ok: true; turn: PreparedAgentTurn } | { ok: false; response: Response }> {
  const { body, imageFiles } = parsed;
  let execution: AgentExecutionContext;
  try {
    execution = await resolveAgentExecutionContext(user, body.agentProfileId);
  } catch (error) {
    if (error instanceof AgentExecutionError) {
      return { ok: false, response: jsonErrorResponse(error.message, error.status) };
    }
    throw error;
  }
  const fallbackHistory: HistoryMessage[] = Array.isArray(body.history)
    ? body.history.map((item) => ({ role: item.role, content: item.content }))
    : [];
  const preparedSession = await prepareAgentSession(user, {
    sessionId: body.sessionId,
    agentProfileId: execution.profile?.id ?? null,
    contextLabel: body.context?.contextLabel,
    path: body.context?.path,
    title: body.context?.title,
  });
  const history = buildAgentHistory(preparedSession, fallbackHistory);

  let images: AgentInputImage[] = [];
  try {
    images = imageFiles.length > 0
      ? await storeAgentSessionImages(preparedSession.session, imageFiles)
      : [];
  } catch (error) {
    return {
      ok: false,
      response: jsonErrorResponse(error instanceof Error ? error.message : "图片上传失败", 400),
    };
  }

  const question = body.message.trim() || "请查看我上传的图片。";
  const agentMessage = buildContextualAgentMessage(question, preparedSession.session, body.context);
  const session = await appendAgentSessionMessage(preparedSession.session, {
    role: "user",
    content: question,
    attachments: images.map(toStoredImageAttachment),
  }, user);

  return { ok: true, turn: { agentMessage, history, images, session, execution } };
}

async function executeAgentTurn(
  turn: PreparedAgentTurn,
  tools: AgentTool[],
  signal: AbortSignal,
  onTextDelta?: (delta: string) => void,
  transformResult?: AgentMessageTransform,
): Promise<AgentMessagePayload> {
  let session = turn.session;
  const runId = await startAgentRun(turn.execution, session);
  const execution = { ...turn.execution, runId };
  let response: AgentResponse | undefined;
  let proposalId: number | undefined;
  try {
    response = await processMessage(
      turn.agentMessage,
      execution,
      tools,
      turn.history,
      {
        images: turn.images,
        signal,
        identityContext: buildAgentIdentityContext(execution),
        identityAnswer: buildAgentIdentityAnswer(execution),
        onTextDelta,
      },
    );
    proposalId = response.proposal?.id;
    if (transformResult) {
      response = await transformResult({
        ...response,
        session: { id: session.id, summaryShort: session.summaryShort },
      });
      proposalId ??= response.proposal?.id;
    }
    const terminal = agentRunTerminalDecision(response);
    if (proposalId) {
      await linkAgentProposalToSession(proposalId, session, execution.requester);
      const proposalRemainsVisible = terminal.status === "succeeded"
        && response.type === "proposal"
        && response.proposal?.id === proposalId;
      if (!proposalRemainsVisible) await cancelProposal(proposalId, execution.requester);
    }
    response = normalizeAgentResponseForTerminalOutcome(response);
    session = await appendAgentSessionMessage(session, {
      role: "agent",
      content: response.message,
      responseType: response.type,
      proposal: response.proposal,
      proposalStatus: response.proposal ? "pending" : undefined,
    }, execution.requester);
    const compacted = await compactAgentSessionIfNeeded(session, execution.requester);
    await finishAgentRun(runId, {
      status: terminal.status,
      toolKey: response.toolUsed,
      resultType: response.type,
      proposalId,
      errorMessage: terminal.errorMessage,
      telemetry: response.telemetry,
    });
    return {
      ...response,
      session: { id: compacted.id, summaryShort: compacted.summaryShort },
    };
  } catch (error) {
    response ??= agentRuntimePartialResponseFromError(error);
    proposalId ??= response?.proposal?.id;
    const telemetry = agentRuntimeTelemetryFromError(error) ?? response?.telemetry;
    if (proposalId) {
      await linkAgentProposalToSession(proposalId, session, execution.requester).catch(() => undefined);
      await cancelProposal(proposalId, execution.requester).catch(() => undefined);
    }
    const abortKind = agentRuntimeAbortKindFromError(error);
    if (abortKind || isAbortError(error) || signal.aborted) {
      const timedOut = abortKind === "runtime_timeout";
      await finishAgentRun(runId, {
        status: timedOut ? "failed" : "aborted",
        toolKey: response?.toolUsed,
        resultType: "error",
        proposalId,
        errorMessage: error instanceof Error && error.message ? error.message : "请求已中止",
        telemetry,
      });
      return {
        type: "error",
        message: timedOut ? "处理请求超时，请重试。" : "请求已中止。",
        session: { id: session.id, summaryShort: session.summaryShort },
      };
    }
    const message = error instanceof Error ? error.message : "Internal error";
    console.error("[agent] processMessage error:", message);
    await finishAgentRun(runId, {
      status: "failed",
      toolKey: response?.toolUsed,
      resultType: "error",
      proposalId,
      errorMessage: message,
      telemetry,
    });
    session = await appendAgentSessionMessage(session, {
      role: "agent",
      content: `处理请求时出错：${message}`,
      responseType: "error",
    }, execution.requester).catch(() => session);
    return {
      type: "error",
      message: `处理请求时出错：${message}`,
      session: { id: session.id, summaryShort: session.summaryShort },
    };
  }
}

export async function handleAgentMessageRequest(
  request: Request,
  user: SessionUser,
  tools: AgentTool[],
): Promise<Response> {
  const parsed = await parseAgentRequest(request);
  if (!parsed.ok) return parsed.response;
  return handleParsedAgentMessageRequest(parsed, user, tools, request.signal);
}

export async function handleParsedAgentMessageRequest(
  parsed: ParsedAgentRequest,
  user: SessionUser,
  tools: AgentTool[],
  signal: AbortSignal,
): Promise<Response> {
  const prepared = await prepareAgentTurn(parsed, user);
  if (!prepared.ok) return prepared.response;
  return NextResponse.json(await executeAgentTurn(prepared.turn, tools, signal));
}

export async function handleParsedAgentMessageStreamRequest(
  parsed: ParsedAgentRequest,
  user: SessionUser,
  tools: AgentTool[],
  requestSignal: AbortSignal,
  transformResult?: AgentMessageTransform,
): Promise<Response> {
  const prepared = await prepareAgentTurn(parsed, user);
  if (!prepared.ok) return prepared.response;

  return createAgentStreamResponse(requestSignal, async ({ emitDelta, signal }) => {
    return executeAgentTurn(prepared.turn, tools, signal, emitDelta, transformResult);
  });
}
