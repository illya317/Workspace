import { z } from "zod";

import { loadConsolidationOverview } from "@workspace/finance/server/statements/consolidation-overview";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

const optionalYear = z.preprocess(
  (value) => value === null || value === undefined || value === "" ? undefined : Number(value),
  z.number().int().min(1900).max(2099).optional(),
);
const optionalMonth = z.preprocess(
  (value) => value === null || value === undefined || value === "" ? undefined : Number(value),
  z.number().int().min(1).max(12).optional(),
);
const optionalPositiveId = z.preprocess(
  (value) => value === null || value === undefined || value === "" ? undefined : Number(value),
  z.number().int().positive().optional(),
);

const consolidationQuerySchema = z.object({
  year: optionalYear,
  month: optionalMonth,
  parentCompanyId: optionalPositiveId,
  batchId: optionalPositiveId,
});

export const GET = createCommandRoute({
  querySchema: consolidationQuerySchema,
  queryError: "合并报表期间参数无效",
  buildCommand: ({ query }) => okCommand(query),
  action: (command) => loadConsolidationOverview(command),
});
