import { z } from "zod";

import { saveInvestmentEnterpriseRecord } from "@workspace/capital-securities/server/investment-enterprises";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

const recordSchema = z.object({
  kind: z.enum(["meeting", "diligence", "contract", "monitoring"]),
  profileId: z.coerce.number().int().positive(),
  id: z.coerce.number().int().positive().optional(),
  version: z.coerce.number().int().nonnegative().optional(),
}).passthrough();

export const POST = createCommandRoute({
  bodySchema: recordSchema,
  buildCommand: ({ body, user }) => okCommand({ userId: user.userId, body }),
  action: saveInvestmentEnterpriseRecord,
});

export const PUT = createCommandRoute({
  bodySchema: recordSchema.extend({ id: z.coerce.number().int().positive(), version: z.coerce.number().int().nonnegative() }),
  buildCommand: ({ body, user }) => okCommand({ userId: user.userId, body }),
  action: saveInvestmentEnterpriseRecord,
});
