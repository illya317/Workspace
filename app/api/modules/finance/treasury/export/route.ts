import { z } from "zod";

import {
  buildTreasuryInterestExportCommand,
  executeTreasuryInterestExportCommand,
} from "@workspace/finance/server/treasury/export-route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const querySchema = z.object({
  companyCode: z.string().trim().min(1),
  year: z.coerce.number().int().min(2000).max(2099),
  month: z.coerce.number().int().min(1).max(12),
});

export const GET = createCommandRoute({
  querySchema,
  queryError: "利息底稿导出条件无效",
  buildCommand: ({ query }) => buildTreasuryInterestExportCommand(query),
  action: executeTreasuryInterestExportCommand,
});
