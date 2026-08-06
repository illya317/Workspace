import {
  buildCreateComparisonRunRouteCommand,
  executeCreateComparisonRunRouteCommand,
} from "@workspace/finance/server/statements/comparison/route-commands";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";

// :id 是 mappingId：对比运行由已确认映射创建；rerun 只新建不可变记录。
export const POST = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  buildCommand: ({ params, user }) => buildCreateComparisonRunRouteCommand({
    mappingId: params.id,
    userId: user.userId,
  }),
  action: (command) => executeCreateComparisonRunRouteCommand(command),
});
