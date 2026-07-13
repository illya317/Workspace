import { financeAgentTools } from "@workspace/finance/server/agent-tools";
import { hrAgentTools } from "@workspace/hr/server/agent-tools";
import { libraryAgentTools } from "@workspace/library/server/agent-tools";
import { createLibraryAgentDelivery } from "@workspace/library/server/agent-delivery";
import {
  createWecomAgentFileArtifact,
  handleParsedAgentMessageStreamRequest,
  readAgentSessionMessagesForUser,
  sourceCodeAgentTools,
  toParsedAgentRequest,
  wecomGroupConversationTool,
} from "@workspace/platform/server/agent";
import { withWecomAgentBridgeAccess } from "@workspace/platform/server/with-auth";

export const runtime = "nodejs";
export const maxDuration = 900;

export const POST = withWecomAgentBridgeAccess(async (request, input, user) => {
  const priorMessages = input.chatType === "single"
    ? await readAgentSessionMessagesForUser(input.sessionId, user)
    : [];
  const tools = input.chatType === "group"
    ? [wecomGroupConversationTool]
    : [...sourceCodeAgentTools, ...hrAgentTools, ...financeAgentTools, ...libraryAgentTools];
  return handleParsedAgentMessageStreamRequest(
    toParsedAgentRequest(input),
    user,
    tools,
    request.signal,
    input.chatType !== "single" ? undefined : async (payload) => {
      try {
        const delivery = await createLibraryAgentDelivery({
          message: input.message,
          userId: user.id,
          history: priorMessages.map((message) => ({ role: message.role, content: message.content })),
        });
        if (delivery.status === "none") return payload;
        if (delivery.status === "denied") {
          return { ...payload, message: "当前账号没有资料导出权限，无法发送资料包。" };
        }
        if (delivery.status === "empty") {
          return { ...payload, type: "answer", message: delivery.message, data: undefined };
        }
        return {
          ...payload,
          message: delivery.mode === "files"
            ? `已找到 ${delivery.artifacts.length} 份“${delivery.query}”资料，正在发送原始文件。`
            : `已按“${delivery.query}”生成 ${delivery.artifacts[0]?.itemCount ?? 0} 份资料的临时压缩包。`,
          data: undefined,
          artifacts: delivery.artifacts.map((artifact) => createWecomAgentFileArtifact({
            source: artifact.source,
            artifactId: artifact.artifactId,
            userId: user.id,
            fileName: artifact.fileName,
            fileSizeBytes: artifact.fileSizeBytes,
            itemCount: artifact.itemCount,
          })),
        };
      } catch (error) {
        console.error("[wecom-agent] library bundle creation failed", error instanceof Error ? error.message : error);
        return { ...payload, type: "error", message: "资料包生成失败，请稍后重试。" };
      }
    },
  );
});
