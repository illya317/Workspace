import { z } from "zod";

import { searchInvestmentEnterpriseDocuments } from "@workspace/capital-securities/server/investment-enterprise-documents";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

const searchSchema = z.object({
  profileId: z.coerce.number().int().positive(),
  query: z.string().min(2).max(500),
  limit: z.coerce.number().int().min(1).max(30).catch(12),
});

export const POST = createCommandRoute({
  bodySchema: searchSchema,
  buildCommand: ({ body, user }) => okCommand({ userId: user.userId, ...body }),
  action: searchInvestmentEnterpriseDocuments,
});
