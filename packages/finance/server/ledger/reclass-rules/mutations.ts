import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";
import { prisma } from "@workspace/platform/server/prisma";
import { syncReclassRuleResults } from "./sync";
import {
  buildSaveReclassRuleChangeSetCommand,
  type SaveReclassRuleChangeSetInput,
} from "../../domain/finance-validation";

export async function saveReclassRuleChangeSet(input: SaveReclassRuleChangeSetInput) {
  const command = buildSaveReclassRuleChangeSetCommand(input);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status);
  const { companyCode, year, userId, changes } = command.data.input;
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
    where: { companyCode, year, code: { in: accountCodes }, isActive: true },
    select: { code: true },
  });
  const existingCodes = new Set(accounts.map((account) => account.code));
  const missingCodes = accountCodes.filter((code) => !existingCodes.has(code));
  if (missingCodes.length > 0) {
    return serviceError(`科目不存在或已停用：${missingCodes.join("、")}`, 400);
  }

  const now = new Date();
  let saved = 0;
  let cleared = 0;
  await prisma.$transaction(async (tx) => {
    for (const change of changes) {
      const key = {
        companyCode_year_sourceAccountCode_abnormalSide: {
          companyCode,
          year,
          sourceAccountCode: change.sourceAccountCode,
          abnormalSide: change.abnormalSide,
        },
      };
      if (change.targetAccountCode === null) {
        const existing = await tx.financeReclassRule.findUnique({ where: key, select: { id: true } });
        if (!existing) continue;
        await tx.reclassResult.deleteMany({
          where: { ruleId: existing.id, status: { in: ["approved", "pending"] } },
        });
        await tx.financeReclassRule.delete({ where: { id: existing.id } });
        cleared += 1;
        continue;
      }
      await tx.financeReclassRule.upsert({
        where: key,
        create: {
          companyCode,
          year,
          sourceAccountCode: change.sourceAccountCode,
          abnormalSide: change.abnormalSide,
          targetAccountCode: change.targetAccountCode,
          enabled: true,
          source: "manual",
          confirmedBy: userId,
          confirmedAt: now,
        },
        update: {
          targetAccountCode: change.targetAccountCode,
          enabled: true,
          source: "manual",
          confirmedBy: userId,
          confirmedAt: now,
        },
      });
      saved += 1;
    }
  });

  const sync = await syncReclassRuleResults(companyCode, year);
  return serviceOk({ success: true, saved, cleared, sync });
}
