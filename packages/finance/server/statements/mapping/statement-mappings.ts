import { prisma } from "@workspace/platform/server/prisma";

import { clearMappingCache } from "./resolver";
import { ensureStatementMappings } from "./seed-from-config";

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
  const statementType = resolveStatementType(input.statementType);
  const operator = input.operator ?? "add";
  const reportType = REPORT_TYPE_BY_STATEMENT_TYPE[statementType];

  const [line, account] = await Promise.all([
    prisma.financeStatementLineConfig.findUnique({
      where: {
        companyCode_year_reportType_lineCode: {
          companyCode: input.companyCode,
          year: input.year,
          reportType,
          lineCode: input.lineCode,
        },
      },
    }),
    prisma.financeAccount.findUnique({
      where: {
        code_companyCode_year: {
          code: input.accountCode,
          companyCode: input.companyCode,
          year: input.year,
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
        companyCode: input.companyCode,
        year: input.year,
        statementType,
        accountCode: input.accountCode,
      },
    },
    create: {
      companyCode: input.companyCode,
      year: input.year,
      statementType,
      accountCode: input.accountCode,
      lineCode: input.lineCode,
      operator,
      source: "manual",
    },
    update: { lineCode: input.lineCode, operator, source: "manual", note: null },
  });

  clearMappingCache();

  return { success: true, mapping };
}

export async function deleteStatementMapping(input: DeleteStatementMappingInput) {
  const statementType = resolveStatementType(input.statementType);

  const result = await prisma.financeStatementAccountMapping.deleteMany({
    where: {
      companyCode: input.companyCode,
      year: input.year,
      statementType,
      accountCode: input.accountCode,
    },
  });

  clearMappingCache();

  return { success: true, deleted: result.count };
}
