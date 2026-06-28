import { z } from "zod";

import {
  buildSaveStatementConfigCommand,
  buildStatementConfigViewCommand,
  executeSaveStatementConfigCommand,
  executeStatementConfigViewCommand,
} from "@workspace/finance/server/route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { checkFinanceStatementConfigAccess, checkFinanceStatementConfigWrite } from "@workspace/platform/server/auth";

const statementConfigQuerySchema = z.object({
  companyCode: z.string().min(1),
  year: z.coerce.number().int(),
  type: z.literal("balance").default("balance"),
});

const statementConfigLineSchema = z.object({
  lineCode: z.string().min(1),
  prefixes: z.array(z.unknown()).optional(),
  subtractPrefixes: z.array(z.unknown()).optional(),
  reclassSource: z.boolean().optional(),
  reclassTarget: z.boolean().optional(),
  label: z.string().optional(),
  section: z.string().optional(),
  enabled: z.boolean().optional(),
});

const saveStatementConfigSchema = z.object({
  companyCode: z.string().min(1),
  year: z.coerce.number().int(),
  lines: z.array(statementConfigLineSchema),
});

export const GET = createCommandRoute({
  access: checkFinanceStatementConfigAccess,
  querySchema: statementConfigQuerySchema,
  queryError: "companyCode, year 为必填",
  buildCommand: ({ query }) => buildStatementConfigViewCommand(query),
  action: executeStatementConfigViewCommand,
});

export const PUT = createCommandRoute({
  access: checkFinanceStatementConfigWrite,
  bodySchema: saveStatementConfigSchema,
  bodyError: "参数无效",
  buildCommand: ({ body }) => buildSaveStatementConfigCommand(body),
  action: executeSaveStatementConfigCommand,
});
