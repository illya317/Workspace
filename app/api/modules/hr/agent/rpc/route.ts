import { hrAgentProposalExecutors, hrAgentTools } from "@workspace/hr/server/agent-tools";
import { createAgentDomainRpcHandler } from "@workspace/platform/server/agent/remote-domain-rpc";

export const POST = createAgentDomainRpcHandler({
  unitId: "hr",
  catalogs: { default: hrAgentTools },
  proposalExecutors: hrAgentProposalExecutors,
});
