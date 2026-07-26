import { libraryAgentTools, libraryWecomAgentTools } from "@workspace/library/server/agent-tools";
import { createAgentDomainRpcHandler } from "@workspace/platform/server/agent/remote-domain-rpc";

export const POST = createAgentDomainRpcHandler({
  unitId: "library",
  catalogs: { default: libraryAgentTools, wecom: libraryWecomAgentTools },
});
