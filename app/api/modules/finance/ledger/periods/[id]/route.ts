import { z } from "zod";

import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { okCommand } from "@workspace/platform/server/domain-validation";
import { checkFinanceLedgerDelete, checkFinanceLedgerWrite } from "@workspace/platform/server/auth";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import {
  deleteFinancePeriod,
  updateFinancePeriod,
} from "@workspace/finance/server/ledger/periods";

const updatePeriodSchema = z.object({
  isClosed: z.boolean().optional(),
});

export const PUT = createCommandRoute({
  access: checkFinanceLedgerWrite,
  paramsSchema: routeIdParamsSchema,
  bodySchema: updatePeriodSchema,
  paramsError: "参数无效",
  bodyError: "参数无效",
  buildCommand: ({ params, body }) => okCommand({ id: params.id, body }),
  action: (command) => updateFinancePeriod(command.id, command.body),
});

export const DELETE = createCommandRoute({
  access: checkFinanceLedgerDelete,
  paramsSchema: routeIdParamsSchema,
  paramsError: "参数无效",
  buildCommand: ({ params }) => okCommand({ id: params.id }),
  action: (command) => deleteFinancePeriod(command.id),
});
