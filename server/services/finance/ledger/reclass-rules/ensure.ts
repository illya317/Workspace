/**
 * 确保某公司某年度有规则。如无规则，从上一年度复制。
 */
import { prisma } from "@/lib/prisma";

export async function ensureReclassRulesForYear(
  companyCode: string,
  year: number,
): Promise<{ rulesCopied: number; itemRulesCopied: number }> {
  // Already has rules?
  const existingCount = await prisma.financeReclassRule.count({
    where: { companyCode, year },
  });
  if (existingCount > 0) return { rulesCopied: 0, itemRulesCopied: 0 };

  const prevYear = year - 1;

  // Copy account rules
  const prevRules = await prisma.financeReclassRule.findMany({
    where: { companyCode, year: prevYear, enabled: true },
  });
  let rulesCopied = 0;
  for (const r of prevRules) {
    await prisma.financeReclassRule.upsert({
      where: { companyCode_year_sourceAccountCode_abnormalSide: { companyCode, year, sourceAccountCode: r.sourceAccountCode, abnormalSide: r.abnormalSide } },
      create: { companyCode, year, sourceAccountCode: r.sourceAccountCode, abnormalSide: r.abnormalSide, targetAccountCode: r.targetAccountCode, source: "copied", note: `从 ${prevYear} 年度继承` },
      update: {}, // no-op if already exists
    });
    rulesCopied++;
  }

  // Copy item rules
  const prevItemRules = await prisma.financeReclassItemRule.findMany({
    where: { companyCode, year: prevYear, enabled: true },
  });
  let itemRulesCopied = 0;
  for (const ir of prevItemRules) {
    await prisma.financeReclassItemRule.upsert({
      where: { companyCode_year_sourceAccountCode_matchType_matchValue: { companyCode, year, sourceAccountCode: ir.sourceAccountCode, matchType: ir.matchType, matchValue: ir.matchValue } },
      create: { companyCode, year, sourceAccountCode: ir.sourceAccountCode, matchType: ir.matchType, matchValue: ir.matchValue, targetAccountCode: ir.targetAccountCode, note: `从 ${prevYear} 年度继承` },
      update: {},
    });
    itemRulesCopied++;
  }

  return { rulesCopied, itemRulesCopied };
}
