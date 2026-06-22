import { prisma } from "@workspace/platform/server/prisma";

import { invalidateMappingCache } from "./resolver";
import { ensureStatementMappings } from "./seed-from-config";
import {
  buildStatementMappingCommand,
  buildStatementMappingDeleteCommand,
} from "../../domain/finance-validation";

export type StatementType = "balance";
export type StatementMappingOperator = "add" | "subtract" | "exclude";

export interface ListStatementMappingsInput {
  companyCode: string;
  year: number;
  statementType?: StatementType;
}

export interface SaveStatementMappingInput extends ListStatementMappingsInput {
  accountCode: string;
  lineCode: string;
  operator?: StatementMappingOperator;
}

export interface DeleteStatementMappingInput extends ListStatementMappingsInput {
  accountCode: string;
}

export class StatementMappingServiceError extends Error {
  status = 400;
}

const REPORT_TYPE_BY_STATEMENT_TYPE: Record<StatementType, "balanceSheet"> = {
  balance: "balanceSheet",
};

function resolveStatementType(statementType: StatementType = "balance"): StatementType {
  if (statementType !== "balance") {
    throw new StatementMappingServiceError("statementType 暂只支持 balance");
  }
  return statementType;
}

export async function listStatementMappings(input: ListStatementMappingsInput) {
  const statementType = resolveStatementType(input.statementType);

  await ensureStatementMappings(input.companyCode, input.year, statementType);

  const mappings = await prisma.financeStatementAccountMapping.findMany({
    where: { companyCode: input.companyCode, year: input.year, statementType },
    select: { accountCode: true, lineCode: true, operator: true, source: true, note: true },
    orderBy: { lineCode: "asc" },
  });

  return { mappings };
}

export async function saveStatementMapping(input: SaveStatementMappingInput) {
  const command = buildStatementMappingCommand(input, { requireAccount: true, requireLine: true });
  if (!command.ok) throw new StatementMappingServiceError(command.issue.message);
  const statementType = resolveStatementType(command.data.input.statementType);
  const operator = command.data.input.operator ?? "add";
  const reportType = REPORT_TYPE_BY_STATEMENT_TYPE[statementType];

  const [line, account] = await Promise.all([
    prisma.financeStatementLineConfig.findUnique({
      where: {
        companyCode_year_reportType_lineCode: {
          companyCode: command.data.input.companyCode,
          year: command.data.input.year,
          reportType,
          lineCode: command.data.input.lineCode,
        },
      },
    }),
    prisma.financeAccount.findUnique({
      where: {
        code_companyCode_year: {
          code: command.data.input.accountCode,
          companyCode: command.data.input.companyCode,
          year: command.data.input.year,
        },
      },
    }),
  ]);

  if (!line) {
    throw new StatementMappingServiceError("lineCode 不存在");
  }
  if (!account) {
    throw new StatementMappingServiceError("accountCode 不存在");
  }

  const mapping = await prisma.financeStatementAccountMapping.upsert({
    where: {
      companyCode_year_statementType_accountCode: {
        companyCode: command.data.input.companyCode,
        year: command.data.input.year,
        statementType,
        accountCode: command.data.input.accountCode,
      },
    },
    create: {
      companyCode: command.data.input.companyCode,
      year: command.data.input.year,
      statementType,
      accountCode: command.data.input.accountCode,
      lineCode: command.data.input.lineCode,
      operator,
      source: "manual",
    },
    update: { lineCode: command.data.input.lineCode, operator, source: "manual", note: null },
  });

  invalidateMappingCache();

  return { success: true, mapping };
}

export async function deleteStatementMapping(input: DeleteStatementMappingInput) {
  const command = buildStatementMappingDeleteCommand(input);
  if (!command.ok) throw new StatementMappingServiceError(command.issue.message);
  const statementType = resolveStatementType(command.data.input.statementType);

  const result = await prisma.financeStatementAccountMapping.deleteMany({
    where: {
      companyCode: command.data.input.companyCode,
      year: command.data.input.year,
      statementType,
      accountCode: command.data.input.accountCode,
    },
  });

  invalidateMappingCache();

  return { success: true, deleted: result.count };
}
