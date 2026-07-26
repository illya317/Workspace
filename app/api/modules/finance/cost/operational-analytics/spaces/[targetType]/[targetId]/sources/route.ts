import {
  listOperationalAnalysisSources,
  operationalAnalysisTemplateRouteParamsSchema,
} from "@workspace/finance/server/cost";
import { registerFinanceWorkSpaceAccessProvider } from "@workspace/finance/server/cost/work-space-access-provider";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

registerFinanceWorkSpaceAccessProvider();

export const GET = createCommandRoute({
  paramsSchema: operationalAnalysisTemplateRouteParamsSchema,
  paramsError: "经营分析空间参数无效",
  buildCommand: ({ params, user, request }) => okCommand({
    userId: user.userId,
    scopeType: params.targetType,
    scopeId: params.targetId,
    viaApiKey: Boolean(request.headers.get("x-api-key")),
  }),
  action: ({ userId, scopeType, scopeId, viaApiKey }) => listOperationalAnalysisSources(
    userId,
    { scopeType, scopeId },
    { viaApiKey },
  ),
});
