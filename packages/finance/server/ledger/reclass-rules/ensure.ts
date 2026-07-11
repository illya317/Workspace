/**
 * 确保某公司某年度有完整规则。逐条从上年补缺，已存在的跳过。
 */
import { prisma } from "@workspace/platform/server/prisma";
import { buildReclassRuleScopeCommand } from "../../domain/finance-validation";

export async function ensureReclassRulesForYear(
  companyCode: string,
  year: number,
): Promise<{ rulesCopied: number; itemRulesCopied: number }> {
  const command = buildReclassRuleScopeCommand(companyCode, year);
  if (!command.ok) throw new Error(command.issue.message);
  const prevYear = command.data.year - 1;

  // 目标年度已有 keys（避免重复计数）
  const existingRuleKeys = new Set(
    (await prisma.financeReclassRule.findMany({ where: { companyCode: command.data.companyCode, year: command.data.year }, select: { sourceAccountCode: true, abnormalSide: true } }))
      .map(r => `${r.sourceAccountCode}::${r.abnormalSide}`)
  );
  const existingItemRuleKeys = new Set(
    (await prisma.financeReclassItemRule.findMany({ where: { companyCode: command.data.companyCode, year: command.data.year }, select: { sourceAccountCode: true, matchType: true, matchValue: true } }))
      .map(r => `${r.sourceAccountCode}::${r.matchType}::${r.matchValue}`)
  );

  // 逐条复制上年 account rules（只补缺失）
  const prevRules = await prisma.financeReclassRule.findMany({
    where: { companyCode: command.data.companyCode, year: prevYear, enabled: true },
  });
  let rulesCopied = 0;
  for (const r of prevRules) {
    if (existingRuleKeys.has(`${r.sourceAccountCode}::${r.abnormalSide}`)) continue;
    await prisma.financeReclassRule.create({
      data: { companyCode: command.data.companyCode, year: command.data.year, sourceAccountCode: r.sourceAccountCode, abnormalSide: r.abnormalSide, targetAccountCode: r.targetAccountCode, source: "copied", note: `从 ${prevYear} 年度继承` },
    });
    rulesCopied++;
  }

  // 逐条复制上年 item rules（只补缺失）
  const prevItemRules = await prisma.financeReclassItemRule.findMany({
    where: { companyCode: command.data.companyCode, year: prevYear, enabled: true },
  });
  let itemRulesCopied = 0;
  for (const ir of prevItemRules) {
    if (existingItemRuleKeys.has(`${ir.sourceAccountCode}::${ir.matchType}::${ir.matchValue}`)) continue;
    await prisma.financeReclassItemRule.create({
      data: { companyCode: command.data.companyCode, year: command.data.year, sourceAccountCode: ir.sourceAccountCode, matchType: ir.matchType, matchValue: ir.matchValue, targetAccountCode: ir.targetAccountCode, note: `从 ${prevYear} 年度继承` },
    });
    itemRulesCopied++;
  }

  return { rulesCopied, itemRulesCopied };
}
