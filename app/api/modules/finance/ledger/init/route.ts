import { z } from "zod";

import {
  buildInitializeFinanceDefaultsCommand,
  executeInitializeFinanceDefaultsCommand,
} from "@workspace/finance/server/route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { checkFinanceLedgerWrite } from "@workspace/platform/server/auth";

const initFinanceSchema = z.object({
  year: z.coerce.number().int().default(2025),
  month: z.coerce.number().int().min(1).max(12).default(1),
  companyCode: z.string().trim().min(1),
});

export const POST = createCommandRoute({
  access: checkFinanceLedgerWrite,
  bodySchema: initFinanceSchema,
  bodyError: "companyCode 为必填",
  buildCommand: ({ body, user }) => buildInitializeFinanceDefaultsCommand(body, user.userId),
  action: executeInitializeFinanceDefaultsCommand,
});
