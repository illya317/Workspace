import { z } from "zod";
import { listCompanyCurrencyOptions } from "@workspace/capital-securities/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

const querySchema = z.object({ keyword: z.string().catch("") }).passthrough();

export const GET = createCommandRoute({
  querySchema,
  buildCommand: ({ query }) => okCommand({ keyword: query.keyword.trim() }),
  action: listCompanyCurrencyOptions,
});
