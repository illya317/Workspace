import { NextResponse } from "next/server";
import { jsonErrorResponse } from "@workspace/platform/server/api";
import type { SessionUser } from "@workspace/platform/types";

import type { AgentInputImage, AgentResponse, HistoryMessage } from "./runtime/contracts";
import { buildAgentIdentityAnswer, buildAgentIdentityContext } from "./identity-context";
import { processMessage } from "./orchestrator";
import { parseAgentRequest, type ParsedAgentRequest } from "./route-input";
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
};

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

async function prepareAgentTurn(
  parsed: ParsedAgentRequest,
  user: SessionUser,
): Promise<{ ok: true; turn: PreparedAgentTurn } | { ok: false; response: Response }> {
  const { body, imageFiles } = parsed;
  const fallbackHistory: HistoryMessage[] = Array.isArray(body.history)
    ? body.history.map((item) => ({ role: item.role, content: item.content }))
    : [];
  const preparedSession = await prepareAgentSession(user, {
    sessionId: body.sessionId,
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

  return { ok: true, turn: { agentMessage, history, images, session } };
}

async function executeAgentTurn(
  turn: PreparedAgentTurn,
  user: SessionUser,
  tools: AgentTool[],
  signal: AbortSignal,
  onTextDelta?: (delta: string) => void,
): Promise<AgentMessagePayload> {
  let session = turn.session;
  try {
    const response = await processMessage(
      turn.agentMessage,
      user,
      tools,
      turn.history,
      {
        images: turn.images,
        signal,
        identityContext: buildAgentIdentityContext(user),
        identityAnswer: buildAgentIdentityAnswer(user),
        onTextDelta,
      },
    );
    await linkAgentProposalToSession(response.proposal?.id, session, user);
    session = await appendAgentSessionMessage(session, {
      role: "agent",
      content: response.message,
      responseType: response.type,
      proposal: response.proposal,
      proposalStatus: response.proposal ? "pending" : undefined,
    }, user);
    const compacted = await compactAgentSessionIfNeeded(session, user);
    return {
      ...response,
      session: { id: compacted.id, summaryShort: compacted.summaryShort },
    };
  } catch (error) {
    if (isAbortError(error) || signal.aborted) {
      return {
        type: "error",
        message: "请求已中止。",
        session: { id: session.id, summaryShort: session.summaryShort },
      };
    }
    const message = error instanceof Error ? error.message : "Internal error";
    console.error("[agent] processMessage error:", message);
    session = await appendAgentSessionMessage(session, {
      role: "agent",
      content: `处理请求时出错：${message}`,
      responseType: "error",
    }, user);
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
  return NextResponse.json(await executeAgentTurn(prepared.turn, user, tools, signal));
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
    const result = await executeAgentTurn(prepared.turn, user, tools, signal, emitDelta);
    return transformResult ? transformResult(result) : result;
  });
}
