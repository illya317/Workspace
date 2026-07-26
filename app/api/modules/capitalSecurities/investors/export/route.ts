import { exportInvestorCaptable } from "@workspace/capital-securities/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

import { investorRelationshipQuerySchema } from "../query-schema";

export const GET = createCommandRoute({
  querySchema: investorRelationshipQuerySchema,
  buildCommand: ({ query }) => okCommand(query),
  action: exportInvestorCaptable,
});
