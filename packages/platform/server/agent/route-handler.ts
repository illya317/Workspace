import { NextResponse } from "next/server";
import { jsonErrorResponse } from "@workspace/platform/server/api";
import type { SessionUser } from "@workspace/platform/types";

import type { AgentInputImage, HistoryMessage } from "./runtime/contracts";
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
} from "./sessions";
import type { AgentTool } from "./tools";

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

export async function handleAgentMessageRequest(request: Request, user: SessionUser, tools: AgentTool[]): Promise<Response> {
  const parsed = await parseAgentRequest(request);
  if (!parsed.ok) return parsed.response;

  return handleParsedAgentMessageRequest(parsed, user, tools, request.signal);
}

export async function handleParsedAgentMessageRequest(parsed: ParsedAgentRequest, user: SessionUser, tools: AgentTool[], signal: AbortSignal): Promise<Response> {
  const { body, imageFiles } = parsed;

  const fallbackHistory: HistoryMessage[] = [];
  if (Array.isArray(body.history)) {
    for (const h of body.history) {
      fallbackHistory.push({ role: h.role, content: h.content });
    }
  }

  const preparedSession = await prepareAgentSession(user, {
    sessionId: body.sessionId,
    contextLabel: body.context?.contextLabel,
    path: body.context?.path,
    title: body.context?.title,
  });
  const history = buildAgentHistory(preparedSession, fallbackHistory);
  let uploadedImages: AgentInputImage[] = [];
  try {
    uploadedImages = imageFiles.length > 0
      ? await storeAgentSessionImages(preparedSession.session, imageFiles)
      : [];
  } catch (error) {
    return jsonErrorResponse(error instanceof Error ? error.message : "图片上传失败", 400);
  }

  const question = body.message.trim() || "请查看我上传的图片。";
  const agentMessage = buildContextualAgentMessage(question, preparedSession.session, body.context);
  let session = await appendAgentSessionMessage(preparedSession.session, {
    role: "user",
    content: question,
    attachments: uploadedImages.map(toStoredImageAttachment),
  }, user);

  try {
    const response = await processMessage(
      agentMessage,
      user,
      tools,
      history,
      {
        images: uploadedImages,
        signal,
        identityContext: buildAgentIdentityContext(user),
        identityAnswer: buildAgentIdentityAnswer(user),
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
    const compactedSession = await compactAgentSessionIfNeeded(session, user);
    return NextResponse.json({
      ...response,
      session: { id: compactedSession.id, summaryShort: compactedSession.summaryShort },
    });
  } catch (err) {
    if (isAbortError(err) || signal.aborted) {
      return NextResponse.json({
        type: "error",
        message: "请求已中止。",
        session: { id: session.id, summaryShort: session.summaryShort },
      }, { status: 499 });
    }
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[agent] processMessage error:", message);
    session = await appendAgentSessionMessage(session, {
      role: "agent",
      content: `处理请求时出错：${message}`,
      responseType: "error",
    }, user);
    return NextResponse.json({
      type: "error",
      message: `处理请求时出错：${message}`,
      session: { id: session.id, summaryShort: session.summaryShort },
    }, { status: 200 });
  }
}
