import type { Prisma } from "@workspace/platform/server/prisma";
import { assertFinanceReadableBatchWriteScope } from "../../domain/readable-import-validation";

import type { CoreCommitContext } from "./commit-core";
import type { NormalizedReadableBatch } from "./types";

export async function commitReadableEvidence(
  tx: Prisma.TransactionClient,
  batch: NormalizedReadableBatch,
  importId: number,
  core: CoreCommitContext,
) {
  assertFinanceReadableBatchWriteScope(batch.spec);
  const accountIds = [...core.accounts.values()];
  if (accountIds.length) {
    await tx.financeAccountAuxiliaryRequirement.deleteMany({ where: { accountId: { in: accountIds } } });
  }
  const requirements = batch.accounts.flatMap((account) => {
    const accountId = core.accounts.get(account.sourceKey);
    if (!accountId) return [];
    return account.auxiliaryRequirements.map((requirement) => ({
      accountId, importId, dimensionType: requirement.dimensionType, sourceField: requirement.sourceField,
      sourceSystem: batch.spec.sourceSystem, sourceDatabase: batch.spec.sourceDatabase,
    }));
  });
  if (requirements.length) await tx.financeAccountAuxiliaryRequirement.createMany({ data: requirements });

  await tx.financeSourcePeriodStatus.deleteMany({ where: { importId } });
  const periodStatuses = batch.periodStatuses.flatMap((status) => {
    const periodId = core.periods.get(status.month);
    return periodId ? [{
      importId, periodId, sourceKey: status.sourceKey,
      glMonthEnd: status.glMonthEnd, accountingClosed: status.accountingClosed,
      moduleStatuses: status.moduleStatuses,
      derivationVersion: batch.spec.sourceSystem === "T6" ? "t6-bAccClosed-v1" : "source-close-unknown-v1",
    }] : [];
  });
  if (periodStatuses.length) await tx.financeSourcePeriodStatus.createMany({ data: periodStatuses });

  await tx.financeSourceSubsystemStatus.deleteMany({ where: { importId } });
  if (batch.subsystemStatuses.length) {
    await tx.financeSourceSubsystemStatus.createMany({
      data: batch.subsystemStatuses.map((status) => ({ importId, ...status })),
    });
  }

  if (batch.accountLineage.length) {
    const previousKeys = batch.accountLineage.map((item) => item.previousAccountSourceKey);
    const previousAccounts = await tx.financeAccount.findMany({
      where: {
        sourceSystem: batch.spec.sourceSystem, sourceDatabase: batch.spec.sourceDatabase,
        sourceKey: { in: previousKeys }, year: { lt: batch.spec.year },
      },
      select: { id: true, sourceKey: true, year: true },
      orderBy: { year: "desc" },
    });
    const previousByKey = new Map<string, number>();
    for (const account of previousAccounts) {
      if (account.sourceKey && !previousByKey.has(account.sourceKey)) previousByKey.set(account.sourceKey, account.id);
    }
    for (const lineage of batch.accountLineage) {
      const currentAccountId = core.accounts.get(lineage.currentAccountSourceKey);
      const previousAccountId = previousByKey.get(lineage.previousAccountSourceKey);
      if (!currentAccountId || !previousAccountId) {
        batch.warnings.push(`历史科目衔接未映射：${lineage.previousAccountSourceKey} → ${lineage.currentAccountSourceKey}`);
        continue;
      }
      await tx.financeAccountLineage.upsert({
        where: {
          sourceSystem_sourceDatabase_sourceKey: {
            sourceSystem: batch.spec.sourceSystem, sourceDatabase: batch.spec.sourceDatabase, sourceKey: lineage.sourceKey,
          },
        },
        create: {
          importId, currentAccountId, previousAccountId, sourceSystem: batch.spec.sourceSystem,
          sourceDatabase: batch.spec.sourceDatabase, sourceKey: lineage.sourceKey,
          currentYear: lineage.currentYear, previousYear: lineage.previousYear,
        },
        update: { importId, currentAccountId, previousAccountId, currentYear: lineage.currentYear, previousYear: lineage.previousYear },
      });
    }
  }
}
