import { createCommandRoute } from "@workspace/platform/server/api-route";
import { authorize } from "@workspace/platform/server/auth";
import {
  buildReadFinanceCloseWorkpapersRouteCommand,
  buildSaveFinanceCloseWorkpaperRouteCommand,
  executeReadFinanceCloseWorkpapersRouteCommand,
  executeSaveFinanceCloseWorkpaperRouteCommand,
} from "@workspace/finance/server/close/workpaper-route-commands";
import { financeCloseWorkpaperQuerySchema, saveFinanceCloseWorkpaperSchema } from "@workspace/finance/server/close/workpaper-schemas";

export const GET = createCommandRoute({
  querySchema: financeCloseWorkpaperQuerySchema,
  queryError: "关账底稿范围参数无效",
  access: (userId) => authorize({ user: userId, resourceKey: "finance.ledger", action: "view" }),
  accessError: "无关账底稿查看权限",
  buildCommand: ({ query }) => buildReadFinanceCloseWorkpapersRouteCommand(query),
  action: executeReadFinanceCloseWorkpapersRouteCommand,
});

export const PUT = createCommandRoute({
  bodySchema: saveFinanceCloseWorkpaperSchema,
  bodyError: "关账底稿保存参数无效",
  access: (userId) => authorize({ user: userId, resourceKey: "finance.ledger", action: "update" }),
  accessError: "无关账底稿编制权限",
  buildCommand: ({ body, user }) => buildSaveFinanceCloseWorkpaperRouteCommand(body, user.userId),
  action: executeSaveFinanceCloseWorkpaperRouteCommand,
});
