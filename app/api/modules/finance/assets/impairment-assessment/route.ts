import { createCommandRoute } from "@workspace/platform/server/api-route";
import {
  buildConfirmFinanceAssetImpairmentAssessmentRouteCommand,
  executeConfirmFinanceAssetImpairmentAssessmentRouteCommand,
} from "@workspace/finance/server/assets/route-commands";
import { confirmFinanceAssetImpairmentAssessmentSchema } from "@workspace/finance/server/assets/schemas";

export const PUT = createCommandRoute({
  bodySchema: confirmFinanceAssetImpairmentAssessmentSchema,
  bodyError: "资产减值评估参数无效",
  buildCommand: ({ body, user }) => buildConfirmFinanceAssetImpairmentAssessmentRouteCommand(body, user.userId),
  action: executeConfirmFinanceAssetImpairmentAssessmentRouteCommand,
});
