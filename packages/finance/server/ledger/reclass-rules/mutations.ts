import { prisma } from "@workspace/platform/server/prisma";
import { syncReclassRuleResults } from "./sync";
import { buildFinanceIdCommand, buildUpsertReclassRuleCommand } from "../../domain/finance-validation";

export type UpsertReclassRuleInput = {
  companyCode: string;
  year: number;
  sourceAccountCode: string;
  abnormalSide: "debit" | "credit" | "both";
  targetAccountCode: string;
  enabled?: boolean;
  note?: string | null;
};

export async function upsertReclassRule(input: UpsertReclassRuleInput) {
  const command = buildUpsertReclassRuleCommand(input);
  if (!command.ok) throw new Error(command.issue.message);
  const rule = await prisma.financeReclassRule.upsert({
    where: {
      companyCode_year_sourceAccountCode_abnormalSide: {
        companyCode: command.data.input.companyCode,
        year: command.data.input.year,
        sourceAccountCode: command.data.input.sourceAccountCode,
        abnormalSide: command.data.input.abnormalSide,
      },
    },
    create: {
      companyCode: command.data.input.companyCode,
      year: command.data.input.year,
      sourceAccountCode: command.data.input.sourceAccountCode,
      abnormalSide: command.data.input.abnormalSide,
      targetAccountCode: command.data.input.targetAccountCode,
      enabled: command.data.input.enabled ?? true,
      note: command.data.input.note || null,
      source: "manual",
    },
    update: {
      targetAccountCode: command.data.input.targetAccountCode,
      enabled: command.data.input.enabled ?? undefined,
      note: command.data.input.note !== undefined ? (command.data.input.note || null) : undefined,
    },
  });

  const sync = await syncReclassRuleResults(command.data.input.companyCode, command.data.input.year);
  return { success: true, rule, sync };
}

export async function deleteReclassRule(ruleId: number) {
  const command = buildFinanceIdCommand(ruleId, "ruleId");
  if (!command.ok) throw new Error(command.issue.message);
  const existing = await prisma.financeReclassRule.findUnique({
    where: { id: command.data.id },
  });
  if (!existing) return { success: false, status: 404 as const, error: "规则不存在" };

  const { companyCode, year } = existing;

  await prisma.$transaction([
    prisma.reclassResult.deleteMany({
      where: { ruleId: command.data.id, status: { in: ["approved", "pending"] } },
    }),
    prisma.financeReclassRule.delete({ where: { id: command.data.id } }),
  ]);

  const sync = await syncReclassRuleResults(companyCode, year);
  return { success: true, sync };
}
