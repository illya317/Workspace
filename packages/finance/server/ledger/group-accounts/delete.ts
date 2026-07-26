import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";
import { guardedDelete } from "@workspace/platform/server/delete-guard";

import {
  buildDeleteFinanceGroupAccountCommand,
  type DeleteFinanceGroupAccountCommandInput,
} from "../../domain/group-chart-validation";

export async function deleteFinanceGroupAccount(input: DeleteFinanceGroupAccountCommandInput) {
  const command = buildDeleteFinanceGroupAccountCommand(input);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status);
  const data = command.data.input;
  const direct = await assertBusinessActionDirectExecutionAllowed({
    businessActionKey: "finance.ledger.groupAccount.delete",
    actorUserId: data.userId,
    resourceKey: "finance.ledger",
    scopeType: "global",
    scopeId: null,
    blockedMessage: "集团科目删除已配置为必须走流程，请从统一删除入口提交",
  });
  if (!direct.ok) return direct;

  return hardDeleteFinanceGroupAccount(data.groupAccountId, data.userId);
}

export async function hardDeleteFinanceGroupAccount(groupAccountId: number, userId: number) {
  let currentVersionId: number | null = null;
  const result = await guardedDelete({
    entityType: "FinanceGroupAccount",
    modelKey: "financeGroupAccount",
    id: groupAccountId,
    userId,
    actionLabel: "删除集团科目",
    deleteMode: "hard",
    auditPolicy: "none",
    referencePolicy: "checked",
    scopeGuard: async ({ tx }) => {
      const currentVersion = await tx.financeAccountingPolicyVersion.findFirst({
        where: { status: "published", effectiveTo: null },
        select: { id: true },
      });
      if (!currentVersion) return { error: "缺少当前生效的集团科目版本", status: 409 };
      currentVersionId = currentVersion.id;
      return { ok: true };
    },
    references: [
      {
        label: "公司科目映射",
        count: (tx) => tx.financeGroupAccountMapping.count({ where: { groupAccountId: groupAccountId } }),
      },
      {
        label: "下级集团科目",
        count: (tx) => tx.financeGroupAccount.count({ where: { parentId: groupAccountId } }),
      },
      {
        label: "版本层级中的下级集团科目",
        count: (tx) => tx.financeGroupAccountRevision.count({ where: { parentGroupAccountId: groupAccountId } }),
      },
      {
        label: "历史集团科目版本",
        count: (tx) => tx.financeGroupAccountRevision.count({
          where: {
            groupAccountId: groupAccountId,
            ...(currentVersionId === null ? {} : { policyVersionId: { not: currentVersionId } }),
          },
        }),
      },
      {
        label: "重分类规则",
        count: (tx) => tx.financeReclassRule.count({
          where: { OR: [
            { sourceGroupAccountId: groupAccountId },
            { targetGroupAccountId: groupAccountId },
          ] },
        }),
      },
      {
        label: "重分类结果",
        count: (tx) => tx.financeBalanceReclassAdjustment.count({
          where: { OR: [
            { sourceGroupAccountId: groupAccountId },
            { targetGroupAccountId: groupAccountId },
          ] },
        }),
      },
      {
        label: "当前集团科目版本",
        policy: "cascade",
        count: (tx) => currentVersionId === null
          ? Promise.resolve(0)
          : tx.financeGroupAccountRevision.count({
              where: { groupAccountId: groupAccountId, policyVersionId: currentVersionId },
            }),
        cleanup: (tx) => currentVersionId === null
          ? Promise.resolve()
          : tx.financeGroupAccountRevision.deleteMany({
              where: { groupAccountId: groupAccountId, policyVersionId: currentVersionId },
            }).then(() => undefined),
      },
    ],
  });

  return result.ok
    ? serviceOk({ success: true })
    : serviceError(result.error, result.status ?? 400);
}
