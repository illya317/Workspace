/**
 * 确保某公司某年度有完整规则。逐条从上年补缺，已存在的跳过。
 */
import { prisma } from "@/lib/prisma";

export async function ensureReclassRulesForYear(
  companyCode: string,
  year: number,
): Promise<{ rulesCopied: number; itemRulesCopied: number }> {
  const prevYear = year - 1;

  // 逐条复制上年 account rules（已存在则 upsert no-op）
  const prevRules = await prisma.financeReclassRule.findMany({
    where: { companyCode, year: prevYear, enabled: true },
  });
  let rulesCopied = 0;
  for (const r of prevRules) {
    await prisma.financeReclassRule.upsert({
      where: { companyCode_year_sourceAccountCode_abnormalSide: { companyCode, year, sourceAccountCode: r.sourceAccountCode, abnormalSide: r.abnormalSide } },
      create: { companyCode, year, sourceAccountCode: r.sourceAccountCode, abnormalSide: r.abnormalSide, targetAccountCode: r.targetAccountCode, source: "copied", note: `从 ${prevYear} 年度继承` },
      update: {},
    });
    rulesCopied++;
  }

  // 逐条复制上年 item rules
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
