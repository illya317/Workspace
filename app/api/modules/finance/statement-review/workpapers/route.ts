import {
  buildSaveWorkpaperCommand,
  buildWorkpaperQueryCommand,
  executeSaveWorkpaperCommand,
  executeWorkpaperQueryCommand,
} from "@workspace/finance/server/route-commands";
import {
  saveWorkpaperSchema,
  workpaperQuerySchema,
} from "@workspace/finance/server/statements/workpapers/schemas";
import { createCommandRoute } from "@workspace/platform/server/api-route";export const GET = createCommandRoute({
  querySchema: workpaperQuerySchema,
  queryError: "companyCode, year, month, reportType 为必填",
  buildCommand: ({ query }) => buildWorkpaperQueryCommand(query),
  action: executeWorkpaperQueryCommand,
});

export const PUT = createCommandRoute({
  bodySchema: saveWorkpaperSchema,
  bodyError: "companyCode, year, month, reportType, lines 为必填",
  buildCommand: ({ body, user }) => buildSaveWorkpaperCommand(body, user.userId),
  action: executeSaveWorkpaperCommand,
});
