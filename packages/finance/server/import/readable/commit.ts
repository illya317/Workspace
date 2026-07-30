import { prisma, Prisma } from "@workspace/platform/server/prisma";
import { assertFinanceReadableBatchWriteScope } from "../../domain/readable-import-validation";
import { commitReadableCore } from "./commit-core";
import { commitReadableEvidence } from "./commit-evidence";
import { materializeReadableBalances, replaceSourceBalances } from "./commit-balances";
import {
  replaceAuxiliaryBalances, replaceVoucherAuxiliaryLinks, upsertAuxiliaryMembers,
} from "./commit-dimensions";
import { replaceCashFlowAllocations, replaceOpenItems } from "./commit-cash-open";
import { materializeTPlusCounterpartyClassifications } from "./counterparty-classification";
import { upsertTreasuryFacts } from "./commit-treasury";
import { materializeConfirmedReclassAdjustments } from "../../ledger/reclass-rules/materialize-confirmed";
import { syncFinanceGroupChartInTransaction } from "../../ledger/group-accounts";
import { previewReadableBatch } from "./preview";
import { firstUnreadableText } from "./read-jsonl";
import type { NormalizedReadableBatch } from "./types";

export interface ReadableCommitResult {
  importId: number;
  companyCode: string;
  year: number;
  vouchers: number;
  items: number;
  warnings: string[];
}

export async function commitFinanceArchiveImport(batch: NormalizedReadableBatch): Promise<ReadableCommitResult> {
  assertFinanceReadableBatchWriteScope(batch.spec);
  const unreadableTextPath = firstUnreadableText(batch);
  if (unreadableTextPath) {
    throw new Error(`Refusing readable batch with unresolved encoding damage at ${unreadableTextPath}`);
  }
  const preview = previewReadableBatch(batch);
  if (preview.difference !== 0) throw new Error(`Refusing unbalanced batch ${batch.spec.companyCode}-${batch.spec.year}`);
  const batchKey = `finance-readable:${batch.spec.sourceSystem}:${batch.spec.sourceDatabase}:${batch.spec.year}`;
  const controlJson = {
    accounts: preview.accountCount, vouchers: preview.voucherCount,
    postedVouchers: preview.postedVoucherCount, draftVouchers: preview.draftVoucherCount,
    items: preview.itemCount,
    debit: preview.debit, credit: preview.credit, sourceBalances: preview.sourceBalanceCount,
    auxiliaryBalances: preview.auxiliaryBalanceCount, cashFlowAllocations: preview.cashFlowAllocationCount,
    openItems: preview.openItemCount,
    sourcePackageKey: batch.sourcePackage.packageKey,
    validationStatus: batch.sourcePackage.validationStatus,
    validatedTables: batch.sourcePackage.validatedTableCount,
  } satisfies Prisma.InputJsonObject;
  const sourcePackage = await prisma.financeReadableSourcePackage.upsert({
    where: { packageKey: batch.sourcePackage.packageKey },
    create: { sourceSystem: batch.spec.sourceSystem, ...batch.sourcePackage },
    update: {},
  });
  const [successorSourceSystem, successorSourceLedger] = batch.spec.continuationOf?.split("/") ?? [];
  const sourceLedgerMapping = await prisma.financeSourceLedgerMapping.upsert({
    where: {
      companyCode_sourceSystem_sourceLedger_effectiveFromYear: {
        companyCode: batch.spec.companyCode, sourceSystem: batch.spec.sourceSystem,
        sourceLedger: batch.spec.sourceLedger, effectiveFromYear: batch.spec.mappingStartYear,
      },
    },
    create: {
      companyCode: batch.spec.companyCode, sourceSystem: batch.spec.sourceSystem,
      sourceLedger: batch.spec.sourceLedger, sourceName: batch.ledgerMetadata.sourceName,
      mappingMode: batch.spec.mappingMode, effectiveFromYear: batch.spec.mappingStartYear,
      effectiveToYear: batch.spec.mappingEndYear ?? null, successorSourceSystem: successorSourceSystem ?? null,
      successorSourceLedger: successorSourceLedger ?? null,
      baseCurrencyCode: batch.ledgerMetadata.baseCurrencyCode ?? null,
      baseCurrencyName: batch.ledgerMetadata.baseCurrencyName ?? null,
      accountingStandard: batch.ledgerMetadata.accountingStandard ?? null,
      entityType: batch.ledgerMetadata.entityType ?? null,
      evidence: `${batch.sourcePackage.archiveRevision}/source-map.json；${batch.spec.mappingMode === "historical" ? "一次性历史衔接" : "T6 持续来源"}`,
    },
    update: {
      sourceName: batch.ledgerMetadata.sourceName, effectiveToYear: batch.spec.mappingEndYear ?? null,
      successorSourceSystem: successorSourceSystem ?? null, successorSourceLedger: successorSourceLedger ?? null,
      baseCurrencyCode: batch.ledgerMetadata.baseCurrencyCode ?? null,
      baseCurrencyName: batch.ledgerMetadata.baseCurrencyName ?? null,
      accountingStandard: batch.ledgerMetadata.accountingStandard ?? null,
      entityType: batch.ledgerMetadata.entityType ?? null,
    },
  });
  const importBatch = await prisma.financeLedgerImport.upsert({
    where: { batchKey },
    create: {
      batchKey, type: "readable", companyCode: batch.spec.companyCode, year: batch.spec.year,
      sourceSystem: batch.spec.sourceSystem, sourceLedger: batch.spec.sourceLedger,
      sourceDatabase: batch.spec.sourceDatabase, sourcePath: batch.sourcePackage.sourcePath,
      snapshotDate: batch.snapshotDate, cutoffDate: batch.cutoffDate,
      checksum: batch.sourcePackage.selectedDatabaseChecksum, sourcePackageId: sourcePackage.id,
      sourceLedgerMappingId: sourceLedgerMapping.id, controlJson,
      status: "running", rowCount: preview.itemCount,
    },
    update: {
      sourcePath: batch.sourcePackage.sourcePath, snapshotDate: batch.snapshotDate, cutoffDate: batch.cutoffDate,
      checksum: batch.sourcePackage.selectedDatabaseChecksum, sourcePackageId: sourcePackage.id,
      sourceLedgerMappingId: sourceLedgerMapping.id, controlJson,
      status: "running", rowCount: preview.itemCount, warnings: null,
    },
  });
  const runKey = `${batchKey}:${batch.sourcePackage.packageKey}`;
  const importRun = await prisma.financeReadableImportRun.upsert({
    where: { runKey },
    create: { runKey, ledgerImportId: importBatch.id, sourcePackageId: sourcePackage.id, status: "running", controlJson },
    update: { status: "running", controlJson, errorMessage: null, completedAt: null },
  });
  try {
    await prisma.$transaction(async (tx) => {
      const core = await commitReadableCore(tx, batch, importBatch.id);
      await syncFinanceGroupChartInTransaction(tx, { companyCodes: [batch.spec.companyCode] });
      await commitReadableEvidence(tx, batch, importBatch.id, core);
      const members = await upsertAuxiliaryMembers(tx, batch, importBatch.id);
      await replaceVoucherAuxiliaryLinks(tx, batch, core, members);
      await replaceSourceBalances(tx, batch, importBatch.id, core);
      await replaceAuxiliaryBalances(tx, batch, importBatch.id, core, members);
      await materializeReadableBalances(tx, batch, core);
      await replaceCashFlowAllocations(tx, batch, importBatch.id, core);
      await replaceOpenItems(tx, batch, importBatch.id, members);
      await materializeTPlusCounterpartyClassifications(tx, batch, importBatch.id);
      await upsertTreasuryFacts(tx, batch, importBatch.id, core);
      await tx.financeLedgerImport.update({
        where: { id: importBatch.id },
        data: {
          status: "completed", createdCount: preview.itemCount, updatedCount: preview.itemCount,
          blockedCount: 0, conflictCount: 0, warnings: JSON.stringify([...new Set(batch.warnings)]),
        },
      });
      const confirmedRules = await tx.financeReclassRule.findMany({
        where: { enabled: true, source: "manual", confirmedBy: { not: null }, confirmedAt: { not: null } },
        select: { policyVersionId: true, sourceGroupAccountId: true },
      });
      const rulesByVersion = new Map<number, Set<number>>();
      for (const rule of confirmedRules) {
        const groupAccountIds = rulesByVersion.get(rule.policyVersionId) ?? new Set<number>();
        groupAccountIds.add(rule.sourceGroupAccountId);
        rulesByVersion.set(rule.policyVersionId, groupAccountIds);
      }
      for (const [policyVersionId, sourceGroupAccountIds] of rulesByVersion) {
        await materializeConfirmedReclassAdjustments(tx, policyVersionId, [...sourceGroupAccountIds]);
      }
      await tx.financeReadableImportRun.update({
        where: { id: importRun.id }, data: { status: "completed", completedAt: new Date(), errorMessage: null },
      });
    }, { maxWait: 30_000, timeout: 300_000 });
  } catch (error) {
    await prisma.financeLedgerImport.update({
      where: { id: importBatch.id },
      data: { status: "failed", warnings: JSON.stringify([error instanceof Error ? error.message : String(error)]) },
    });
    await prisma.financeReadableImportRun.update({
      where: { id: importRun.id },
      data: { status: "failed", completedAt: new Date(), errorMessage: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
  return {
    importId: importBatch.id, companyCode: batch.spec.companyCode, year: batch.spec.year,
    vouchers: preview.voucherCount, items: preview.itemCount, warnings: [...new Set(batch.warnings)],
  };
}
