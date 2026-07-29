import { createCommandRoute } from "@workspace/platform/server/api-route";
import {
  buildLinkFinanceAssetPeriodVoucherRouteCommand,
  executeLinkFinanceAssetPeriodVoucherRouteCommand,
} from "@workspace/finance/server/assets/route-commands";
import { linkFinanceAssetPeriodVoucherSchema } from "@workspace/finance/server/assets/schemas";

export const PUT = createCommandRoute({
  bodySchema: linkFinanceAssetPeriodVoucherSchema,
  bodyError: "折旧摊销凭证关联参数无效",
  buildCommand: ({ body }) => buildLinkFinanceAssetPeriodVoucherRouteCommand(body),
  action: executeLinkFinanceAssetPeriodVoucherRouteCommand,
});
