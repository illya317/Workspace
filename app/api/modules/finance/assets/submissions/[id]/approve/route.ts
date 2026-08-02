import { buildFinanceAssetSubmissionActionRouteCommand, executeApproveFinanceAssetSubmissionRouteCommand } from "@workspace/finance/server/assets/approvals";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { financeAssetSubmissionActionBodySchema } from "../../route-schemas";

export const POST = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "建卡审批单 ID 无效",
  bodySchema: financeAssetSubmissionActionBodySchema,
  optionalJsonBody: true,
  bodyError: "审批参数无效",
  buildCommand: ({ params, body, user }) => buildFinanceAssetSubmissionActionRouteCommand({ userId: user.userId, requestId: params.id, version: body?.version, comment: body?.comment }),
  action: executeApproveFinanceAssetSubmissionRouteCommand,
});
