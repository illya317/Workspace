import { createHash } from "node:crypto";

import type { ConsolidationBatchSnapshot } from "@workspace/finance/types";
import type { ConsolidationVoucherMatchGroup } from "../domain/consolidation-entry-generation";

import { nonCapitalNciAllocationLines, openingEquityAmounts } from "./consolidation-nci-equity-components";
import { equityMoney as money } from "./consolidation-equity-continuity-ledger";
import type { RemittanceFxEntryCandidate, RemittanceFxEntryLine } from "./consolidation-remittance-fx-types";

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function buildCnyPartialOwnershipEntries(
  batch: ConsolidationBatchSnapshot,
  groups: readonly ConsolidationVoucherMatchGroup[],
  excludedVoucherItemIds: ReadonlySet<number>,
): RemittanceFxEntryCandidate[] {
  const entityByCompanyId = new Map(batch.entities.map((entity) => [entity.companyId, entity]));
  return groups.flatMap((group): RemittanceFxEntryCandidate[] => {
    if (group.category !== "investmentEquity" || !group.rightCompanyId) return [];
    const investor = entityByCompanyId.get(group.leftCompanyId);
    const investee = entityByCompanyId.get(group.rightCompanyId);
    const parentRatio = group.ownershipShareRatio ?? investee?.shareRatio;
    if (!investor || !investee || investee.functionalCurrency?.toUpperCase() !== "CNY"
      || parentRatio === null || parentRatio === undefined || parentRatio <= 0 || parentRatio >= 1) return [];
    const investmentFacts = group.leftFacts.filter((fact) => (
      fact.currencyCode.toUpperCase() === "CNY" && !excludedVoucherItemIds.has(fact.itemId)
    ));
    const equityFacts = group.rightFacts.filter((fact) => (
      fact.currencyCode.toUpperCase() === "CNY" && !excludedVoucherItemIds.has(fact.itemId) && fact.lineCode
    ));
    if (investmentFacts.length === 0 || equityFacts.length === 0) return [];
    const generationKey = `policy:investment-equity:cny:${investor.companyId}:${investee.companyId}`;
    const sourceFingerprint = fingerprint({ version: "cny-partial-ownership-v1", group, parentRatio });
    const sourceLine = (
      fact: typeof investmentFacts[number],
      entity: ConsolidationBatchSnapshot["entities"][number],
      counterparty: ConsolidationBatchSnapshot["entities"][number],
      matchSide: "left" | "right",
      lineNo: number,
    ): RemittanceFxEntryLine => {
      const amount = money(Math.abs(fact.signedAmount));
      return {
        lineNo,
        entitySnapshotId: entity.id,
        companyId: entity.companyId,
        companyCode: entity.companyCode,
        statementType: "balanceSheet",
        lineCode: fact.lineCode!,
        accountCode: fact.accountCode,
        debit: fact.signedAmount < 0 ? amount : 0,
        credit: fact.signedAmount > 0 ? amount : 0,
        currencyCode: "CNY",
        periodBasis: "current",
        note: `${fact.voucherDate} ${fact.voucherNo} · ${fact.accountCode} ${fact.accountName}`,
        matchSide,
        sourceKind: "voucher",
        sourceId: `voucher:${fact.itemId}`,
        sourceFingerprint: fact.sourceFingerprint,
        sourceAmount: amount,
        sourceCurrency: "CNY",
        counterpartyEntitySnapshotId: counterparty.id,
        counterpartyCompanyId: counterparty.companyId,
        sourceVoucherItemId: fact.itemId,
      };
    };
    const capitalLines = equityFacts.map((fact, index) => sourceLine(fact, investee, investor, "right", index + 1));
    const investmentLines = investmentFacts.map((fact, index) => (
      sourceLine(fact, investor, investee, "left", capitalLines.length + index + 1)
    ));
    const capitalAmount = money(capitalLines.reduce((sum, line) => sum + line.debit - line.credit, 0));
    const investmentAmount = money(investmentLines.reduce((sum, line) => sum + line.credit - line.debit, 0));
    const minorityRatio = 1 - parentRatio;
    const minorityCapital = money(capitalAmount * minorityRatio);
    const prior = openingEquityAmounts(batch, investee);
    const priorCapital = money((prior.get("paidInCapital") ?? 0) + (prior.get("capitalReserve") ?? 0));
    const capitalMovements = [
      { movement: "opening" as const, amount: money(priorCapital * minorityRatio) },
      { movement: "contribution" as const, amount: money((capitalAmount - priorCapital) * minorityRatio) },
    ].filter((item) => Math.abs(item.amount) >= 0.005);
    const minorityLines: RemittanceFxEntryLine[] = capitalMovements.map((item, index) => ({
      lineNo: capitalLines.length + investmentLines.length + index + 1,
      entitySnapshotId: investee.id,
      companyId: investee.companyId,
      companyCode: investee.companyCode,
      statementType: "balanceSheet",
      lineCode: "nonControllingInterests",
      accountCode: "410401",
      debit: item.amount < 0 ? Math.abs(item.amount) : 0,
      credit: item.amount > 0 ? item.amount : 0,
      currencyCode: "CNY",
      periodBasis: "current",
      note: `资本人民币金额 × 少数股东比例 ${(minorityRatio * 100).toFixed(2)}%（${item.movement === "opening" ? "期初承接" : "投入/初始确认"}）`,
      matchSide: null,
      sourceKind: "workpaper",
      sourceId: `${generationKey}:nci:${item.movement}:capital`,
      sourceFingerprint,
      sourceAmount: Math.abs(item.amount),
      sourceCurrency: "CNY",
      counterpartyEntitySnapshotId: investor.id,
      counterpartyCompanyId: investor.companyId,
    }));
    const difference = money(capitalAmount - investmentAmount - minorityCapital);
    const componentLines = nonCapitalNciAllocationLines({
      batch, entity: investee, investor, minorityRatio, generationKey,
      lineNo: capitalLines.length + investmentLines.length + minorityLines.length + 1,
    });
    const lines = [...capitalLines, ...investmentLines, ...minorityLines, ...componentLines]
      .map((line, index) => ({ ...line, lineNo: index + 1 }));
    return [{
      documentType: "elimination",
      postingLevel: "20",
      entryType: "investmentEquity",
      title: `${investor.companyName} → ${investee.companyName} 投资与权益抵销`,
      description: "同一张完整凭证抵销子公司资本全额和母公司长期股权投资，并按权益项目确认少数股东份额。",
      evidence: `${group.matchingRule}；母公司份额 ${(parentRatio * 100).toFixed(2)}%；少数股东份额 ${(minorityRatio * 100).toFixed(2)}%`,
      matchDifference: Math.abs(difference),
      differenceResolution: Math.abs(difference) < 0.005
        ? "投资成本、归母份额和少数股东份额一致"
        : `待分类差额 ${Math.abs(difference).toFixed(2)} 元；不得默认计入其他综合收益`,
      generationKey,
      generationFingerprint: fingerprint({ generationKey, sourceFingerprint, lines }),
      lines,
    }];
  });
}
