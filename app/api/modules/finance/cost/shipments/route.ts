import { okCommand } from "@workspace/platform/server/domain-validation";import { createCommandRoute } from "@workspace/platform/server/api-route";
import { costQuerySchema, listShipments, getShipmentSummary } from "@workspace/finance/server/cost";

export const GET = createCommandRoute({
  querySchema: costQuerySchema,
  queryError: "参数无效",
  buildCommand: ({ query }) => okCommand(query),
  action: async (command) => {
    const [list, summary] = await Promise.all([
      listShipments(command),
      getShipmentSummary(command),
    ]);
    return { success: true, ...list, summary };
  },
});
