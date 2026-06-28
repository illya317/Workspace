import { z } from "zod";

import { executeAllReclassItemsCommand } from "@workspace/finance/server/route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { checkFinanceLedgerAccess } from "@workspace/platform/server/auth";
import { okCommand } from "@workspace/platform/server/domain-validation";

const allReclassItemsQuerySchema = z.object({
  periodId: z.coerce.number().int().positive("periodId 为必填"),
});

export const GET = createCommandRoute({
  access: checkFinanceLedgerAccess,
  querySchema: allReclassItemsQuerySchema,
  queryError: "periodId 为必填",
  buildCommand: ({ query }) => okCommand(query),
  action: executeAllReclassItemsCommand,
});
