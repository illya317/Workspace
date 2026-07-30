import { authorize } from "@workspace/platform/server/auth";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import {
  buildCompleteFinanceCloseRouteCommand,
  executeCompleteFinanceCloseRouteCommand,
} from "@workspace/finance/server/close/route-commands";
import { completeFinanceCloseSchema } from "@workspace/finance/server/close/schemas";

export const POST = createCommandRoute({
  bodySchema: completeFinanceCloseSchema,
  bodyError: "完成关账运行参数无效",
  access: (userId: number) => authorize({ user: userId, resourceKey: "finance.ledger", action: "approve" }),
  accessError: "无关账完成权限",
  buildCommand: ({ body, user }) => buildCompleteFinanceCloseRouteCommand(body, user.userId),
  action: executeCompleteFinanceCloseRouteCommand,
});
