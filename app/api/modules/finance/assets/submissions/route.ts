import { z } from "zod";
import {
  buildListFinanceAssetSubmissionsRouteCommand,
  executeListFinanceAssetSubmissionsRouteCommand,
} from "@workspace/finance/server/assets/approvals";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const querySchema = z.object({ status: z.string().optional() });

export const GET = createCommandRoute({
  querySchema,
  queryError: "建卡审批查询参数无效",
  buildCommand: ({ query, user }) => buildListFinanceAssetSubmissionsRouteCommand({ userId: user.userId, status: query.status }),
  action: executeListFinanceAssetSubmissionsRouteCommand,
});
