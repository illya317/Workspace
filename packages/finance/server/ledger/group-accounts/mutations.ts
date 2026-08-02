import { serviceError, serviceOk } from "@workspace/platform/service-result";
import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";
import { prisma } from "@workspace/platform/server/prisma";

import {
  buildSaveFinanceGroupAccountMappingChangeSetCommand,
  type SaveFinanceGroupAccountMappingChangeSetInput,
} from "../../domain/group-chart-validation";
import { materializeAutomaticRuleAdjustments } from "../balance-reclass/automatic";
import { materializeAuxiliaryAdjustments } from "../reclass-rules/materialize";

class FinanceGroupAccountMappingConflictError extends Error {}

export async function saveFinanceGroupAccountMappingChangeSet(
  input: SaveFinanceGroupAccountMappingChangeSetInput,
) {
  const command = buildSaveFinanceGroupAccountMappingChangeSetCommand(input);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status);
  const { userId, changes } = command.data.input;
  const direct = await assertBusinessActionDirectExecutionAllowed({
    businessActionKey: "finance.ledger.groupAccountMapping.save",
    actorUserId: userId,
    resourceKey: "finance.ledger",
    scopeType: "global",
    scopeId: null,
    blockedMessage: "科目映射复核已配置为必须走流程，请从统一保存入口提交",
  });
  if (!direct.ok) return direct;

  const mappingIds = changes.map((change) => change.mappingId);
  const mappings = await prisma.financeGroupAccountMapping.findMany({
    where: { id: { in: mappingIds } },
    include: { policyVersion: true },
  });
  if (mappings.length !== mappingIds.length) return serviceError("科目映射不存在或已被删除", 404);
  if (mappings.some((mapping) => mapping.policyVersion.status !== "published" || mapping.policyVersion.effectiveTo !== null)) {
    return serviceError("历史会计政策版本已冻结，不能修改科目映射", 409);
  }

  const mappingById = new Map(mappings.map((mapping) => [mapping.id, mapping]));
  const targetIdsByVersion = new Map<number, Set<number>>();
  for (const change of changes) {
    const versionId = mappingById.get(change.mappingId)!.policyVersionId;
    const ids = targetIdsByVersion.get(versionId) ?? new Set<number>();
    ids.add(change.targetGroupAccountId);
    targetIdsByVersion.set(versionId, ids);
  }
  const targetRevisions = await prisma.financeGroupAccountRevision.findMany({
    where: {
      OR: [...targetIdsByVersion].map(([policyVersionId, ids]) => ({
        policyVersionId,
        groupAccountId: { in: [...ids] },
        isActive: true,
        reviewStatus: { not: "pending_delete" },
      })),
    },
  });
  const targetByVersionGroup = new Map(targetRevisions.map((revision) => [
    `${revision.policyVersionId}:${revision.groupAccountId}`,
    revision,
  ]));
  const missingTarget = changes.find((change) => {
    const mapping = mappingById.get(change.mappingId)!;
    return !targetByVersionGroup.has(`${mapping.policyVersionId}:${change.targetGroupAccountId}`);
  });
  if (missingTarget) return serviceError("目标集团科目不存在或在当前版本未启用", 400);
  const incompatibleTarget = changes.find((change) => {
    const mapping = mappingById.get(change.mappingId)!;
    const target = targetByVersionGroup.get(`${mapping.policyVersionId}:${change.targetGroupAccountId}`)!;
    return target.category !== mapping.localCategory
      || target.balanceDirection !== mapping.localBalanceDirection;
  });
  if (incompatibleTarget) return serviceError("目标集团科目必须与本地科目的类别和余额方向一致", 400);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const affectedPeriodIds = new Set<number>();
      const affectedGroupIdsByVersion = new Map<number, Set<number>>();
      let saved = 0;

      for (const change of changes) {
        const mapping = mappingById.get(change.mappingId)!;
        if (mapping.groupAccountId === change.targetGroupAccountId) {
          if (mapping.mappingMethod === "manual_override" || mapping.mappingMethod === "hierarchy_match") continue;
          const confirmation = await tx.financeGroupAccountMapping.updateMany({
            where: { id: mapping.id, updatedAt: new Date(change.expectedUpdatedAt) },
            data: { mappingMethod: "manual_override" },
          });
          if (confirmation.count !== 1) {
            throw new FinanceGroupAccountMappingConflictError(`科目映射 ${mapping.localAccountCode} 已被其他操作修改，请刷新后重试`);
          }
          saved += 1;
          continue;
        }
        const accounts = await tx.financeAccount.findMany({
          where: accountScopeWhere(mapping),
          select: { id: true },
        });
        const accountIds = accounts.map((account) => account.id);
        if (accountIds.length > 0) {
          const [balancePeriods, auxiliaryPeriods] = await Promise.all([
            tx.financeAccountBalance.findMany({
              where: { accountId: { in: accountIds } },
              distinct: ["periodId"],
              select: { periodId: true },
            }),
            tx.financeAuxiliaryBalance.findMany({
              where: { accountId: { in: accountIds } },
              distinct: ["periodId"],
              select: { periodId: true },
            }),
          ]);
          for (const row of [...balancePeriods, ...auxiliaryPeriods]) affectedPeriodIds.add(row.periodId);
        }

        const update = await tx.financeGroupAccountMapping.updateMany({
          where: { id: mapping.id, updatedAt: new Date(change.expectedUpdatedAt) },
          data: { groupAccountId: change.targetGroupAccountId, mappingMethod: "manual_override" },
        });
        if (update.count !== 1) {
          throw new FinanceGroupAccountMappingConflictError(`科目映射 ${mapping.localAccountCode} 已被其他操作修改，请刷新后重试`);
        }
        const targetRevision = targetByVersionGroup.get(`${mapping.policyVersionId}:${change.targetGroupAccountId}`)!;
        if (accountIds.length > 0) {
          await tx.financeAccount.updateMany({
            where: { id: { in: accountIds } },
            data: { groupSubjectCode: targetRevision.code },
          });
        }
        const affectedGroupIds = affectedGroupIdsByVersion.get(mapping.policyVersionId) ?? new Set<number>();
        if (mapping.groupAccountId !== null) affectedGroupIds.add(mapping.groupAccountId);
        affectedGroupIds.add(change.targetGroupAccountId);
        affectedGroupIdsByVersion.set(mapping.policyVersionId, affectedGroupIds);
        saved += 1;
      }

      let adjustmentsUpdated = 0;
      for (const [policyVersionId, groupIds] of affectedGroupIdsByVersion) {
        const auxiliary = await materializeAuxiliaryAdjustments(tx, policyVersionId, [...groupIds], userId);
        adjustmentsUpdated += auxiliary.written + auxiliary.updated + auxiliary.deleted;
      }
      if (affectedPeriodIds.size > 0) {
        const automatic = await materializeAutomaticRuleAdjustments(tx, {
          periodIds: [...affectedPeriodIds],
          actorUserId: userId,
        });
        adjustmentsUpdated += automatic.written + automatic.updated + automatic.deleted;
      }
      return { saved, adjustmentsUpdated };
    }, { maxWait: 10_000, timeout: 120_000 });
    return serviceOk({ success: true, ...result });
  } catch (error) {
    if (error instanceof FinanceGroupAccountMappingConflictError) return serviceError(error.message, 409);
    throw error;
  }
}

function accountScopeWhere(mapping: {
  companyCode: string;
  localAccountCode: string;
  sourceSystem: string | null;
  sourceDatabase: string | null;
  sourceLedger: string | null;
}) {
  return {
    companyCode: mapping.companyCode,
    code: mapping.localAccountCode,
    sourceSystem: mapping.sourceSystem,
    ...(mapping.sourceLedger
      ? { sourceLedger: mapping.sourceLedger }
      : mapping.sourceDatabase
        ? { sourceLedger: null, sourceDatabase: mapping.sourceDatabase }
        : { sourceLedger: null, sourceDatabase: null }),
  };
}
