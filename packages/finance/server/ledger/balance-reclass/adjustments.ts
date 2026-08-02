import { serviceError, serviceOk } from "@workspace/platform/service-result";
import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";
import { prisma } from "@workspace/platform/server/prisma";

import {
  buildSaveBalanceReclassAdjustmentChangeSetCommand,
  type SaveBalanceReclassAdjustmentChangeSetInput,
} from "../validation";
import { loadFinanceGroupAccountMapByAccountIdsAtInTransaction } from "../group-accounts/resolve";
import { counterpartyGrossAbnormalAmount } from "../reclass-rules/auxiliary-amount";
import {
  normalizeReclassBasis,
  oppositeBalanceSide,
  resolveGroupReclassRule,
} from "../reclass-rules/resolution";
import { materializeAutomaticRuleAdjustments } from "./automatic";
import { archiveBalanceReclassAdjustment, hasSameBalanceReclassResult } from "./history";
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
      select: { id: true, companyCode: true, year: true, endDate: true, isClosed: true },
    });
    if (periods.length !== periodIds.length) return serviceError("部分会计期间不存在", 404);
    const periodMap = new Map(periods.map((period) => [period.id, period]));
    const restoreChanges = changes.filter((change) => change.operation === "restore_auto");
    if (restoreChanges.some((change) => periodMap.get(change.periodId)?.isClosed)) {
      return serviceError("已结账期间不能恢复自动分类，可继续保留或人工调整当前结果", 409);
    }

    const accounts = await tx.financeAccount.findMany({
      where: {
        isActive: true,
        OR: changes.map((change) => {
          const period = periodMap.get(change.periodId)!;
          return { companyCode: period.companyCode, year: period.year, code: change.sourceAccountCode };
        }),
      },
      select: { id: true, companyCode: true, year: true, code: true, balanceDirection: true },
    });
    const accountMap = new Map(accounts.map((account) => [`${account.companyCode}::${account.year}::${account.code}`, account]));
    for (const change of changes) {
      const period = periodMap.get(change.periodId)!;
      const prefix = `${period.companyCode}::${period.year}::`;
      if (!accountMap.has(`${prefix}${change.sourceAccountCode}`)) {
        return serviceError(`源科目 ${change.sourceAccountCode} 在对应公司和年度中不存在或已停用`, 400);
      }
    }

    const sourcePolicyByKey = new Map<string, {
      policyVersionId: number;
      sourceGroupAccountId: number;
      balanceDirection: string;
    }>();
    const versionIds = new Set<number>();
    for (const period of periods) {
      const periodChanges = changes.filter((change) => change.periodId === period.id);
      const sourceAccounts = periodChanges.map((change) => (
        accountMap.get(`${period.companyCode}::${period.year}::${change.sourceAccountCode}`)!
      ));
      const groupMap = await loadFinanceGroupAccountMapByAccountIdsAtInTransaction(
        tx,
        sourceAccounts.map((account) => account.id),
        period.endDate,
      );
      versionIds.add(groupMap.policyVersion.id);
      for (const account of sourceAccounts) {
        const groupAccount = groupMap.mappings.get(account.id);
        if (!groupAccount) {
          return serviceError(`源科目 ${account.code} 在 ${groupMap.policyVersion.code} 中没有集团科目映射`, 409);
        }
        sourcePolicyByKey.set(`${period.id}::${account.code}`, {
          policyVersionId: groupMap.policyVersion.id,
          sourceGroupAccountId: groupAccount.id,
          balanceDirection: groupAccount.balanceDirection,
        });
      }
    }
    const manualChanges = changes.filter((change) => change.operation === "manual");
    const [ruleRows, parentRevisions] = await Promise.all([
      manualChanges.length === 0 ? [] : tx.financeReclassRule.findMany({
        where: {
          enabled: true,
          source: "manual",
          confirmedBy: { not: null },
          confirmedAt: { not: null },
        },
        select: {
          id: true,
          policyVersionId: true,
          sourceGroupAccountId: true,
          targetGroupAccountId: true,
          sourceAccountCode: true,
          abnormalSide: true,
          decision: true,
          basis: true,
          targetAccountCode: true,
          enabled: true,
        },
      }),
      tx.financeGroupAccountRevision.findMany({
        where: { policyVersionId: { in: [...versionIds] }, isActive: true },
        select: { groupAccountId: true, parentGroupAccountId: true },
      }),
    ]);
    const parentByGroupAccountId = new Map(parentRevisions.map((revision) => [
      revision.groupAccountId,
      revision.parentGroupAccountId,
    ]));
    const basisByKey = new Map<string, "account_net" | "counterparty_gross">();
    for (const change of manualChanges) {
      const key = `${change.periodId}::${change.sourceAccountCode}`;
      const sourcePolicy = sourcePolicyByKey.get(key)!;
      const rule = resolveGroupReclassRule(
        sourcePolicy.sourceGroupAccountId,
        oppositeBalanceSide(sourcePolicy.balanceDirection),
        ruleRows.filter((row) => row.policyVersionId === sourcePolicy.policyVersionId),
        parentByGroupAccountId,
      );
      basisByKey.set(key, rule ? normalizeReclassBasis(rule.basis) : "account_net");
    }
    const requestedTargetCodes = [...new Set(changes.flatMap((change) => (
      change.operation === "manual" && change.decision === "reclassify" && change.targetAccountCode
        ? [change.targetAccountCode]
        : []
    )))];
    const targetRevisions = requestedTargetCodes.length === 0 ? [] : await tx.financeGroupAccountRevision.findMany({
      where: {
        policyVersionId: { in: [...versionIds] },
        code: { in: requestedTargetCodes },
        isActive: true,
      },
      select: { policyVersionId: true, groupAccountId: true, code: true },
    });
    const targetGroupByVersionCode = new Map(targetRevisions.map((revision) => [
      `${revision.policyVersionId}::${revision.code}`,
      revision.groupAccountId,
    ]));
    for (const change of changes) {
      if (change.operation !== "manual" || change.decision !== "reclassify") continue;
      const sourcePolicy = sourcePolicyByKey.get(`${change.periodId}::${change.sourceAccountCode}`)!;
      const targetGroupAccountId = change.targetAccountCode
        ? targetGroupByVersionCode.get(`${sourcePolicy.policyVersionId}::${change.targetAccountCode}`)
        : undefined;
      if (!targetGroupAccountId) {
        return serviceError("目标集团科目在该期间生效的政策版本中不存在或已停用", 400);
      }
      if (targetGroupAccountId === sourcePolicy.sourceGroupAccountId) {
        return serviceError("目标集团科目不能与源集团科目相同", 400);
      }
    }

    const netChanges = manualChanges.filter((change) => basisByKey.get(`${change.periodId}::${change.sourceAccountCode}`) === "account_net");
    const grossChanges = manualChanges.filter((change) => basisByKey.get(`${change.periodId}::${change.sourceAccountCode}`) === "counterparty_gross");
    const [balances, auxiliaryRows] = await Promise.all([
      netChanges.length === 0 ? [] : tx.financeAccountBalance.findMany({
        where: {
          OR: netChanges.map((change) => {
            const period = periodMap.get(change.periodId)!;
            const account = accountMap.get(`${period.companyCode}::${period.year}::${change.sourceAccountCode}`)!;
            return { periodId: change.periodId, accountId: account.id };
          }),
        },
        select: { periodId: true, closingDebit: true, closingCredit: true, account: { select: { code: true, balanceDirection: true } } },
      }),
      grossChanges.length === 0 ? [] : tx.financeAuxiliaryBalance.findMany({
        where: {
          OR: grossChanges.map((change) => {
            const period = periodMap.get(change.periodId)!;
            const account = accountMap.get(`${period.companyCode}::${period.year}::${change.sourceAccountCode}`)!;
            return { periodId: change.periodId, accountId: account.id };
          }),
        },
        select: { periodId: true, accountId: true, closingDebit: true, closingCredit: true },
      }),
    ]);
    const balanceMap = new Map(balances.map((row) => [`${row.periodId}::${row.account.code}`, row]));
    const accountCodeById = new Map(accounts.map((account) => [account.id, account.code]));
    const auxiliaryRowsByKey = new Map<string, typeof auxiliaryRows>();
    for (const row of auxiliaryRows) {
      const code = accountCodeById.get(row.accountId);
      if (!code) continue;
      const key = `${row.periodId}::${code}`;
      const rows = auxiliaryRowsByKey.get(key) ?? [];
      rows.push(row);
      auxiliaryRowsByKey.set(key, rows);
    }
    const amounts = new Map<string, number>();
    for (const change of manualChanges) {
      const key = `${change.periodId}::${change.sourceAccountCode}`;
      if (basisByKey.get(key) === "counterparty_gross") {
        const rows = auxiliaryRowsByKey.get(key) ?? [];
        if (change.decision === "reclassify" && rows.length === 0) {
          return serviceError(`科目 ${change.sourceAccountCode} 的规则按往来户逐户口径计算，但本期无辅助余额事实，无法按该口径重分类`, 409);
        }
        amounts.set(key, rows.length === 0
          ? 0
          : counterpartyGrossAbnormalAmount(rows, sourcePolicyByKey.get(key)!.balanceDirection));
        continue;
      }
      const balance = balanceMap.get(key);
      const amount = balance ? currentReverseBalanceAmount(balance) : null;
      if (change.decision === "reclassify") {
        if (!balance) return serviceError(`科目 ${change.sourceAccountCode} 没有可调整的期末余额`, 409);
        if (amount === null) return serviceError(`科目 ${change.sourceAccountCode} 当前不是期末反向余额`, 409);
      }
      amounts.set(key, amount ?? 0);
    }

    const existing = await tx.financeBalanceReclassAdjustment.findMany({
      where: {
        OR: changes.map((change) => ({ periodId: change.periodId, sourceAccountCode: change.sourceAccountCode })),
      },
      select: {
        id: true,
        periodId: true,
        companyCode: true,
        year: true,
        sourceAccountCode: true,
        targetAccountCode: true,
        amount: true,
        decision: true,
        sourceType: true,
        status: true,
        ruleId: true,
        policyVersionId: true,
        sourceGroupAccountId: true,
        targetGroupAccountId: true,
        adjustedBy: true,
        adjustedAt: true,
        note: true,
      },
    });
    const existingByKey = new Map(existing.map((row) => [`${row.periodId}::${row.sourceAccountCode}`, row]));
    for (const change of restoreChanges) {
      const row = existingByKey.get(`${change.periodId}::${change.sourceAccountCode}`);
      if (!row || row.sourceType !== "manual") {
        return serviceError(`科目 ${change.sourceAccountCode} 当前不是人工分类，不能恢复自动分类`, 409);
      }
    }

    const adjustedAt = new Date();
    let saved = 0;
    let unchanged = 0;
    for (const change of manualChanges) {
      const period = periodMap.get(change.periodId)!;
      const key = `${change.periodId}::${change.sourceAccountCode}`;
      const row = existingByKey.get(key);
      const sourcePolicy = sourcePolicyByKey.get(key)!;
      const targetGroupAccountId = change.decision === "reclassify" && change.targetAccountCode
        ? targetGroupByVersionCode.get(`${sourcePolicy.policyVersionId}::${change.targetAccountCode}`) ?? null
        : null;
      const next = {
        policyVersionId: sourcePolicy.policyVersionId,
        sourceGroupAccountId: sourcePolicy.sourceGroupAccountId,
        targetGroupAccountId,
        targetAccountCode: change.decision === "reclassify" ? change.targetAccountCode ?? null : null,
        amount: amounts.get(key)!,
        decision: change.decision!,
        basis: basisByKey.get(key)!,
        sourceType: "manual",
        ruleId: null,
        status: "adjusted",
        note: JSON.stringify({ basis: "manual_closing_balance", decision: change.decision }),
        adjustedBy: userId,
        adjustedAt,
      };
      if (row) {
        const snapshot = { ...row, amount: Number(row.amount) };
        if (hasSameBalanceReclassResult(snapshot, next)) {
          unchanged += 1;
          continue;
        }
        await archiveBalanceReclassAdjustment(tx, snapshot, "manual_override", userId);
        await tx.financeBalanceReclassAdjustment.update({ where: { id: row.id }, data: next });
      } else {
        await tx.financeBalanceReclassAdjustment.create({ data: {
          periodId: change.periodId,
          companyCode: period.companyCode,
          year: period.year,
          sourceAccountCode: change.sourceAccountCode,
          ...next,
        } });
      }
      saved += 1;
    }

    for (const change of restoreChanges) {
      const row = existingByKey.get(`${change.periodId}::${change.sourceAccountCode}`)!;
      await archiveBalanceReclassAdjustment(tx, { ...row, amount: Number(row.amount) }, "manual_restored_to_automatic", userId);
      await tx.financeBalanceReclassAdjustment.delete({ where: { id: row.id } });
    }
    const automatic = restoreChanges.length === 0
      ? { written: 0, updated: 0, deleted: 0, skippedProtected: 0 }
      : await materializeAutomaticRuleAdjustments(tx, {
          periodIds: restoreChanges.map((change) => change.periodId),
          sourceGroupAccountIds: restoreChanges.flatMap((change) => {
            const row = existingByKey.get(`${change.periodId}::${change.sourceAccountCode}`);
            return row?.sourceGroupAccountId ? [row.sourceGroupAccountId] : [];
          }),
          actorUserId: userId,
        });

    return serviceOk({
      success: true,
      saved,
      restored: restoreChanges.length,
      unchanged,
      automatic,
    });
  }, { maxWait: 10_000, timeout: 60_000 });
}
