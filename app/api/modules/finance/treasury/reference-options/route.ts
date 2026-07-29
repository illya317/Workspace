import {
  executeTreasuryReferenceOptionsCommand,
  treasuryReferenceOptionsQuerySchema,
} from "@workspace/finance/server/treasury/reference-options";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

export const GET = createCommandRoute({
  querySchema: treasuryReferenceOptionsQuerySchema,
  queryError: "资金管理引用候选项参数无效",
  buildCommand: ({ query }) => okCommand(query),
  action: (command) => executeTreasuryReferenceOptionsCommand(command),
});
