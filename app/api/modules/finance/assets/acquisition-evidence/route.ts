import { createCommandRoute } from "@workspace/platform/server/api-route";
import {
  buildConfirmFinanceAssetAcquisitionEvidenceRouteCommand,
  executeConfirmFinanceAssetAcquisitionEvidenceRouteCommand,
} from "@workspace/finance/server/assets/route-commands";
import { confirmFinanceAssetAcquisitionEvidenceSchema } from "@workspace/finance/server/assets/schemas";

export const POST = createCommandRoute({
  bodySchema: confirmFinanceAssetAcquisitionEvidenceSchema,
  bodyError: "资产取得证据参数无效",
  buildCommand: ({ body, user }) => buildConfirmFinanceAssetAcquisitionEvidenceRouteCommand(body, user.userId),
  action: executeConfirmFinanceAssetAcquisitionEvidenceRouteCommand,
});
