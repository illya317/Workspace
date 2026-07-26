import { z } from "zod";

import {
  buildLookupFinancePeriodCommand,
  executeLookupFinancePeriodCommand,
} from "@workspace/finance/server/route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";const optionalNumber = z.preprocess(
  (value) => (value === null || value === undefined || value === "" ? undefined : Number(value)),
  z.number().int().optional(),
);

const lookupPeriodQuerySchema = z.object({
  companyCode: z.string().min(1).optional(),
  year: optionalNumber,
  month: optionalNumber,
});

export const GET = createCommandRoute({
  querySchema: lookupPeriodQuerySchema,
  buildCommand: ({ query }) => buildLookupFinancePeriodCommand(query),
  action: executeLookupFinancePeriodCommand,
});
