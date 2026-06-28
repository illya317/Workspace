import { z } from "zod";

import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { okCommand } from "@workspace/platform/server/domain-validation";
import { checkFinanceLedgerDelete, checkFinanceLedgerWrite } from "@workspace/platform/server/auth";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import {
  deleteFinanceAccount,
  updateFinanceAccount,
} from "@workspace/finance/server/ledger/accounts";

const updateAccountSchema = z.object({
  code: z.unknown().optional(),
  name: z.unknown().optional(),
  category: z.unknown().optional(),
  balanceDirection: z.unknown().optional(),
  isActive: z.unknown().optional(),
  sortOrder: z.unknown().optional(),
  reclassTargetCode: z.unknown().optional(),
  companyCode: z.unknown().optional(),
  mnemonicCode: z.unknown().optional(),
  currency: z.unknown().optional(),
  groupSubjectCode: z.unknown().optional(),
  subjectLevel: z.unknown().optional(),
});

export const PUT = createCommandRoute({
  access: checkFinanceLedgerWrite,
  paramsSchema: routeIdParamsSchema,
  bodySchema: updateAccountSchema,
  paramsError: "参数无效",
  bodyError: "参数无效",
  buildCommand: ({ user, params, body }) => okCommand({
    id: params.id,
    body,
    userId: user.userId,
  }),
  action: (command) => updateFinanceAccount(command.id, command.body, command.userId),
});

export const DELETE = createCommandRoute({
  access: checkFinanceLedgerDelete,
  paramsSchema: routeIdParamsSchema,
  paramsError: "参数无效",
  buildCommand: ({ user, params }) => okCommand({
    id: params.id,
    userId: user.userId,
  }),
  action: (command) => deleteFinanceAccount(command.id, command.userId),
});
