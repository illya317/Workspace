import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";
import { prisma } from "@workspace/platform/server/prisma";
import {
  buildSaveReclassRuleChangeSetCommand,
  type SaveReclassRuleChangeSetInput,
} from "../../domain/finance-validation";
import {
  materializeOpenAuxiliaryAdjustments,
  ReclassMaterializationConflictError,
} from "./materialize";

export async function saveReclassRuleChangeSet(input: SaveReclassRuleChangeSetInput) {
  const command = buildSaveReclassRuleChangeSetCommand(input);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status);
  const { userId, changes } = command.data.input;
  const direct = await assertBusinessActionDirectExecutionAllowed({
    businessActionKey: "finance.ledger.reclassRule.save",
    actorUserId: userId,
    resourceKey: "finance.ledger",
    scopeType: "global",
    scopeId: null,
    blockedMessage: "重分类规则已配置为必须走流程，请从统一保存入口提交",
  });
  if (!direct.ok) return direct;
  const accountCodes = Array.from(new Set(changes.flatMap((change) => (
    change.targetAccountCode
      ? [change.sourceAccountCode, change.targetAccountCode]
      : [change.sourceAccountCode]
  ))));
  const accounts = await prisma.financeAccount.findMany({
    where: { code: { in: accountCodes }, isActive: true },
    select: { code: true },
  });
  const existingCodes = new Set(accounts.map((account) => account.code));
  const missingCodes = accountCodes.filter((code) => !existingCodes.has(code));
  if (missingCodes.length > 0) {
    return serviceError(`科目不存在或已停用：${missingCodes.join("、")}`, 400);
  }

  const now = new Date();
  let saved = 0;
  let noReclass = 0;
  let adjustmentsUpdated = 0;
  try {
    await prisma.$transaction(async (tx) => {
      for (const change of changes) {
        const key = {
          sourceAccountCode_abnormalSide: {
            sourceAccountCode: change.sourceAccountCode,
            abnormalSide: change.abnormalSide,
          },
        };
        if (change.targetAccountCode === null) {
          await tx.financeReclassRule.upsert({
            where: key,
            create: {
              sourceAccountCode: change.sourceAccountCode,
              abnormalSide: change.abnormalSide,
              decision: "no_reclass",
              targetAccountCode: null,
              enabled: true,
              source: "manual",
              confirmedBy: userId,
              confirmedAt: now,
            },
            update: {
              decision: "no_reclass",
              targetAccountCode: null,
              enabled: true,
              source: "manual",
              confirmedBy: userId,
              confirmedAt: now,
            },
          });
          noReclass += 1;
          continue;
        }
        await tx.financeReclassRule.upsert({
          where: key,
          create: {
            sourceAccountCode: change.sourceAccountCode,
            abnormalSide: change.abnormalSide,
            decision: "reclassify",
            targetAccountCode: change.targetAccountCode,
            enabled: true,
            source: "manual",
            confirmedBy: userId,
            confirmedAt: now,
          },
          update: {
            decision: "reclassify",
            targetAccountCode: change.targetAccountCode,
            enabled: true,
            source: "manual",
            confirmedBy: userId,
            confirmedAt: now,
          },
        });
        saved += 1;
      }
      const materialized = await materializeOpenAuxiliaryAdjustments(
        tx,
        changes.map((change) => change.sourceAccountCode),
      );
      adjustmentsUpdated = materialized.written + materialized.updated + materialized.deleted;
    }, { maxWait: 10_000, timeout: 60_000 });
  } catch (error) {
    if (error instanceof ReclassMaterializationConflictError) {
      return serviceError(error.message, 409);
    }
    throw error;
  }

  return serviceOk({ success: true, reclassified: saved, noReclass, adjustmentsUpdated });
}
