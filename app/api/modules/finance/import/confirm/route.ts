import { importConfirmBodySchema } from "@workspace/finance/server/import/schemas";
import {
  buildFinanceImportConfirmCommand,
  executeFinanceImportConfirmCommand,
} from "@workspace/finance/server/route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { checkFinanceImportWrite } from "@workspace/platform/server/auth";

export const POST = createCommandRoute({
  access: checkFinanceImportWrite,
  bodySchema: importConfirmBodySchema,
  bodyError: "preview 为必填",
  buildCommand: ({ body, user }) => buildFinanceImportConfirmCommand(body.preview, user.userId),
  action: executeFinanceImportConfirmCommand,
});
