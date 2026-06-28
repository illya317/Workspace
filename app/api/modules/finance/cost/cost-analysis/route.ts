import { okCommand } from "@workspace/platform/server/domain-validation";
import { checkFinanceCostAccess } from "@workspace/platform/server/auth";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { costQuerySchema, listCostAnalysis, getCostAnalysisSummary } from "@workspace/finance/server/cost";

export const GET = createCommandRoute({
  access: checkFinanceCostAccess,
  querySchema: costQuerySchema,
  queryError: "参数无效",
  buildCommand: ({ query }) => okCommand(query),
  action: async (command) => {
    const [list, summary] = await Promise.all([
      listCostAnalysis(command),
      getCostAnalysisSummary(command),
    ]);
    return { success: true, ...list, summary };
  },
});
