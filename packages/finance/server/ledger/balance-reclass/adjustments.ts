import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";
import { prisma } from "@workspace/platform/server/prisma";

import {
  buildSaveBalanceReclassAdjustmentChangeSetCommand,
  type SaveBalanceReclassAdjustmentChangeSetInput,
} from "../../domain/finance-validation";
import { currentReverseBalanceAmount } from "./reverse-balance";

export async function saveBalanceReclassAdjustmentChangeSet(input: SaveBalanceReclassAdjustmentChangeSetInput) {
  const command = buildSaveBalanceReclassAdjustmentChangeSetCommand(input);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status);
  const { userId, changes } = command.data.input;
  const direct = await assertBusinessActionDirectExecutionAllowed({
    businessActionKey: "finance.ledger.reclassAdjustment.save",
    actorUserId: userId,
    resourceKey: "finance.ledger",
    scopeType: "global",
    scopeId: null,
    blockedMessage: "重分类调整已配置为必须走流程，请从统一保存入口提交",
  });
  if (!direct.ok) return direct;

  return prisma.$transaction(async (tx) => {
    const periodIds = [...new Set(changes.map((change) => change.periodId))];
    const periods = await tx.financePeriod.findMany({
      where: { id: { in: periodIds } },
      select: { id: true, companyCode: true, year: true },
    });
    if (periods.length !== periodIds.length) return serviceError("部分会计期间不存在", 404);
    const periodMap = new Map(periods.map((period) => [period.id, period]));

    const accounts = await tx.financeAccount.findMany({
      where: {
        isActive: true,
        OR: changes.flatMap((change) => {
          const period = periodMap.get(change.periodId)!;
          return [
            { companyCode: period.companyCode, year: period.year, code: change.sourceAccountCode },
            { companyCode: period.companyCode, year: period.year, code: change.targetAccountCode },
          ];
        }),
      },
      select: { id: true, companyCode: true, year: true, code: true, balanceDirection: true },
    });
    const accountMap = new Map(accounts.map((account) => [`${account.companyCode}::${account.year}::${account.code}`, account]));
    for (const change of changes) {
      const period = periodMap.get(change.periodId)!;
      const prefix = `${period.companyCode}::${period.year}::`;
      if (!accountMap.has(`${prefix}${change.sourceAccountCode}`) || !accountMap.has(`${prefix}${change.targetAccountCode}`)) {
        return serviceError("源科目或目标科目在对应公司和年度中不存在或已停用", 400);
      }
    }

    const balances = await tx.financeAccountBalance.findMany({
      where: {
        OR: changes.map((change) => {
          const period = periodMap.get(change.periodId)!;
          const account = accountMap.get(`${period.companyCode}::${period.year}::${change.sourceAccountCode}`)!;
          return { periodId: change.periodId, accountId: account.id };
        }),
      },
      select: { periodId: true, closingDebit: true, closingCredit: true, account: { select: { code: true, balanceDirection: true } } },
    });
    const balanceMap = new Map(balances.map((row) => [`${row.periodId}::${row.account.code}`, row]));
    const amounts = new Map<string, number>();
    for (const change of changes) {
      const key = `${change.periodId}::${change.sourceAccountCode}`;
      const balance = balanceMap.get(key);
      if (!balance) return serviceError(`科目 ${change.sourceAccountCode} 没有可调整的期末余额`, 409);
      const amount = currentReverseBalanceAmount(balance);
      if (amount === null) return serviceError(`科目 ${change.sourceAccountCode} 当前不是期末反向余额`, 409);
      amounts.set(key, amount);
    }

    const adjustedAt = new Date();
    for (const change of changes) {
      const period = periodMap.get(change.periodId)!;
      const key = `${change.periodId}::${change.sourceAccountCode}`;
      await tx.financeBalanceReclassAdjustment.upsert({
        where: { periodId_sourceAccountCode: { periodId: change.periodId, sourceAccountCode: change.sourceAccountCode } },
        create: {
          periodId: change.periodId,
          companyCode: period.companyCode,
          year: period.year,
          sourceAccountCode: change.sourceAccountCode,
          targetAccountCode: change.targetAccountCode,
          amount: amounts.get(key)!,
          sourceType: "manual",
          status: "adjusted",
          note: JSON.stringify({ basis: "manual_closing_balance" }),
          adjustedBy: userId,
          adjustedAt,
        },
        update: {
          targetAccountCode: change.targetAccountCode,
          amount: amounts.get(key)!,
          sourceType: "manual",
          ruleId: null,
          status: "adjusted",
          note: JSON.stringify({ basis: "manual_closing_balance" }),
          adjustedBy: userId,
          adjustedAt,
        },
      });
    }
    return serviceOk({ success: true, saved: changes.length });
  }, { maxWait: 10_000, timeout: 60_000 });
}
