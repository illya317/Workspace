import { serviceError, serviceOk } from "@workspace/platform/service-result";
import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";
import { Prisma, prisma } from "@workspace/platform/server/prisma";

import {
  buildCreateFinanceGroupAccountCommand,
  type CreateFinanceGroupAccountCommandInput,
} from "../../domain/group-chart-validation";

export async function createFinanceGroupAccount(input: CreateFinanceGroupAccountCommandInput) {
  const command = buildCreateFinanceGroupAccountCommand(input);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status);
  const data = command.data.input;
  const direct = await assertBusinessActionDirectExecutionAllowed({
    businessActionKey: "finance.ledger.groupAccount.create",
    actorUserId: data.userId,
    resourceKey: "finance.ledger",
    scopeType: "global",
    scopeId: null,
    blockedMessage: "集团科目新建已配置为必须走流程，请从统一保存入口提交",
  });
  if (!direct.ok) return direct;

  const policyVersion = await prisma.financeAccountingPolicyVersion.findFirst({
    where: { status: "published", effectiveTo: null },
  });
  if (!policyVersion) return serviceError("缺少当前生效的集团科目版本", 409);
  const [parentRevision, codeRevision, stableCodeAccount, currency] = await Promise.all([
    data.parentGroupAccountId === null ? null : prisma.financeGroupAccountRevision.findUnique({
      where: { policyVersionId_groupAccountId: {
        policyVersionId: policyVersion.id,
        groupAccountId: data.parentGroupAccountId,
      } },
    }),
    prisma.financeGroupAccountRevision.findUnique({
      where: { policyVersionId_code: { policyVersionId: policyVersion.id, code: data.code } },
    }),
    prisma.financeGroupAccount.findUnique({ where: { code: data.code } }),
    prisma.financeCurrencyCatalog.findFirst({ where: { id: data.currencyId, isActive: true }, select: { id: true } }),
  ]);
  if (!currency) return serviceError("币种不存在或未启用", 400);
  if (data.parentGroupAccountId !== null) {
    if (!parentRevision?.isActive || parentRevision.reviewStatus === "pending_delete") {
      return serviceError("上级集团科目不存在、未启用或待删除", 400);
    }
    if (parentRevision.category !== data.category) return serviceError("上级集团科目必须与新科目类别一致", 400);
  }
  if (codeRevision) return serviceError("当前版本已存在该集团科目编码", 409);
  if (stableCodeAccount) return serviceError("该集团科目编码已被历史科目占用", 409);
  const subjectLevel = parentRevision ? (parentRevision.subjectLevel ?? 0) + 1 : 1;

  try {
    const groupAccount = await prisma.$transaction(async (tx) => {
      const created = await tx.financeGroupAccount.create({ data: {
        code: data.code,
        name: data.name,
        category: data.category,
        balanceDirection: data.balanceDirection,
        mnemonicCode: data.mnemonicCode,
        currencyId: data.currencyId,
        subjectLevel,
        parentId: data.parentGroupAccountId,
        sourceKind: "manual",
        reviewStatus: "pending_review",
        originCompanyCode: null,
        originSourceScopeKey: null,
        originLocalAccountCode: null,
      } });
      await tx.financeGroupAccountRevision.create({ data: {
        policyVersionId: policyVersion.id,
        groupAccountId: created.id,
        code: data.code,
        name: data.name,
        category: data.category,
        balanceDirection: data.balanceDirection,
        mnemonicCode: data.mnemonicCode,
        currencyId: data.currencyId,
        subjectLevel,
        parentGroupAccountId: data.parentGroupAccountId,
        isActive: true,
        reviewStatus: "pending_review",
        consolidationRole: data.consolidationRole,
        counterpartyRequirement: data.counterpartyRequirement,
        movementType: data.movementType,
        translationRateType: data.translationRateType,
      } });
      return created;
    });
    return serviceOk({ success: true, groupAccountId: groupAccount.id, policyVersionId: policyVersion.id });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return serviceError("集团科目编码已存在，请刷新后重试", 409);
    }
    throw error;
  }
}
