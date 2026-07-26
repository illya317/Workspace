import { z } from "zod";

import { executeScheduledReclassificationCommand } from "@workspace/finance/server/route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

const scheduledReclassQuerySchema = z.object({
  companyCode: z.string().min(1),
  year: z.coerce.number().int(),
  month: z.coerce.number().int().min(1).max(12),
});

export const GET = createCommandRoute({
  querySchema: scheduledReclassQuerySchema,
  queryError: "缺少参数",
  buildCommand: ({ query }) => okCommand(query),
  action: executeScheduledReclassificationCommand,
});
