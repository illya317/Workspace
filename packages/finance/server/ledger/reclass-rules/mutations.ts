import { prisma } from "@workspace/platform/server/prisma";
import { syncReclassRuleResults } from "./sync";

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
  const rule = await prisma.financeReclassRule.upsert({
    where: {
      companyCode_year_sourceAccountCode_abnormalSide: {
        companyCode: input.companyCode,
        year: input.year,
        sourceAccountCode: input.sourceAccountCode,
        abnormalSide: input.abnormalSide,
      },
    },
    create: {
      companyCode: input.companyCode,
      year: input.year,
      sourceAccountCode: input.sourceAccountCode,
      abnormalSide: input.abnormalSide,
      targetAccountCode: input.targetAccountCode,
      enabled: input.enabled ?? true,
      note: input.note || null,
      source: "manual",
    },
    update: {
      targetAccountCode: input.targetAccountCode,
      enabled: input.enabled ?? undefined,
      note: input.note !== undefined ? (input.note || null) : undefined,
    },
  });

  const sync = await syncReclassRuleResults(input.companyCode, input.year);
  return { success: true, rule, sync };
}

export async function deleteReclassRule(ruleId: number) {
  const existing = await prisma.financeReclassRule.findUnique({
    where: { id: ruleId },
  });
  if (!existing) return { success: false, status: 404 as const, error: "规则不存在" };

  const { companyCode, year } = existing;

  await prisma.$transaction([
    prisma.reclassResult.deleteMany({
      where: { ruleId, status: { in: ["approved", "pending"] } },
    }),
    prisma.financeReclassRule.delete({ where: { id: ruleId } }),
  ]);

  const sync = await syncReclassRuleResults(companyCode, year);
  return { success: true, sync };
}
