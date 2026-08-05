import { createHash } from "node:crypto";

import type { ConsolidationBatchSnapshot } from "@workspace/finance/types";
import type { ConsolidationVoucherMatchGroup } from "../domain/consolidation-entry-generation";
import { buildCutoverCapitalMovementEntries } from "./consolidation-cutover-capital-movement";
import { buildCnyPartialOwnershipEntries } from "./consolidation-cny-investment-entries";
import {
  consolidationCutoverBaseline,
  consolidationCutoverDate,
  nonCapitalNciAllocationLines,
  openingEquityAmounts,
} from "./consolidation-nci-equity-components";
import { allocateEquityAmount, equityMoney as money } from "./consolidation-equity-continuity-ledger";
import type {
  RemittanceFxEntryCandidate,
  RemittanceFxEntryLine,
  RemittanceFxEntryPackage,
  RemittanceFxGenerationIssue,
} from "./consolidation-remittance-fx-types";

export type {
  RemittanceFxEntryCandidate,
  RemittanceFxEntryLine,
  RemittanceFxEntryPackage,
  RemittanceFxGenerationIssue,
} from "./consolidation-remittance-fx-types";

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
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
    const parentShareRatio = investee.shareRatio;
    if (parentShareRatio === null || parentShareRatio === undefined
      || parentShareRatio <= 0 || parentShareRatio > 1) return [];
    const cutoverDate = consolidationCutoverDate(batch, investee.id);
    const baseline = consolidationCutoverBaseline(batch, investee.id);
    if (baseline && baseline.parentCompanyCode !== investor.companyCode) return [];
    const generationKey = `policy:remittance-fx:historical-capital:${investor.companyId}:${investee.companyId}${cutoverDate ? `:opening:${cutoverDate}` : ""}`;
    const opening = openingEquityAmounts(batch, investee);
    const capitalBindings = bindings
      .filter(({ application }) => application.entitySnapshotId === investee.id)
      .filter(({ application }) => !cutoverDate || application.targetDate < cutoverDate)
      .sort((left, right) => left.application.targetDate.localeCompare(right.application.targetDate)
        || left.rate.id - right.rate.id
        || left.applicationIndex - right.applicationIndex);
    const investmentFacts = group.leftFacts.filter((fact) => (
      fact.currencyCode.toUpperCase() === "CNY" && !excludedVoucherItemIds.has(fact.itemId)
      && (!cutoverDate || fact.voucherDate < cutoverDate)
    ));
    const investmentAmount = baseline?.parentLongTermInvestmentAmount
      ?? money(investmentFacts.reduce((sum, fact) => sum + fact.signedAmount, 0));
    if ((!cutoverDate && capitalBindings.length === 0)
      || (!baseline && investmentFacts.length === 0) || investmentAmount <= 0) return [];

    let lineNo = 1;
    const capitalLines: RemittanceFxEntryLine[] = [];
    const capitalEvidence: string[] = [];
    if (cutoverDate) {
      for (const [lineCode, accountCode] of [["paidInCapital", "3001"], ["capitalReserve", "3002"]] as const) {
        const amount = money(opening.get(lineCode) ?? 0);
        if (Math.abs(amount) < 0.005) continue;
        capitalLines.push({
          lineNo: lineNo++,
          entitySnapshotId: investee.id,
          companyId: investee.companyId,
          companyCode: investee.companyCode,
          statementType: "balanceSheet",
          lineCode,
          accountCode,
          debit: amount > 0 ? amount : 0,
          credit: amount < 0 ? Math.abs(amount) : 0,
          currencyCode: "CNY",
          periodBasis: "current",
          note: `${cutoverDate} 首次并表：按切换日前一日折算权益组成全额抵销`,
          matchSide: "right",
          sourceKind: "workpaper",
          sourceId: `${generationKey}:component:opening:eliminate:${lineCode}`,
          sourceFingerprint: fingerprint({ generationKey, lineCode, amount, cutoverDate }),
          sourceAmount: Math.abs(amount),
          sourceCurrency: "CNY",
          counterpartyEntitySnapshotId: investor.id,
          counterpartyCompanyId: investor.companyId,
        });
        capitalEvidence.push(`${lineCode} 期初折算金额 ${amount.toFixed(2)} 元`);
      }
      capitalEvidence.push(...capitalBindings.map(({ rate, application }) => (
        `${application.targetDate} ${application.capitalOriginalAmount} CAD × ${rate.rate}（历史资本证据：${application.evidence}）`
      )));
    } else {
      let paidInCapitalRemaining = reportLineAmount(batch, investee.id, "paidInCapital");
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
        version: "historical-capital-parent-share-elimination-v3",
        rate: [rate.id, rate.exchangeRateId, rate.exchangeRateVersion, rate.rateDate, rate.rate],
        application,
        parentShareRatio,
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
        const fullTranslatedAmount = historicalAmount ?? money(sourceAmount * rate.rate);
        const derivedWeightedRate = money(fullTranslatedAmount / sourceAmount * 1_000_000) / 1_000_000;
        capitalLines.push({
          lineNo: lineNo++,
          entitySnapshotId: investee.id,
          companyId: investee.companyId,
          companyCode: investee.companyCode,
          statementType: "balanceSheet",
          lineCode,
          accountCode,
          debit: fullTranslatedAmount,
          credit: 0,
          currencyCode: "CNY",
          periodBasis: "current",
          note: historicalAmount
            ? `${sourceAmount} CAD → ¥${fullTranslatedAmount.toFixed(2)}（历史折算人民币金额；加权汇率 ${derivedWeightedRate}）`
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
    }
    const translatedCapital = money(capitalLines.reduce((sum, line) => sum + line.debit - line.credit, 0));
    const minorityRatio = 1 - parentShareRatio;
    const minorityCapital = allocateEquityAmount(translatedCapital, parentShareRatio).nci;
    const investmentLines: RemittanceFxEntryLine[] = baseline ? [{
      lineNo: lineNo++,
      entitySnapshotId: investor.id,
      companyId: investor.companyId,
      companyCode: investor.companyCode,
      statementType: "balanceSheet",
      lineCode: "longTermInvest",
      accountCode: "1511",
      debit: 0,
      credit: investmentAmount,
      currencyCode: "CNY",
      periodBasis: "current",
      note: `${baseline.baselineDate} 经财务确认的母公司长期股权投资期末余额`,
      matchSide: "left",
      sourceKind: "workpaper",
      sourceId: `${generationKey}:cutover:parent-investment`,
      sourceFingerprint: fingerprint({ generationKey, baseline }),
      sourceAmount: investmentAmount,
      sourceCurrency: "CNY",
      counterpartyEntitySnapshotId: investee.id,
      counterpartyCompanyId: investee.companyId,
    }] : investmentFacts.map((fact) => {
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
    const difference = money(translatedCapital - investmentAmount - minorityCapital);
    const historicalDifferenceLines: RemittanceFxEntryLine[] = baseline && Math.abs(difference) >= 0.005 ? [{
      lineNo: lineNo++,
      entitySnapshotId: investor.id,
      companyId: investor.companyId,
      companyCode: investor.companyCode,
      statementType: "balanceSheet",
      lineCode: baseline.historicalDifferenceLineCode,
      accountCode: baseline.historicalDifferenceLineCode === "capitalReserve" ? "4002" : "4104",
      debit: difference < 0 ? Math.abs(difference) : 0,
      credit: difference > 0 ? difference : 0,
      currencyCode: "CNY",
      periodBasis: "current",
      note: `${baseline.baselineDate} 切换检查点归母历史关系差额；仅承接一次`,
      matchSide: null,
      sourceKind: "workpaper",
      sourceId: `${generationKey}:cutover:historical-difference`,
      sourceFingerprint: fingerprint({ generationKey, baseline, difference }),
      sourceAmount: Math.abs(difference),
      sourceCurrency: "CNY",
      counterpartyEntitySnapshotId: investee.id,
      counterpartyCompanyId: investee.companyId,
    }] : [];
    const priorCapital = money((opening.get("paidInCapital") ?? 0) + (opening.get("capitalReserve") ?? 0));
    const openingMinorityCapital = money(priorCapital * minorityRatio);
    const contributedMinorityCapital = money(minorityCapital - openingMinorityCapital);
    const minorityLines: RemittanceFxEntryLine[] = [];
    const appendMinorityCapital = (amount: number, movement: "opening" | "contribution") => {
      if (Math.abs(amount) < 0.005) return;
      minorityLines.push({
        lineNo: lineNo++,
        entitySnapshotId: investee.id,
        companyId: investee.companyId,
        companyCode: investee.companyCode,
        statementType: "balanceSheet",
        lineCode: "nonControllingInterests",
        accountCode: "410401",
        debit: amount < 0 ? Math.abs(amount) : 0,
        credit: amount > 0 ? amount : 0,
        currencyCode: "CNY",
        periodBasis: "current",
        note: `资本折算人民币金额 × 少数股东比例 ${(minorityRatio * 100).toFixed(2)}%（${movement === "opening" ? "期初承接" : "本期投入"}）`,
        matchSide: null,
        sourceKind: "workpaper",
        sourceId: `${generationKey}:nci:${movement}:capital`,
        sourceFingerprint: fingerprint({ generationKey, translatedCapital, parentShareRatio, amount, movement }),
        sourceAmount: Math.abs(amount),
        sourceCurrency: "CNY",
        counterpartyEntitySnapshotId: investor.id,
        counterpartyCompanyId: investor.companyId,
      });
    };
    appendMinorityCapital(openingMinorityCapital, "opening");
    appendMinorityCapital(contributedMinorityCapital, "contribution");
    const componentLines = nonCapitalNciAllocationLines({
      batch,
      entity: investee,
      investor,
      minorityRatio,
      generationKey,
      lineNo,
    });
    lineNo += componentLines.length;
    const lines = [...capitalLines, ...investmentLines, ...minorityLines, ...componentLines, ...historicalDifferenceLines]
      .map((line, index) => ({ ...line, lineNo: index + 1 }));
    const balanceDifference = money(lines.reduce((sum, line) => sum + line.debit - line.credit, 0));
    return [{
      documentType: "elimination",
      postingLevel: "20",
      entryType: "investmentEquity",
      title: `${investor.companyName} → ${investee.companyName} 投资与权益抵销`,
      description: cutoverDate
        ? "首次并表期初凭证逐项抵销子公司期初权益、母公司期初长期股权投资，并分别承接归母权益和少数股东权益。"
        : "在同一张完整抵销凭证中抵销子公司资本全额、母公司长期股权投资，并确认少数股东对应资本份额。",
      evidence: `加拿大资本历史汇率：${capitalEvidence.join("；")}；母公司份额 ${(parentShareRatio * 100).toFixed(2)}%；少数股东份额 ${((1 - parentShareRatio) * 100).toFixed(2)}%；投资方凭证分录：${investmentFacts.map((fact) => fact.itemId).join("、")}`,
      matchDifference: Math.abs(balanceDifference),
      differenceResolution: Math.abs(balanceDifference) < 0.005
        ? "投资成本与历史汇率折算权益一致"
        : `待分类差额 ${Math.abs(balanceDifference).toFixed(2)} 元；需根据原始投资、历次增资及购买日依据分类`,
      generationKey,
      ...(cutoverDate ? { postingDate: cutoverDate } : {}),
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
      const foreignEntity = entityById.get(application.entitySnapshotId);
      const investorEntity = entityByCode.get(application.voucher.companyCode);
      const originalAmount = application.voucher.originalAmount;
      if (!foreignEntity || !investorEntity || !originalAmount || originalAmount <= 0) continue;
      const cutoverDate = consolidationCutoverDate(batch, foreignEntity.id);
      if (cutoverDate) {
        if (application.voucher.voucherDate < cutoverDate) seenVoucherItems.add(application.voucherItemId);
        continue;
      }
      seenVoucherItems.add(application.voucherItemId);
      const translatedAmount = money(application.capitalHistoricalAmountCny ?? originalAmount * rate.rate);
      const bookedAmount = money(application.voucher.bookedAmountCny);
      const parentShareRatio = foreignEntity.shareRatio ?? 1;
      const minorityRatio = 1 - parentShareRatio;
      const minorityAmount = money(translatedAmount * minorityRatio);
      const difference = money(translatedAmount - bookedAmount - minorityAmount);
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
      const prior = openingEquityAmounts(batch, foreignEntity);
      const priorCapital = money((prior.get("paidInCapital") ?? 0) + (prior.get("capitalReserve") ?? 0));
      const openingMinorityCapital = money(priorCapital * minorityRatio);
      const contributedMinorityCapital = money(minorityAmount - openingMinorityCapital);
      const minorityMovements = cutoverDate
        ? [{ amount: minorityAmount, movement: "contribution" as const }]
        : [
            { amount: openingMinorityCapital, movement: "opening" as const },
            { amount: contributedMinorityCapital, movement: "contribution" as const },
          ];
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
      }, ...minorityMovements.flatMap(({ amount, movement }, index) => (
        Math.abs(amount) < 0.005 ? [] : [{
        lineNo: 3 + index,
        entitySnapshotId: foreignEntity.id,
        companyId: foreignEntity.companyId,
        companyCode: foreignEntity.companyCode,
        statementType: "balanceSheet" as const,
        lineCode: "nonControllingInterests",
        accountCode: "410401",
        debit: amount < 0 ? Math.abs(amount) : 0,
        credit: amount > 0 ? amount : 0,
        currencyCode: "CNY" as const,
        periodBasis: "current" as const,
        note: `投资折算人民币金额 × 少数股东比例 ${(minorityRatio * 100).toFixed(2)}%（${movement === "opening" ? "期初承接" : "本期投入"}）`,
        matchSide: null,
        sourceKind: "workpaper" as const,
        sourceId: `${generationKey}:nci:${movement}:capital`,
        sourceFingerprint,
        sourceAmount: Math.abs(amount),
        sourceCurrency: "CNY",
        counterpartyEntitySnapshotId: investorEntity.id,
        counterpartyCompanyId: investorEntity.companyId,
      }]))];
      if (!cutoverDate) {
        lines.push(...nonCapitalNciAllocationLines({
          batch,
          entity: foreignEntity,
          investor: investorEntity,
          minorityRatio,
          generationKey,
          lineNo: lines.length + 1,
        }));
      }
      lines.forEach((line, index) => { line.lineNo = index + 1; });
      candidates.push({
        documentType: "elimination",
        postingLevel: "20",
        entryType: "investmentEquity",
        title: `${investorEntity.companyName}汇加拿大投资款抵销`,
        description: "按交易证据抵销加拿大权益、境内长期股权投资并确认少数股东权益；任何剩余差额必须另行提供分类依据。",
        evidence: `${application.voucher.voucherNo}：${originalAmount} CAD × ${rate.rate}（${application.capitalContributionDate ?? application.targetDate}）= ${translatedAmount} CNY；境内长期股权投资 ${bookedAmount} CNY`,
        matchDifference: Math.abs(difference),
        differenceResolution: Math.abs(difference) < 0.005
          ? "投资成本、权益份额与少数股东份额一致"
          : `待分类差额 ${Math.abs(difference).toFixed(2)} 元；不得默认计入其他综合收益`,
        generationKey,
        generationFingerprint: fingerprint({ generationKey, sourceFingerprint, lines }),
        lines,
      });
    }
  }
  return [
    ...candidates,
    ...historicalCapitalEntries(batch, groups, seenVoucherItems),
    ...buildCutoverCapitalMovementEntries(batch, groups),
    ...buildCnyPartialOwnershipEntries(batch, groups, seenVoucherItems),
  ];
}

export function buildRemittanceFxEntryPackage(
  batch: ConsolidationBatchSnapshot,
  groups: readonly ConsolidationVoucherMatchGroup[] = [],
): RemittanceFxEntryPackage {
  const candidates = buildRemittanceFxEntries(batch, groups);
  const entries: RemittanceFxEntryCandidate[] = [];
  const issues: RemittanceFxGenerationIssue[] = [];
  for (const candidate of candidates) {
    if (candidate.matchDifference < 0.005) {
      entries.push(candidate);
      continue;
    }
    issues.push({
      entryType: "investmentEquity",
      generationKey: candidate.generationKey,
      title: candidate.title,
      differenceAmount: candidate.matchDifference,
      conclusion: candidate.differenceResolution,
      evidence: candidate.evidence,
    });
  }
  return { entries, issues };
}
