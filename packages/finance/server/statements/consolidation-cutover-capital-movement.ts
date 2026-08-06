import { createHash } from "node:crypto";

import type { ConsolidationBatchSnapshot } from "@workspace/finance/types";
import type { ConsolidationVoucherMatchGroup } from "../domain/consolidation-entry-generation";
import {
  consolidationCutoverBaseline,
  consolidationCutoverDate,
  openingEquityAmounts,
} from "./consolidation-nci-equity-components";
import { equityMoney as money } from "./consolidation-equity-continuity-ledger";
import type { RemittanceFxEntryCandidate, RemittanceFxEntryLine } from "./consolidation-remittance-fx-types";

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

const CAPITAL_COMPONENTS = [
  ["paidInCapital", "3001"],
  ["capitalReserve", "3002"],
] as const;

function periodEnd(batch: ConsolidationBatchSnapshot) {
  return new Date(Date.UTC(batch.year, batch.month, 0)).toISOString().slice(0, 10);
}

function capitalMovementFacts(
  batch: ConsolidationBatchSnapshot,
  entitySnapshotId: number,
  cutoverDate: string,
  end: string,
) {
  return batch.exchangeRates.flatMap((rate) => rate.applications.flatMap((application) => {
    if ((application.applicationType !== "historicalInvestment"
        && application.applicationType !== "historicalCapital")
      || application.periodBasis !== "current"
      || application.entitySnapshotId !== entitySnapshotId) return [];
    const contributionDate = application.capitalContributionDate ?? application.targetDate;
    if (!contributionDate || contributionDate < cutoverDate || contributionDate > end) return [];
    const lineCode = application.voucher?.matchingLineCode ?? application.capitalLineCode;
    if (lineCode !== "paidInCapital" && lineCode !== "capitalReserve") return [];
    const originalAmount = application.voucher?.originalAmount ?? application.capitalOriginalAmount;
    if (!originalAmount || originalAmount <= 0) return [];
    const amount = application.capitalHistoricalAmountCny
      ? money(application.capitalHistoricalAmountCny)
      : money(originalAmount * Number(rate.rate));
    return [{
      lineCode,
      amount,
      contributionDate,
      rate: Number(rate.rate),
      originalAmount,
      voucherItemId: application.voucherItemId ?? null,
      evidence: application.evidence,
    }];
  }));
}

export function buildCutoverCapitalMovementEntries(
  batch: ConsolidationBatchSnapshot,
  groups: readonly ConsolidationVoucherMatchGroup[],
): RemittanceFxEntryCandidate[] {
  const entityByCompanyId = new Map(batch.entities.map((entity) => [entity.companyId, entity]));
  return groups.flatMap((group): RemittanceFxEntryCandidate[] => {
    if (group.category !== "investmentEquity" || !group.rightCompanyId) return [];
    const investor = entityByCompanyId.get(group.leftCompanyId);
    const investee = entityByCompanyId.get(group.rightCompanyId);
    if (!investor || !investee) return [];
    const shareRatio = investee.shareRatio;
    if (shareRatio === null || shareRatio === undefined || shareRatio <= 0 || shareRatio >= 1) return [];
    const cutoverDate = consolidationCutoverDate(batch, investee.id);
    if (!cutoverDate) return [];
    const baseline = consolidationCutoverBaseline(batch, investee.id);
    if (!baseline) return [];
    const opening = openingEquityAmounts(batch, investee);
    const end = periodEnd(batch);
    const investmentFacts = group.leftFacts.filter((fact) => (
      fact.currencyCode.toUpperCase() === "CNY"
      && fact.voucherDate >= cutoverDate
      && fact.voucherDate <= end
    )).sort((left, right) => left.voucherDate.localeCompare(right.voucherDate)
      || left.voucherId - right.voucherId
      || left.itemId - right.itemId);
    const movementFacts = capitalMovementFacts(batch, investee.id, cutoverDate, end);
    const componentMovements = CAPITAL_COMPONENTS.map(([lineCode, accountCode]) => ({
      lineCode,
      accountCode,
      openingAmount: money(opening.get(lineCode) ?? 0),
      movement: money(movementFacts
        .filter((fact) => fact.lineCode === lineCode)
        .reduce((sum, fact) => sum + fact.amount, 0)),
    })).map((component) => ({
      ...component,
      closingAmount: money(component.openingAmount + component.movement),
    }));
    const capitalMovement = money(componentMovements.reduce((sum, component) => sum + component.movement, 0));
    const investmentMovement = money(investmentFacts.reduce((sum, fact) => sum + fact.signedAmount, 0));
    if (Math.abs(capitalMovement) < 0.005 && Math.abs(investmentMovement) < 0.005) return [];

    const minorityRatio = 1 - shareRatio;
    const minorityMovement = money(capitalMovement * minorityRatio);
    const evidencedVoucherItemIds = new Set(movementFacts.flatMap((fact) => fact.voucherItemId ? [fact.voucherItemId] : []));
    const fullyEvidenced = investmentFacts.length > 0
      && investmentFacts.every((fact) => evidencedVoucherItemIds.has(fact.itemId));
    const parentMovement = money(capitalMovement - investmentMovement - minorityMovement);
    const generationKey = `policy:remittance-fx:capital-movement:${investor.companyId}:${investee.companyId}:${end.slice(0, 7)}`;
    let lineNo = 1;
    const componentLines: RemittanceFxEntryLine[] = componentMovements.flatMap((component) => {
      if (Math.abs(component.movement) < 0.005) return [];
      return [{
        lineNo: lineNo++,
        entitySnapshotId: investee.id,
        companyId: investee.companyId,
        companyCode: investee.companyCode,
        statementType: "balanceSheet" as const,
        lineCode: component.lineCode,
        accountCode: component.accountCode,
        debit: component.movement > 0 ? component.movement : 0,
        credit: component.movement < 0 ? Math.abs(component.movement) : 0,
        currencyCode: "CNY" as const,
        periodBasis: "current" as const,
        note: `${cutoverDate} 至 ${end}：${component.openingAmount.toFixed(2)} → ${component.closingAmount.toFixed(2)}`,
        matchSide: "right" as const,
        sourceKind: "workpaper" as const,
        sourceId: `${generationKey}:component:contribution:${component.lineCode}`,
        sourceFingerprint: fingerprint({ generationKey, component }),
        sourceAmount: Math.abs(component.movement),
        sourceCurrency: "CNY",
        counterpartyEntitySnapshotId: investor.id,
        counterpartyCompanyId: investor.companyId,
      }];
    });
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
    const minorityLine: RemittanceFxEntryLine[] = Math.abs(minorityMovement) < 0.005 ? [] : [{
      lineNo: lineNo++,
      entitySnapshotId: investee.id,
      companyId: investee.companyId,
      companyCode: investee.companyCode,
      statementType: "balanceSheet",
      lineCode: "nonControllingInterests",
      accountCode: "410401",
      debit: minorityMovement < 0 ? Math.abs(minorityMovement) : 0,
      credit: minorityMovement > 0 ? minorityMovement : 0,
      currencyCode: "CNY",
      periodBasis: "current",
      note: `资本项目累计变动 × 少数股东比例 ${(minorityRatio * 100).toFixed(2)}%`,
      matchSide: null,
      sourceKind: "workpaper",
      sourceId: `${generationKey}:nci:contribution:capital`,
      sourceFingerprint: fingerprint({ generationKey, capitalMovement, minorityRatio }),
      sourceAmount: Math.abs(minorityMovement),
      sourceCurrency: "CNY",
      counterpartyEntitySnapshotId: investor.id,
      counterpartyCompanyId: investor.companyId,
    }];
    const parentMovementLine: RemittanceFxEntryLine[] = !fullyEvidenced || Math.abs(parentMovement) < 0.005 ? [] : [{
      lineNo: lineNo++,
      entitySnapshotId: investor.id,
      companyId: investor.companyId,
      companyCode: investor.companyCode,
      statementType: "balanceSheet",
      lineCode: baseline.historicalDifferenceLineCode,
      accountCode: baseline.historicalDifferenceLineCode === "capitalReserve" ? "4002" : "4104",
      debit: parentMovement < 0 ? Math.abs(parentMovement) : 0,
      credit: parentMovement > 0 ? parentMovement : 0,
      currencyCode: "CNY",
      periodBasis: "current",
      note: `本期资本变动归母关系差额；按切换政策计入${baseline.historicalDifferenceLineCode === "capitalReserve" ? "资本公积" : "未分配利润"}`,
      matchSide: null,
      sourceKind: "workpaper",
      sourceId: `${generationKey}:parent:capital-difference`,
      sourceFingerprint: fingerprint({ generationKey, parentMovement, baseline: baseline.historicalDifferenceLineCode }),
      sourceAmount: Math.abs(parentMovement),
      sourceCurrency: "CNY",
      counterpartyEntitySnapshotId: investee.id,
      counterpartyCompanyId: investee.companyId,
    }];
    const lines = [...componentLines, ...investmentLines, ...minorityLine, ...parentMovementLine]
      .map((line, index) => ({ ...line, lineNo: index + 1 }));
    const balanceDifference = money(lines.reduce((sum, line) => sum + line.debit - line.credit, 0));
    return [{
      documentType: "elimination",
      postingLevel: "20",
      entryType: "investmentEquity",
      title: `${investor.companyName} → ${investee.companyName} 本期资本变动抵销`,
      description: "按切换日期初至本期末的权益组成变动全额抵销资本项目，逐笔抵销投资方长期股权投资，并确认少数股东对应资本份额。",
      evidence: `资本项目变动 ${capitalMovement.toFixed(2)} 元；母公司长期股权投资变动 ${investmentMovement.toFixed(2)} 元；少数股东份额 ${minorityMovement.toFixed(2)} 元；归母资本关系变动 ${parentMovement.toFixed(2)} 元；来源凭证分录 ${investmentFacts.map((fact) => fact.itemId).join("、") || "无"}；逐笔折算 ${movementFacts.map((fact) => `${fact.contributionDate} ${fact.originalAmount} CAD × ${fact.rate} = ${fact.amount.toFixed(2)} CNY`).join("；") || "无"}`,
      matchDifference: Math.abs(balanceDifference),
      differenceResolution: Math.abs(balanceDifference) < 0.005
        ? "资本项目、长期股权投资、归母资本关系变动与少数股东份额一致"
        : `待分类差额 ${Math.abs(balanceDifference).toFixed(2)} 元；需根据本期增资和购买日后权益变动依据分类`,
      generationKey,
      postingDate: end,
      generationFingerprint: fingerprint({ generationKey, group: group.generationKey, lines }),
      lines,
    }];
  });
}
