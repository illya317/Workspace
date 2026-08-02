import { createCommandRoute } from "@workspace/platform/server/api-route";
import {
  buildFinanceAssetPeriodReplayPreviewRouteCommand,
  executeFinanceAssetPeriodReplayPreviewRouteCommand,
} from "@workspace/finance/server/assets/period-replay-preview-route-command";
import { financeAssetPeriodReplayPreviewSchema } from "@workspace/finance/server/assets/period-replay-preview-schema";

export const POST = createCommandRoute({
  bodySchema: financeAssetPeriodReplayPreviewSchema,
  bodyError: "资产期初至期末重放预览参数无效",
  buildCommand: ({ body }) => buildFinanceAssetPeriodReplayPreviewRouteCommand(body),
  action: executeFinanceAssetPeriodReplayPreviewRouteCommand,
});
