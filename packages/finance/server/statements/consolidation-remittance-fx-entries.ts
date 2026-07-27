import { createHash } from "node:crypto";

import type { ConsolidationBatchSnapshot } from "@workspace/finance/types";

export interface RemittanceFxEntryLine {
  lineNo: number;
  entitySnapshotId: number;
  companyId: number;
  companyCode: string;
  statementType: "balanceSheet";
  lineCode: string;
  accountCode: string;
  debit: number;
  credit: number;
  currencyCode: "CNY";
  periodBasis: "current";
  note: string;
  matchSide: "left" | "right" | null;
  sourceKind: "voucher" | "workpaper";
  sourceId: string;
  sourceFingerprint: string;
  sourceAmount: number;
  sourceCurrency: string;
  counterpartyEntitySnapshotId: number | null;
  counterpartyCompanyId: number;
  sourceVoucherItemId?: number;
}

export interface RemittanceFxEntryCandidate {
  entryNo: string;
  entryType: "investmentEquity";
  title: string;
  description: string;
  evidence: string;
  matchDifference: number;
  differenceResolution: string;
  generationKey: string;
  generationFingerprint: string;
  lines: RemittanceFxEntryLine[];
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function buildRemittanceFxEntries(
  batch: ConsolidationBatchSnapshot,
): RemittanceFxEntryCandidate[] {
  const entityById = new Map(batch.entities.map((entity) => [entity.id, entity]));
  const entityByCode = new Map(batch.entities.map((entity) => [entity.companyCode, entity]));
  const seenVoucherItems = new Set<number>();
  const candidates: RemittanceFxEntryCandidate[] = [];
  for (const rate of batch.exchangeRates) {
    for (const application of rate.applications) {
      if (application.applicationType !== "historicalInvestment"
        || application.periodBasis !== "current"
        || !application.voucherItemId
        || !application.voucher
        || seenVoucherItems.has(application.voucherItemId)) continue;
      seenVoucherItems.add(application.voucherItemId);
      const foreignEntity = entityById.get(application.entitySnapshotId);
      const investorEntity = entityByCode.get(application.voucher.companyCode);
      const originalAmount = application.voucher.originalAmount;
      if (!foreignEntity || !investorEntity || !originalAmount || originalAmount <= 0) continue;
      const translatedAmount = money(originalAmount * rate.rate);
      const bookedAmount = money(application.voucher.bookedAmountCny);
      const difference = money(translatedAmount - bookedAmount);
      const generationKey = `policy:remittance-fx:${application.voucherItemId}`;
      const sourceFingerprint = fingerprint({
        version: "remittance-central-parity-v1",
        rate: {
          id: rate.id,
          exchangeRateId: rate.exchangeRateId,
          version: rate.exchangeRateVersion,
          date: rate.rateDate,
          value: rate.rate,
          sourceUrl: rate.sourceUrl,
        },
        application,
      });
      const lines: RemittanceFxEntryLine[] = [{
        lineNo: 1,
        entitySnapshotId: foreignEntity.id,
        companyId: foreignEntity.companyId,
        companyCode: foreignEntity.companyCode,
        statementType: "balanceSheet",
        lineCode: "capitalReserve",
        accountCode: "3002",
        debit: translatedAmount,
        credit: 0,
        currencyCode: "CNY",
        periodBasis: "current",
        note: `${originalAmount} CAD × ${rate.rate}（${application.targetDate} 中间价）`,
        matchSide: "right",
        sourceKind: "workpaper",
        sourceId: `rate-application:${rate.id}:${application.voucherItemId}`,
        sourceFingerprint,
        sourceAmount: originalAmount,
        sourceCurrency: "CAD",
        counterpartyEntitySnapshotId: investorEntity.id,
        counterpartyCompanyId: investorEntity.companyId,
      }, {
        lineNo: 2,
        entitySnapshotId: investorEntity.id,
        companyId: investorEntity.companyId,
        companyCode: investorEntity.companyCode,
        statementType: "balanceSheet",
        lineCode: "longTermInvest",
        accountCode: application.voucher.accountCode,
        debit: 0,
        credit: bookedAmount,
        currencyCode: "CNY",
        periodBasis: "current",
        note: `${application.voucher.voucherDate} ${application.voucher.voucherNo} · ${application.voucher.description}`,
        matchSide: "left",
        sourceKind: "voucher",
        sourceId: `voucher:${application.voucherItemId}`,
        sourceFingerprint,
        sourceAmount: bookedAmount,
        sourceCurrency: "CNY",
        counterpartyEntitySnapshotId: foreignEntity.id,
        counterpartyCompanyId: foreignEntity.companyId,
        sourceVoucherItemId: application.voucherItemId,
      }, ...(Math.abs(difference) < 0.005 ? [] : [{
        lineNo: 3,
        entitySnapshotId: foreignEntity.id,
        companyId: foreignEntity.companyId,
        companyCode: foreignEntity.companyCode,
        statementType: "balanceSheet" as const,
        lineCode: "otherComprehensiveIncome",
        accountCode: "4003/4005",
        debit: difference < 0 ? Math.abs(difference) : 0,
        credit: difference > 0 ? difference : 0,
        currencyCode: "CNY" as const,
        periodBasis: "current" as const,
        note: difference < 0 ? "汇款折算差额（损失）" : "汇款折算差额（收益）",
        matchSide: null,
        sourceKind: "workpaper" as const,
        sourceId: `rate-application:${rate.id}:${application.voucherItemId}:oci`,
        sourceFingerprint,
        sourceAmount: Math.abs(difference),
        sourceCurrency: "CNY",
        counterpartyEntitySnapshotId: investorEntity.id,
        counterpartyCompanyId: investorEntity.companyId,
      }])];
      candidates.push({
        entryNo: `AUTO-FX-${fingerprint(generationKey).slice(0, 10).toUpperCase()}`,
        entryType: "investmentEquity",
        title: `${investorEntity.companyName}汇加拿大投资款抵销`,
        description: "按发出 CAD 流水乘汇出日人民币汇率中间价抵销投资与权益，差额计入其他综合收益。",
        evidence: `${application.voucher.voucherNo}：${originalAmount} CAD × ${rate.rate} = ${translatedAmount} CNY；境内长期股权投资 ${bookedAmount} CNY；汇率来源 ${rate.sourceUrl}`,
        matchDifference: Math.abs(difference),
        differenceResolution: difference < 0
          ? `其他综合收益损失 ${Math.abs(difference).toFixed(2)} 元（借方）`
          : `其他综合收益收益 ${difference.toFixed(2)} 元（贷方）`,
        generationKey,
        generationFingerprint: fingerprint({ generationKey, sourceFingerprint, lines }),
        lines,
      });
    }
  }
  return candidates;
}
