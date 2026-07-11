import { z } from "zod";

import {
  buildReconcileBalanceSheetCommand,
  executeReconcileBalanceSheetCommand,
} from "@workspace/finance/server/route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const reconcileFormSchema = z.object({
  file: z.instanceof(File),
  companyCode: z.string().min(1),
});

export const POST = createCommandRoute({
  bodyParser: "formData",
  bodySchema: reconcileFormSchema,
  bodyError: "参数无效",
  buildCommand: ({ body }) => buildReconcileBalanceSheetCommand(body),
  action: executeReconcileBalanceSheetCommand,
});
