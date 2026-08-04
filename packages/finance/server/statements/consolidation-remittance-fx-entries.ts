import { createHash } from "node:crypto";

import type { ConsolidationBatchSnapshot } from "@workspace/finance/types";
import type { ConsolidationVoucherMatchGroup } from "../domain/consolidation-entry-generation";

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
  documentType: "elimination";
  postingLevel: "20";
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

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function reportLineAmount(
  batch: ConsolidationBatchSnapshot,
  entitySnapshotId: number,
  lineCode: string,
) {
  const source = (batch.sources ?? []).find((item) => (
    item.entitySnapshotId === entitySnapshotId && item.reportType === "balanceSheet"
  ));
  const envelope = record(source?.reportPayload);
  const payload = record(envelope?.payload ?? envelope);
  const equity = Array.isArray(payload?.equity) ? payload.equity : [];
  const line = equity.map(record).find((item) => item?.lineCode === lineCode);
  const amount = Number(line?.amount);
  return Number.isFinite(amount) && amount > 0 ? money(amount) : 0;
}

function historicalCapitalEntries(
  batch: ConsolidationBatchSnapshot,
  groups: readonly ConsolidationVoucherMatchGroup[],
  excludedVoucherItemIds: ReadonlySet<number>,
): RemittanceFxEntryCandidate[] {
  const entityByCompanyId = new Map(batch.entities.map((entity) => [entity.companyId, entity]));
  const bindings = batch.exchangeRates.flatMap((rate) => rate.applications
    .filter((application) => (
      application.applicationType === "historicalCapital"
      && application.periodBasis === "current"
      && application.capitalOriginalAmount
      && application.capitalOriginalAmount > 0
    ))
    .map((application, applicationIndex) => ({ rate, application, applicationIndex })));

  return groups.flatMap((group): RemittanceFxEntryCandidate[] => {
    if (group.category !== "investmentEquity" || !group.rightCompanyId) return [];
    const investor = entityByCompanyId.get(group.leftCompanyId);
    const investee = entityByCompanyId.get(group.rightCompanyId);
    if (!investor || !investee || investee.functionalCurrency?.toUpperCase() !== "CAD") return [];
    const capitalBindings = bindings
      .filter(({ application }) => application.entitySnapshotId === investee.id)
      .sort((left, right) => left.application.targetDate.localeCompare(right.application.targetDate)
        || left.rate.id - right.rate.id
        || left.applicationIndex - right.applicationIndex);
    const investmentFacts = group.leftFacts.filter((fact) => (
      fact.currencyCode.toUpperCase() === "CNY" && !excludedVoucherItemIds.has(fact.itemId)
    ));
    const investmentAmount = money(investmentFacts.reduce((sum, fact) => sum + fact.signedAmount, 0));
    if (capitalBindings.length === 0 || investmentFacts.length === 0 || investmentAmount <= 0) return [];

    let paidInCapitalRemaining = reportLineAmount(batch, investee.id, "paidInCapital");
    let lineNo = 1;
    const capitalLines: RemittanceFxEntryLine[] = [];
    const capitalEvidence: string[] = [];
    for (const { rate, application, applicationIndex } of capitalBindings) {
      const originalAmount = money(application.capitalOriginalAmount!);
      const paidInOriginal = application.capitalLineCode === "paidInCapital"
        ? originalAmount
        : application.capitalLineCode === "capitalReserve"
          ? 0
          : money(Math.min(paidInCapitalRemaining, originalAmount));
      const capitalReserveOriginal = application.capitalLineCode === "paidInCapital"
        ? 0
        : money(originalAmount - paidInOriginal);
      paidInCapitalRemaining = money(paidInCapitalRemaining - paidInOriginal);
      const sourceFingerprint = fingerprint({
        version: "historical-capital-investment-elimination-v2",
        rate: [rate.id, rate.exchangeRateId, rate.exchangeRateVersion, rate.rateDate, rate.rate],
        application,
      });
      const appendCapitalLine = (
        lineCode: "paidInCapital" | "capitalReserve",
        accountCode: "3001" | "3002",
        sourceAmount: number,
      ) => {
        if (sourceAmount <= 0) return;
        const historicalAmount = application.capitalHistoricalAmountCny
          ? money(application.capitalHistoricalAmountCny * sourceAmount / originalAmount)
          : null;
        const translatedAmount = historicalAmount ?? money(sourceAmount * rate.rate);
        const derivedWeightedRate = money(translatedAmount / sourceAmount * 1_000_000) / 1_000_000;
        capitalLines.push({
          lineNo: lineNo++,
          entitySnapshotId: investee.id,
          companyId: investee.companyId,
          companyCode: investee.companyCode,
          statementType: "balanceSheet",
          lineCode,
          accountCode,
          debit: translatedAmount,
          credit: 0,
          currencyCode: "CNY",
          periodBasis: "current",
          note: historicalAmount
            ? `${sourceAmount} CAD → ¥${translatedAmount.toFixed(2)}（历史折算人民币金额；加权汇率 ${derivedWeightedRate}）`
            : `${sourceAmount} CAD × ${rate.rate}（${application.targetDate} 中间价）`,
          matchSide: "right",
          sourceKind: "workpaper",
          sourceId: `rate-application:${rate.id}:historical-capital:${investee.id}:${applicationIndex}:${lineCode}`,
          sourceFingerprint,
          sourceAmount,
          sourceCurrency: "CAD",
          counterpartyEntitySnapshotId: investor.id,
          counterpartyCompanyId: investor.companyId,
        });
      };
      appendCapitalLine("paidInCapital", "3001", paidInOriginal);
      appendCapitalLine("capitalReserve", "3002", capitalReserveOriginal);
      capitalEvidence.push(application.capitalHistoricalAmountCny
        ? `${originalAmount} CAD → ¥${application.capitalHistoricalAmountCny.toFixed(2)}（${application.capitalEvidenceKind ?? "历史证据"}；加权汇率 ${rate.rate}；${application.evidence}）`
        : `${application.targetDate} ${originalAmount} CAD × ${rate.rate}`);
    }
    const translatedCapital = money(capitalLines.reduce((sum, line) => sum + line.debit, 0));
    const investmentLines: RemittanceFxEntryLine[] = investmentFacts.map((fact) => {
      const amount = money(Math.abs(fact.signedAmount));
      return {
        lineNo: lineNo++,
        entitySnapshotId: investor.id,
        companyId: investor.companyId,
        companyCode: investor.companyCode,
        statementType: "balanceSheet",
        lineCode: "longTermInvest",
        accountCode: fact.accountCode,
        debit: fact.signedAmount < 0 ? amount : 0,
        credit: fact.signedAmount > 0 ? amount : 0,
        currencyCode: "CNY",
        periodBasis: "current",
        note: `${fact.voucherDate} ${fact.voucherNo} · ${fact.accountCode} ${fact.accountName}`,
        matchSide: "left",
        sourceKind: "voucher",
        sourceId: `voucher:${fact.itemId}`,
        sourceFingerprint: fact.sourceFingerprint,
        sourceAmount: amount,
        sourceCurrency: "CNY",
        counterpartyEntitySnapshotId: investee.id,
        counterpartyCompanyId: investee.companyId,
        sourceVoucherItemId: fact.itemId,
      };
    });
    const difference = money(translatedCapital - investmentAmount);
    const generationKey = `policy:remittance-fx:historical-capital:${investor.companyId}:${investee.companyId}`;
    const ociLines: RemittanceFxEntryLine[] = Math.abs(difference) < 0.005 ? [] : [{
      lineNo: lineNo++,
      entitySnapshotId: investee.id,
      companyId: investee.companyId,
      companyCode: investee.companyCode,
      statementType: "balanceSheet",
      lineCode: "otherComprehensiveIncome",
      accountCode: "4003/4005",
      debit: difference < 0 ? Math.abs(difference) : 0,
      credit: difference > 0 ? difference : 0,
      currencyCode: "CNY",
      periodBasis: "current",
      note: difference < 0 ? "投资与权益历史折算差额（损失）" : "投资与权益历史折算差额（收益）",
      matchSide: null,
      sourceKind: "workpaper",
      sourceId: `${generationKey}:oci`,
      sourceFingerprint: fingerprint({ generationKey, difference, capitalEvidence }),
      sourceAmount: Math.abs(difference),
      sourceCurrency: "CNY",
      counterpartyEntitySnapshotId: investor.id,
      counterpartyCompanyId: investor.companyId,
    }];
    const lines = [...capitalLines, ...investmentLines, ...ociLines];
    return [{
      documentType: "elimination",
      postingLevel: "20",
      entryType: "investmentEquity",
      title: `${investor.companyName} → ${investee.companyName} 投资与权益抵销`,
      description: "实收资本和资本公积优先按结构化交易证据和真实发生日汇率折算；仅缺少逐笔交易事实的历史期初余额使用受控历史人民币金额，持股比例不阻断本凭证生成。",
      evidence: `加拿大资本历史汇率：${capitalEvidence.join("；")}；投资方凭证分录：${investmentFacts.map((fact) => fact.itemId).join("、")}`,
      matchDifference: Math.abs(difference),
      differenceResolution: Math.abs(difference) < 0.005
        ? "投资成本与历史汇率折算权益一致"
        : difference < 0
          ? `其他综合收益损失 ${Math.abs(difference).toFixed(2)} 元（借方）`
          : `其他综合收益收益 ${difference.toFixed(2)} 元（贷方）`,
      generationKey,
      generationFingerprint: fingerprint({ generationKey, group: group.generationKey, lines }),
      lines,
    }];
  });
}

export function buildRemittanceFxEntries(
  batch: ConsolidationBatchSnapshot,
  groups: readonly ConsolidationVoucherMatchGroup[] = [],
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
      const translatedAmount = money(application.capitalHistoricalAmountCny ?? originalAmount * rate.rate);
      const bookedAmount = money(application.voucher.bookedAmountCny);
      const difference = money(translatedAmount - bookedAmount);
      const generationKey = `policy:remittance-fx:${application.voucherItemId}`;
      const sourceFingerprint = fingerprint({
        version: "remittance-central-parity-v2",
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
      const foreignEquityLineCode = application.voucher.matchingLineCode ?? "capitalReserve";
      const foreignEquityAccountCode = foreignEquityLineCode === "paidInCapital" ? "3001" : "3002";
      const lines: RemittanceFxEntryLine[] = [{
        lineNo: 1,
        entitySnapshotId: foreignEntity.id,
        companyId: foreignEntity.companyId,
        companyCode: foreignEntity.companyCode,
        statementType: "balanceSheet",
        lineCode: foreignEquityLineCode,
        accountCode: foreignEquityAccountCode,
        debit: translatedAmount,
        credit: 0,
        currencyCode: "CNY",
        periodBasis: "current",
        note: `${originalAmount} CAD × ${rate.rate}（${rate.rateDate} 中间价）= ¥${translatedAmount.toFixed(2)}`,
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
        documentType: "elimination",
        postingLevel: "20",
        entryType: "investmentEquity",
        title: `${investorEntity.companyName}汇加拿大投资款抵销`,
        description: "加拿大权益按投资凭证结构化CAD金额和交易日中间价折算；境内长期股权投资按人民币账面金额抵销，差额自动计入其他综合收益。",
        evidence: `${application.voucher.voucherNo}：${originalAmount} CAD × ${rate.rate}（${application.capitalContributionDate ?? application.targetDate}）= ${translatedAmount} CNY；境内长期股权投资 ${bookedAmount} CNY`,
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
  return [
    ...candidates,
    ...historicalCapitalEntries(batch, groups, seenVoucherItems),
  ];
}
