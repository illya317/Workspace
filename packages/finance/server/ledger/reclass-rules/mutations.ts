import { serviceError, serviceOk } from "@workspace/platform/service-result";
import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";
import { prisma } from "@workspace/platform/server/prisma";

import {
  buildSaveReclassRuleChangeSetCommand,
  type SaveReclassRuleChangeSetInput,
} from "../validation";
import { AutomaticReclassConflictError } from "../balance-reclass/automatic";
import { loadGroupAccountIdsWithAuxiliaryFacts } from "./candidates";
import { materializeConfirmedReclassAdjustments } from "./materialize-confirmed";
import { ReclassMaterializationConflictError } from "./materialize";

export async function saveReclassRuleChangeSet(input: SaveReclassRuleChangeSetInput) {
  const command = buildSaveReclassRuleChangeSetCommand(input);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status);
  const { userId, policyVersionId, changes } = command.data.input;
  const direct = await assertBusinessActionDirectExecutionAllowed({
    businessActionKey: "finance.ledger.reclassRule.save",
    actorUserId: userId,
    resourceKey: "finance.ledger",
    scopeType: "global",
    scopeId: null,
    blockedMessage: "重分类规则已配置为必须走流程，请从统一保存入口提交",
  });
  if (!direct.ok) return direct;

  const policyVersion = await prisma.financeAccountingPolicyVersion.findFirst({
    where: { id: policyVersionId, status: "published" },
  });
  if (!policyVersion) return serviceError("会计政策版本不存在或尚未发布", 404);
  if (policyVersion.effectiveTo !== null) return serviceError("历史会计政策版本已冻结，不能修改", 409);

  const groupAccountIds = [...new Set(changes.flatMap((change) => [
    change.sourceGroupAccountId,
    ...(change.targetGroupAccountId ? [change.targetGroupAccountId] : []),
  ]))];
  const revisions = await prisma.financeGroupAccountRevision.findMany({
    where: {
      policyVersionId,
      groupAccountId: { in: groupAccountIds },
      isActive: true,
    },
    select: { groupAccountId: true, code: true },
  });
  const revisionByGroupAccountId = new Map(revisions.map((revision) => [revision.groupAccountId, revision]));
  const missingIds = groupAccountIds.filter((id) => !revisionByGroupAccountId.has(id));
  if (missingIds.length > 0) return serviceError(`集团科目不存在或在当前版本未启用：${missingIds.join("、")}`, 400);

  const sourceGroupAccountIds = [...new Set(changes.map((change) => change.sourceGroupAccountId))];
  const sourceMappings = await prisma.financeGroupAccountMapping.findMany({
    where: { policyVersionId, groupAccountId: { in: sourceGroupAccountIds } },
    select: { companyCode: true, sourceScopeKey: true, localAccountCode: true, groupAccountId: true },
  });
  const auxiliaryFactGroupIds = await loadGroupAccountIdsWithAuxiliaryFacts(sourceMappings);

  const now = new Date();
  let saved = 0;
  let noReclass = 0;
  let adjustmentsUpdated = 0;
  try {
    await prisma.$transaction(async (tx) => {
      for (const change of changes) {
        const sourceRevision = revisionByGroupAccountId.get(change.sourceGroupAccountId)!;
        const targetRevision = change.targetGroupAccountId
          ? revisionByGroupAccountId.get(change.targetGroupAccountId)!
          : null;
        const key = {
          policyVersionId_sourceGroupAccountId_abnormalSide: {
            policyVersionId,
            sourceGroupAccountId: change.sourceGroupAccountId,
            abnormalSide: change.abnormalSide,
          },
        };
        const data = {
          policyVersionId,
          sourceGroupAccountId: change.sourceGroupAccountId,
          targetGroupAccountId: change.targetGroupAccountId,
          sourceAccountCode: sourceRevision.code,
          abnormalSide: change.abnormalSide,
          decision: change.targetGroupAccountId === null ? "no_reclass" : "reclassify",
          basis: change.basis ?? (auxiliaryFactGroupIds.has(change.sourceGroupAccountId)
            ? "counterparty_gross"
            : "account_net"),
          targetAccountCode: targetRevision?.code ?? null,
          enabled: true,
          source: "manual",
          confirmedBy: userId,
          confirmedAt: now,
        };
        await tx.financeReclassRule.upsert({
          where: key,
          create: data,
          update: data,
        });
        if (change.targetGroupAccountId === null) noReclass += 1;
        else saved += 1;
      }
      const materialized = await materializeConfirmedReclassAdjustments(
        tx,
        policyVersionId,
        sourceGroupAccountIds,
        userId,
      );
      adjustmentsUpdated = materialized.auxiliary.written + materialized.auxiliary.updated + materialized.auxiliary.deleted
        + materialized.automatic.written + materialized.automatic.updated + materialized.automatic.deleted;
    }, { maxWait: 10_000, timeout: 60_000 });
  } catch (error) {
    if (error instanceof ReclassMaterializationConflictError || error instanceof AutomaticReclassConflictError) {
      return serviceError(error.message, 409);
    }
    throw error;
  }

  return serviceOk({ success: true, reclassified: saved, noReclass, adjustmentsUpdated });
}
