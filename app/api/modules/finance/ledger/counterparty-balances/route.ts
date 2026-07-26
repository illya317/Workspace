import { z } from "zod";

import {
  buildListCounterpartyBalancesCommand,
  executeListCounterpartyBalancesCommand,
} from "@workspace/finance/server/route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const querySchema = z.object({
  companyCode: z.string().trim().min(1),
  year: z.coerce.number().int().min(2000).max(2099),
  month: z.coerce.number().int().min(1).max(12),
  category: z.enum(["ar", "ap", "otherAr", "otherAp"]),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
  keyword: z.string().optional(),
});

export const GET = createCommandRoute({
  querySchema,
  queryError: "参数无效",
  buildCommand: ({ query }) => buildListCounterpartyBalancesCommand(query),
  action: executeListCounterpartyBalancesCommand,
});
