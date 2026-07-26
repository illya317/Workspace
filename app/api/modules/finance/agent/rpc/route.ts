import {
  financeAgentTools,
  financeOperationalAnalysisProposalExecutors,
} from "@workspace/finance/server/agent-tools";
import { registerFinanceWorkSpaceAccessProvider } from "@workspace/finance/server/cost/work-space-access-provider";
import { createAgentDomainRpcHandler } from "@workspace/platform/server/agent/remote-domain-rpc";

registerFinanceWorkSpaceAccessProvider();

export const POST = createAgentDomainRpcHandler({
  unitId: "finance",
  catalogs: { default: financeAgentTools },
  proposalExecutors: financeOperationalAnalysisProposalExecutors,
});
