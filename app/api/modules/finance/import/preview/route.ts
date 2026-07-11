import { importPreviewFormSchema } from "@workspace/finance/server/import/schemas";
import {
  buildFinanceImportPreviewCommand,
  executeFinanceImportPreviewCommand,
} from "@workspace/finance/server/route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";export const POST = createCommandRoute({
  bodyParser: "formData",
  bodySchema: importPreviewFormSchema,
  bodyError: "参数无效",
  buildCommand: ({ body }) => buildFinanceImportPreviewCommand(body),
  action: executeFinanceImportPreviewCommand,
});
