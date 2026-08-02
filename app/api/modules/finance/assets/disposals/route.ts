import { createCommandRoute } from "@workspace/platform/server/api-route";
import {
  buildConfirmFinanceAssetDisposalRouteCommand,
  executeConfirmFinanceAssetDisposalRouteCommand,
} from "@workspace/finance/server/assets/route-commands";
import { confirmFinanceAssetDisposalSchema } from "@workspace/finance/server/assets/schemas";

export const POST = createCommandRoute({
  bodySchema: confirmFinanceAssetDisposalSchema,
  bodyError: "资产处置参数无效",
  buildCommand: ({ body, user }) => buildConfirmFinanceAssetDisposalRouteCommand(body, user.userId),
  action: executeConfirmFinanceAssetDisposalRouteCommand,
});
