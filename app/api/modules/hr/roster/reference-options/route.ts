import { referenceOptionsQuerySchema } from "@workspace/platform/server/reference-options";

import { executeHrReferenceOptionsCommand } from "@workspace/hr/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

export const GET = createCommandRoute({
  querySchema: referenceOptionsQuerySchema,
  queryError: "参数错误",
  buildCommand: ({ query, user, searchParams }) => okCommand({
    fkKey: query.fkKey,
    keyword: query.keyword,
    lifecycleScope: query.lifecycleScope,
    userId: user.userId,
    params: Object.fromEntries(searchParams.entries()),
  }),
  action: executeHrReferenceOptionsCommand,
});
