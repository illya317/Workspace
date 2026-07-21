import { financeAgentTools } from "@workspace/finance/server/agent-tools";
import { hrAgentTools } from "@workspace/hr/server/agent-tools";
import { workAgentTools } from "@workspace/work/server/agent-tools";
import { libraryWecomAgentTools } from "@workspace/library/server/agent-tools";
import { libraryDeliveryReadyData } from "@workspace/library/server/agent-delivery";
import {
  createWecomAgentFileArtifact,
  handleParsedAgentMessageStreamRequest,
  sourceCodeAgentTools,
  toParsedAgentRequest,
  wecomGroupConversationTool,
} from "@workspace/platform/server/agent";
import { withWecomAgentBridgeAccess } from "@workspace/platform/server/with-auth";
import { docsEditorAgentTools } from "@workspace/platform/server/docs-editor";

export const runtime = "nodejs";
export const maxDuration = 900;

export const POST = withWecomAgentBridgeAccess(async (request, input, user) => {
  const tools = input.chatType === "group"
    ? [wecomGroupConversationTool]
    : [...sourceCodeAgentTools, ...workAgentTools, ...hrAgentTools, ...financeAgentTools, ...libraryWecomAgentTools, ...docsEditorAgentTools];
  return handleParsedAgentMessageStreamRequest(
    toParsedAgentRequest(input),
    user,
    tools,
    request.signal,
    input.chatType !== "single" ? undefined : async (payload) => {
      if (payload.toolUsed !== "library.deliverDocuments") return payload;
      const delivery = libraryDeliveryReadyData(payload.data);
      if (!delivery) return { ...payload, type: "error", message: "资料发送结果无效，请重新确认资料范围。", data: undefined };
      return {
        ...payload,
        message: delivery.mode === "files"
          ? `已确认发送 ${delivery.artifacts.length} 份“${delivery.query}”资料。`
          : `已确认发送“${delivery.query}”资料压缩包（${delivery.artifacts[0]?.itemCount ?? 0} 份）。`,
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
    },
  );
});
