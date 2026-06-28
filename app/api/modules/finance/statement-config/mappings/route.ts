import { z } from "zod";

import {
  executeDeleteStatementMappingCommand,
  executeListStatementMappingsCommand,
  executeSaveStatementMappingCommand,
} from "@workspace/finance/server/route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";
import { checkFinanceStatementConfigAccess, checkFinanceStatementConfigWrite } from "@workspace/platform/server/auth";

const mappingQuerySchema = z.object({
  companyCode: z.string().min(1),
  year: z.coerce.number().int(),
  statementType: z.literal("balance").default("balance"),
});

const saveMappingSchema = mappingQuerySchema.extend({
  accountCode: z.string().min(1),
  lineCode: z.string().min(1),
  operator: z.enum(["add", "subtract", "exclude"]).default("add"),
});

const deleteMappingSchema = mappingQuerySchema.extend({ accountCode: z.string().min(1) });

export const GET = createCommandRoute({
  access: checkFinanceStatementConfigAccess,
  querySchema: mappingQuerySchema,
  queryError: "companyCode, year 为必填",
  buildCommand: ({ query }) => okCommand(query),
  action: executeListStatementMappingsCommand,
});

export const POST = createCommandRoute({
  access: checkFinanceStatementConfigWrite,
  bodySchema: saveMappingSchema,
  bodyError: "companyCode, year, statementType, accountCode, lineCode 为必填",
  buildCommand: ({ body }) => okCommand(body),
  action: executeSaveStatementMappingCommand,
});

export const DELETE = createCommandRoute({
  access: checkFinanceStatementConfigWrite,
  querySchema: deleteMappingSchema,
  queryError: "companyCode, year, accountCode 为必填",
  buildCommand: ({ query }) => okCommand(query),
  action: executeDeleteStatementMappingCommand,
});
