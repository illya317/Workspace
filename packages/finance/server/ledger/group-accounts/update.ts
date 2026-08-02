import { serviceError, serviceOk } from "@workspace/platform/service-result";
import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";
import { Prisma, prisma } from "@workspace/platform/server/prisma";

import {
  buildUpdateFinanceGroupAccountCommand,
  type UpdateFinanceGroupAccountCommandInput,
} from "../../domain/group-chart-validation";

class FinanceGroupAccountUpdateConflictError extends Error {}

export async function updateFinanceGroupAccount(input: UpdateFinanceGroupAccountCommandInput) {
  const command = buildUpdateFinanceGroupAccountCommand(input);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status);
  const data = command.data.input;
  const direct = await assertBusinessActionDirectExecutionAllowed({
    businessActionKey: "finance.ledger.groupAccount.update",
    actorUserId: data.userId,
    resourceKey: "finance.ledger",
    scopeType: "global",
    scopeId: null,
    blockedMessage: "集团科目编辑已配置为必须走流程，请从统一保存入口提交",
  });
  if (!direct.ok) return direct;

  const currentVersion = await prisma.financeAccountingPolicyVersion.findFirst({
    where: { status: "published", effectiveTo: null },
    select: { id: true },
  });
  if (!currentVersion) return serviceError("缺少当前生效的集团科目版本", 409);
  const [revision, allRevisions, duplicateCode, stableCodeAccount] = await Promise.all([
    prisma.financeGroupAccountRevision.findUnique({
      where: { policyVersionId_groupAccountId: {
        policyVersionId: currentVersion.id,
        groupAccountId: data.groupAccountId,
      } },
      include: { groupAccount: true },
    }),
    prisma.financeGroupAccountRevision.findMany({
      where: { policyVersionId: currentVersion.id },
      select: { groupAccountId: true, parentGroupAccountId: true },
    }),
    prisma.financeGroupAccountRevision.findFirst({
      where: {
        policyVersionId: currentVersion.id,
        code: data.code,
        groupAccountId: { not: data.groupAccountId },
      },
      select: { id: true },
    }),
    prisma.financeGroupAccount.findFirst({
      where: { code: data.code, id: { not: data.groupAccountId } },
      select: { id: true },
    }),
  ]);
  if (!revision) return serviceError("集团科目不存在或不属于当前版本", 404);
  if (duplicateCode || stableCodeAccount) return serviceError("集团科目编码已存在", 409);
  if (data.parentGroupAccountId === data.groupAccountId) return serviceError("集团科目不能以自身作为上级", 400);
  if (data.parentGroupAccountId !== null) {
    const parent = await prisma.financeGroupAccountRevision.findUnique({
      where: { policyVersionId_groupAccountId: {
        policyVersionId: currentVersion.id,
        groupAccountId: data.parentGroupAccountId,
      } },
    });
    if (!parent?.isActive || parent.reviewStatus === "pending_delete") {
      return serviceError("上级集团科目不存在、未启用或待删除", 400);
    }
    if (parent.category !== data.category) return serviceError("上级集团科目必须与当前科目类别一致", 400);
    if (wouldCreateCycle(data.groupAccountId, data.parentGroupAccountId, allRevisions)) {
      return serviceError("集团科目层级不能形成循环", 400);
    }
  }

  const { mappingCount } = await countFinanceGroupAccountReferences(data.groupAccountId, currentVersion.id);
  if ((revision.category !== data.category || revision.balanceDirection !== data.balanceDirection) && mappingCount > 0) {
    const incompatible = await prisma.financeGroupAccountMapping.count({
      where: {
        groupAccountId: data.groupAccountId,
        OR: [
          { localCategory: { not: data.category } },
          { localBalanceDirection: { not: data.balanceDirection } },
        ],
      },
    });
    if (incompatible > 0) return serviceError("已有公司科目的属性与本次修改不一致，请先调整映射", 409);
  }
  const parent = data.parentGroupAccountId === null
    ? null
    : await prisma.financeGroupAccountRevision.findUnique({
        where: { policyVersionId_groupAccountId: {
          policyVersionId: currentVersion.id,
          groupAccountId: data.parentGroupAccountId,
        } },
        select: { subjectLevel: true },
      });
  const subjectLevel = parent ? (parent.subjectLevel ?? 0) + 1 : 1;

  try {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.financeGroupAccountRevision.updateMany({
        where: { id: revision.id, updatedAt: new Date(data.expectedUpdatedAt) },
        data: {
          code: data.code,
          name: data.name,
          category: data.category,
          balanceDirection: data.balanceDirection,
          mnemonicCode: data.mnemonicCode,
          currency: data.currency,
          subjectLevel,
          parentGroupAccountId: data.parentGroupAccountId,
          consolidationRole: data.consolidationRole,
          counterpartyRequirement: data.counterpartyRequirement,
          movementType: data.movementType,
          translationRateType: data.translationRateType,
        },
      });
      if (updated.count !== 1) throw new FinanceGroupAccountUpdateConflictError();
      await tx.financeGroupAccount.update({ where: { id: data.groupAccountId }, data: {
        code: data.code,
        name: data.name,
        category: data.category,
        balanceDirection: data.balanceDirection,
        mnemonicCode: data.mnemonicCode,
        currency: data.currency,
        subjectLevel,
        parentId: data.parentGroupAccountId,
      } });
      if (revision.code !== data.code) {
        await tx.financeAccount.updateMany({
          where: { groupSubjectCode: revision.code },
          data: { groupSubjectCode: data.code },
        });
        await tx.financeReclassRule.updateMany({
          where: { policyVersionId: currentVersion.id, sourceGroupAccountId: data.groupAccountId },
          data: { sourceAccountCode: data.code },
        });
        await tx.financeReclassRule.updateMany({
          where: { policyVersionId: currentVersion.id, targetGroupAccountId: data.groupAccountId },
          data: { targetAccountCode: data.code },
        });
        await tx.financeBalanceReclassAdjustment.updateMany({
          where: { policyVersionId: currentVersion.id, sourceGroupAccountId: data.groupAccountId },
          data: { sourceAccountCode: data.code },
        });
        await tx.financeBalanceReclassAdjustment.updateMany({
          where: { policyVersionId: currentVersion.id, targetGroupAccountId: data.groupAccountId },
          data: { targetAccountCode: data.code },
        });
      }
    });
    return serviceOk({ success: true });
  } catch (error) {
    if (error instanceof FinanceGroupAccountUpdateConflictError) {
      return serviceError("集团科目已被其他操作修改，请刷新后重试", 409);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return serviceError("集团科目编码已存在，请刷新后重试", 409);
    }
    throw error;
  }
}

export async function countFinanceGroupAccountReferences(groupAccountId: number, policyVersionId: number) {
  const [mappingCount, childCount, ruleCount, adjustmentCount] = await Promise.all([
    prisma.financeGroupAccountMapping.count({ where: { groupAccountId } }),
    prisma.financeGroupAccountRevision.count({
      where: { policyVersionId, parentGroupAccountId: groupAccountId },
    }),
    prisma.financeReclassRule.count({ where: { OR: [
      { sourceGroupAccountId: groupAccountId },
      { targetGroupAccountId: groupAccountId },
    ] } }),
    prisma.financeBalanceReclassAdjustment.count({ where: { OR: [
      { sourceGroupAccountId: groupAccountId },
      { targetGroupAccountId: groupAccountId },
    ] } }),
  ]);
  return { mappingCount, childCount, ruleCount, adjustmentCount };
}

function wouldCreateCycle(
  groupAccountId: number,
  parentGroupAccountId: number,
  revisions: Array<{ groupAccountId: number; parentGroupAccountId: number | null }>,
) {
  const parentById = new Map(revisions.map((revision) => [revision.groupAccountId, revision.parentGroupAccountId]));
  let cursor: number | null = parentGroupAccountId;
  const seen = new Set<number>();
  while (cursor !== null && !seen.has(cursor)) {
    if (cursor === groupAccountId) return true;
    seen.add(cursor);
    cursor = parentById.get(cursor) ?? null;
  }
  return false;
}
