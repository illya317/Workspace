import { importConfirmBodySchema } from "@workspace/finance/server/import/schemas";
import {
  buildFinanceImportConfirmCommand,
  executeFinanceImportConfirmCommand,
} from "@workspace/finance/server/route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";

export const POST = createCommandRoute({
  bodySchema: importConfirmBodySchema,
  bodyError: "preview 为必填",
  buildCommand: ({ body, user }) => buildFinanceImportConfirmCommand(body.preview, user.userId),
  action: executeFinanceImportConfirmCommand,
});
