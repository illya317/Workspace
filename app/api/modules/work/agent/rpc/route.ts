import { createAgentDomainRpcHandler } from "@workspace/platform/server/agent/remote-domain-rpc";
import { workAgentTools, workItemAgentProposalExecutors } from "@workspace/work/server/agent-tools";

export const POST = createAgentDomainRpcHandler({
  unitId: "work",
  catalogs: { default: workAgentTools },
  proposalExecutors: workItemAgentProposalExecutors,
});
