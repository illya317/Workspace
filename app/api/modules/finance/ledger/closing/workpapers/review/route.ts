import { createCommandRoute } from "@workspace/platform/server/api-route";
import { authorize } from "@workspace/platform/server/auth";
import {
  buildReviewFinanceCloseWorkpaperRouteCommand,
  executeReviewFinanceCloseWorkpaperRouteCommand,
} from "@workspace/finance/server/close/workpaper-route-commands";
import { reviewFinanceCloseWorkpaperSchema } from "@workspace/finance/server/close/workpaper-schemas";

export const POST = createCommandRoute({
  bodySchema: reviewFinanceCloseWorkpaperSchema,
  bodyError: "关账底稿复核参数无效",
  access: (userId: number) => authorize({ user: userId, resourceKey: "finance.ledger", action: "approve" }),
  accessError: "无关账底稿复核权限",
  buildCommand: ({ body, user }) => buildReviewFinanceCloseWorkpaperRouteCommand(body, user.userId),
  action: (command) => executeReviewFinanceCloseWorkpaperRouteCommand(command),
});
