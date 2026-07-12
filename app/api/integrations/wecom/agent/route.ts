import { financeAgentTools } from "@workspace/finance/server/agent-tools";
import { hrAgentTools } from "@workspace/hr/server/agent-tools";
import { libraryAgentTools } from "@workspace/library/server/agent-tools";
import { createLibraryAgentDelivery } from "@workspace/library/server/agent-delivery";
import {
  createWecomAgentFileArtifact,
  handleParsedAgentMessageRequest,
  sourceCodeAgentTools,
  toParsedAgentRequest,
  wecomGroupConversationTool,
} from "@workspace/platform/server/agent";
import { withWecomAgentBridgeAccess } from "@workspace/platform/server/with-auth";

export const runtime = "nodejs";

export const POST = withWecomAgentBridgeAccess(async (request, input, user) => {
  const tools = input.chatType === "group"
    ? [wecomGroupConversationTool]
    : [...sourceCodeAgentTools, ...hrAgentTools, ...financeAgentTools, ...libraryAgentTools];
  const response = await handleParsedAgentMessageRequest(
    toParsedAgentRequest(input),
    user,
    tools,
    request.signal,
  );
  if (input.chatType !== "single" || !response.ok) return response;

  let payload: Record<string, unknown>;
  try {
    payload = await response.clone().json() as Record<string, unknown>;
  } catch {
    return response;
  }

  try {
    const delivery = await createLibraryAgentDelivery({
      message: input.message,
      data: payload.data,
      userId: user.id,
    });
    if (delivery.status === "none") return response;
    if (delivery.status === "denied") {
      return Response.json({
        ...payload,
        message: "当前账号没有资料导出权限，无法发送资料包。",
      }, { status: response.status });
    }
    return Response.json({
      ...payload,
      artifact: createWecomAgentFileArtifact({
        artifactId: delivery.artifactId,
        userId: user.id,
        fileName: delivery.fileName,
        fileSizeBytes: delivery.fileSizeBytes,
        itemCount: delivery.itemCount,
      }),
    }, { status: response.status });
  } catch (error) {
    console.error("[wecom-agent] library bundle creation failed", error instanceof Error ? error.message : error);
    return Response.json({
      ...payload,
      type: "error",
      message: "资料包生成失败，请稍后重试。",
    }, { status: response.status });
  }
});
