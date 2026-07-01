import { z } from "zod";

import { okCommand } from "@workspace/platform/server/domain-validation";
import { checkFinanceLedgerAccess, checkFinanceLedgerCreate } from "@workspace/platform/server/auth";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import {
  createFinanceAccount,
  listFinanceAccounts,
} from "@workspace/finance/server/ledger/accounts";

const listAccountsQuerySchema = z.object({
  companyCode: z.string().optional(),
  subjectLevel: z.string().optional(),
  scope: z.enum(["mapped", "unmapped", "inactive", "all"]).optional(),
  year: z.string().optional(),
  keyword: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(2000).default(50),
});

const createAccountSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  parentId: z.unknown().optional(),
  balanceDirection: z.unknown().optional(),
  companyCode: z.unknown().optional(),
  mnemonicCode: z.unknown().optional(),
  currency: z.unknown().optional(),
  groupSubjectCode: z.unknown().optional(),
  subjectLevel: z.unknown().optional(),
  isActive: z.unknown().optional(),
  sortOrder: z.unknown().optional(),
});

export const GET = createCommandRoute({
  access: checkFinanceLedgerAccess,
  querySchema: listAccountsQuerySchema,
  queryError: "参数无效",
  buildCommand: ({ query }) => okCommand(query),
  action: listFinanceAccounts,
});

export const POST = createCommandRoute({
  access: checkFinanceLedgerCreate,
  bodySchema: createAccountSchema,
  bodyError: "科目编码、名称、类别为必填",
  buildCommand: ({ user, body }) => okCommand({ body, userId: user.userId }),
  action: (command) => createFinanceAccount(command.body, command.userId),
});
