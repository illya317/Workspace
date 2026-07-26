import { z } from "zod";

import { listFinanceGroupAccountMappedLocalAccounts } from "@workspace/finance/server/ledger/group-accounts";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

export const GET = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  querySchema: z.object({
    policyVersionId: z.coerce.number().int().positive(),
  }),
  paramsError: "集团科目参数无效",
  queryError: "集团科目版本参数无效",
  buildCommand: ({ params, query }) => okCommand({
    groupAccountId: params.id,
    policyVersionId: query.policyVersionId,
  }),
  action: listFinanceGroupAccountMappedLocalAccounts,
});
