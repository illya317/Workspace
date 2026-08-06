import { z } from "zod";

import { executeGetComparisonRunCommand } from "@workspace/finance/server/statements/comparison/route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

const runIdParamsSchema = z.object({
  runId: z.coerce.number().int().positive(),
});

export const GET = createCommandRoute({
  paramsSchema: runIdParamsSchema,
  buildCommand: ({ params }) => okCommand(params.runId),
  action: (runId) => executeGetComparisonRunCommand(runId),
});
