import {
  createWecomAgentFileArtifact,
  handleParsedAgentMessageStreamRequest,
  parseWecomLibraryDeliveryReadyData,
  sourceCodeAgentTools,
  toParsedAgentRequest,
  wecomGroupConversationTool,
} from "@workspace/platform/server/agent";
import { loadRemoteAgentTools } from "@workspace/platform/server/agent/remote-domain-rpc";
import { withWecomAgentBridgeAccess } from "@workspace/platform/server/with-auth";
import { docsEditorAgentTools } from "@workspace/platform/server/docs-editor";

export const runtime = "nodejs";
export const maxDuration = 900;

export const POST = withWecomAgentBridgeAccess(async (request, input, user) => {
  const domainTools = await loadRemoteAgentTools({ libraryCatalog: "wecom" });
  const tools = input.chatType === "group"
    ? [wecomGroupConversationTool]
    : [...sourceCodeAgentTools, ...domainTools, ...docsEditorAgentTools];
  return handleParsedAgentMessageStreamRequest(
    toParsedAgentRequest(input),
    user,
    tools,
    request.signal,
    input.chatType !== "single" ? undefined : async (payload) => {
      if (payload.toolUsed !== "library.deliverDocuments") return payload;
      const delivery = parseWecomLibraryDeliveryReadyData(payload.data);
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
