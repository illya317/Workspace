import { z } from "zod";

import { executeHrAutocompleteCommand } from "@workspace/hr/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

const autocompleteQuerySchema = z.object({
  fkKey: z.string().catch(""),
  entity: z.string().catch(""),
  keyword: z.string().catch(""),
  active: z.string().optional(),
  activeOnly: z.string().optional(),
  lifecycleScope: z.string().optional(),
}).passthrough();

export const GET = createCommandRoute({
  querySchema: autocompleteQuerySchema,
  buildCommand: ({ query, user, searchParams }) => okCommand({
    fkKey: query.fkKey || undefined,
    entity: query.entity,
    keyword: query.keyword,
    activeOnly: query.active === "1" || query.activeOnly === "1",
    lifecycleScope: query.lifecycleScope,
    userId: user.userId,
    params: Object.fromEntries(searchParams.entries()),
  }),
  action: executeHrAutocompleteCommand,
});
