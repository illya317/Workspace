import { z } from "zod";

import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { okCommand } from "@workspace/platform/server/domain-validation";import { createCommandRoute } from "@workspace/platform/server/api-route";
import {
  deleteFinancePeriod,
  updateFinancePeriod,
} from "@workspace/finance/server/ledger/periods";

const updatePeriodSchema = z.object({
  isClosed: z.boolean().optional(),
});

export const PUT = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  bodySchema: updatePeriodSchema,
  paramsError: "参数无效",
  bodyError: "参数无效",
  buildCommand: ({ params, body }) => okCommand({ id: params.id, body }),
  action: (command) => updateFinancePeriod(command.id, command.body),
});

export const DELETE = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "参数无效",
  buildCommand: ({ params, user }) => okCommand({ id: params.id, userId: user.userId }),
  action: (command) => deleteFinancePeriod(command.id, command.userId),
});
