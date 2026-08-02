import { z } from "zod";

import { listFinanceGroupAccounts } from "@workspace/finance/server/ledger/group-accounts";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

export const GET = createCommandRoute({
  querySchema: z.object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(200).default(100),
    policyVersionId: z.coerce.number().int().positive().optional(),
    keyword: z.string().trim().max(100).optional(),
    category: z.enum(["asset", "liability", "common", "equity", "cost", "revenue", "expense"]).optional(),
    accountUsage: z.enum(["consolidation", "reclassification"]).optional(),
    reviewStatus: z.enum(["confirmed", "reviewed", "pending_review", "pending_delete"]).optional(),
  }),
  queryError: "集团科目筛选参数无效",
  buildCommand: ({ query }) => okCommand(query),
  action: listFinanceGroupAccounts,
});
