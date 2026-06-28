import { z } from "zod";

import {
  buildUpdateVoucherCommand,
  executeDeleteVoucherCommand,
  executeUpdateVoucherCommand,
} from "@workspace/finance/server/route-commands";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";
import { checkFinanceLedgerDelete, checkFinanceLedgerWrite } from "@workspace/platform/server/auth";

const itemSchema = z.object({
  accountId: z.unknown(),
  debit: z.unknown(),
  credit: z.unknown(),
  description: z.unknown().optional(),
});

const updateVoucherSchema = z.object({
  date: z.string().optional(),
  description: z.string().optional(),
  status: z.string().optional(),
  items: z.array(itemSchema).optional(),
}).passthrough();

export const PUT = createCommandRoute({
  access: checkFinanceLedgerWrite,
  paramsSchema: routeIdParamsSchema,
  paramsError: "id 必须为正整数",
  bodySchema: updateVoucherSchema,
  bodyError: "参数无效",
  buildCommand: ({ params, body, user }) => buildUpdateVoucherCommand(params.id, body, user.userId),
  action: executeUpdateVoucherCommand,
});

export const DELETE = createCommandRoute({
  access: checkFinanceLedgerDelete,
  paramsSchema: routeIdParamsSchema,
  paramsError: "id 必须为正整数",
  buildCommand: ({ params }) => okCommand({ id: params.id }),
  action: executeDeleteVoucherCommand,
});
