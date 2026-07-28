import { loadConsolidationBatchRow } from "./consolidation-dto";

export function cloneConsolidationEntryData(
  entry: NonNullable<Awaited<ReturnType<typeof loadConsolidationBatchRow>>>["entries"][number],
  userId: number,
  snapshotIdByCompany: Map<number, number>,
  oldEntityCompanyById: Map<number, number>,
  sourceSnapshotIdByCompanyAndReportType: Map<string, number>,
) {
  return {
    entryNo: entry.entryNo,
    postingDate: entry.postingDate,
    documentType: entry.documentType,
    postingLevel: entry.postingLevel,
    entryType: entry.entryType,
    title: entry.title,
    description: entry.description,
    evidence: entry.evidence,
    status: "draft",
    version: entry.version + 1,
    supersedesEntryId: entry.id,
    predecessorEntryId: entry.id,
    preparedBy: userId,
    lines: {
      create: entry.lines.map((line) => ({
        lineNo: line.lineNo,
        entitySnapshotId: snapshotIdByCompany.get(line.companyId)!,
        companyId: line.companyId,
        companyCode: line.companyCode,
        statementType: line.statementType,
        lineCode: line.lineCode,
        accountCode: line.accountCode,
        groupAccountId: line.groupAccountId,
        debit: line.debit,
        credit: line.credit,
        currencyCode: line.currencyCode,
        periodBasis: line.periodBasis,
        note: line.note,
        matchSide: line.matchSide,
        sourceKind: line.sourceKind,
        sourceId: line.sourceId,
        sourceFingerprint: line.sourceFingerprint,
        sourceAmount: line.sourceAmount,
        sourceCurrency: line.sourceCurrency,
        counterpartyEntitySnapshotId: line.counterpartyCompanyId
          ? snapshotIdByCompany.get(line.counterpartyCompanyId) ?? null
          : null,
        counterpartyCompanyId: line.counterpartyCompanyId,
        sourceSnapshotId: line.sourceSnapshotId
          ? sourceSnapshotIdByCompanyAndReportType.get(`${line.companyId}:${line.statementType}`) ?? null
          : null,
        sourceAuxiliaryBalanceId: line.sourceAuxiliaryBalanceId,
        sourceOpenItemId: line.sourceOpenItemId,
        sourceCashFlowAllocationId: line.sourceCashFlowAllocationId,
        sourceVoucherItemId: line.sourceVoucherItemId,
      })),
    },
    taxEffects: {
      create: entry.taxEffects.map((tax) => ({
        entitySnapshotId: tax.entitySnapshotId
          ? snapshotIdByCompany.get(oldEntityCompanyById.get(tax.entitySnapshotId)!) ?? null
          : null,
        effectKey: tax.effectKey,
        taxEffectType: tax.taxEffectType,
        differenceAmount: tax.differenceAmount,
        taxRate: tax.taxRate,
        recognition: tax.recognition,
        periodBasis: tax.periodBasis,
        jurisdiction: tax.jurisdiction,
        recognitionLocation: tax.recognitionLocation,
        balanceSheetLineCode: tax.balanceSheetLineCode,
        counterpartLineCode: tax.counterpartLineCode,
        reversalPeriod: tax.reversalPeriod,
        recoverabilityConclusion: tax.recoverabilityConclusion,
        evidence: tax.evidence,
        preparedBy: userId,
      })),
    },
  };
}
