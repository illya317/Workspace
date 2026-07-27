import { createHash } from "node:crypto";

import type { ConsolidationBatchSnapshot } from "@workspace/finance/types";
import type { TenantFinanceConsolidationPolicies } from "@workspace/platform/tenant-config";
import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";

import { historicalEquityRate } from "./consolidation-frozen-rates";
import type { RemittanceFxEntryLine } from "./consolidation-remittance-fx-entries";

type OpeningPolicy = TenantFinanceConsolidationPolicies["openingCapitalReclassifications"][number];

export interface OpeningCapitalCounterparty {
  id: number;
  code: string;
  name: string;
}

export interface OpeningCapitalReclassificationCandidate {
  entryType: "reclassification";
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

export function buildOpeningCapitalReclassificationEntries(
  batch: ConsolidationBatchSnapshot,
  policies: readonly OpeningPolicy[],
  counterparties: ReadonlyMap<string, OpeningCapitalCounterparty>,
): DomainValidationResult<OpeningCapitalReclassificationCandidate[]> {
  const candidates: OpeningCapitalReclassificationCandidate[] = [];
  for (const policy of policies) {
    const foreignEntity = batch.entities.find((entity) => entity.companyCode === policy.foreignCompanyCode);
    if (!foreignEntity) {
      return failCommand(`期初资本重分类策略 ${policy.key} 的境外主体不在合并范围`, 409, "openingCapitalReclassification");
    }
    const counterparty = counterparties.get(policy.payableCounterpartyCompanyCode);
    if (!counterparty) {
      return failCommand(`期初资本重分类策略 ${policy.key} 的其他应付款单位不存在`, 409, "openingCapitalReclassification");
    }
    const rateResult = historicalEquityRate(batch.exchangeRates, foreignEntity.id, "current");
    if (!rateResult.ok) return rateResult;
    if (rateResult.data === null) {
      return failCommand(`期初资本重分类策略 ${policy.key} 缺少冻结历史权益汇率`, 409, "openingCapitalReclassification");
    }
    const amountCny = money(policy.sourceOriginalAmount * rateResult.data);
    const generationKey = `policy:opening-capital-reclassification:${policy.key}`;
    const sourceFingerprint = fingerprint({
      version: "opening-capital-reclassification-v1",
      policy,
      entitySnapshotId: foreignEntity.id,
      counterparty,
      historicalEquityRate: rateResult.data,
      rateFingerprint: batch.rateFingerprint,
    });
    const referenceLabel = `${counterparty.name}（${policy.payableCounterpartyReferenceCode}）`;
    const sharedLine = {
      entitySnapshotId: foreignEntity.id,
      companyId: foreignEntity.companyId,
      companyCode: foreignEntity.companyCode,
      statementType: "balanceSheet" as const,
      currencyCode: "CNY" as const,
      periodBasis: "current" as const,
      matchSide: null,
      sourceKind: "workpaper" as const,
      sourceFingerprint,
      sourceAmount: policy.sourceOriginalAmount,
      sourceCurrency: policy.sourceCurrencyCode,
      counterpartyEntitySnapshotId: null,
      counterpartyCompanyId: counterparty.id,
    };
    const lines: RemittanceFxEntryLine[] = [{
      ...sharedLine,
      lineNo: 1,
      lineCode: "paidInCapital",
      accountCode: "3001",
      debit: amountCny,
      credit: 0,
      note: `转出期初实收资本 ${policy.sourceOriginalAmount} CAD`,
      sourceId: `opening-capital:${policy.key}`,
    }, {
      ...sharedLine,
      lineNo: 2,
      lineCode: "otherPayables",
      accountCode: "2241",
      debit: 0,
      credit: amountCny,
      note: `其他应付款—${referenceLabel}`,
      sourceId: `counterparty:${policy.payableCounterpartyReferenceCode}`,
    }];
    candidates.push({
      entryType: "reclassification",
      title: `加拿大期初实收资本转${referenceLabel}其他应付款`,
      description: `合并工作底稿按确认的期初对应关系，将 ${policy.sourceOriginalAmount} ${policy.sourceCurrencyCode} 实收资本重分类至指定单位其他应付款。`,
      evidence: `${policy.sourceOriginalAmount} ${policy.sourceCurrencyCode} × 底稿冻结历史权益汇率 ${rateResult.data.toFixed(8)} = ${amountCny.toFixed(2)} CNY；其他应付款单位 ${referenceLabel}（公司编码 ${counterparty.code}）`,
      matchDifference: 0,
      differenceResolution: "同额重分类，不产生其他综合收益差额",
      generationKey,
      generationFingerprint: fingerprint({ generationKey, sourceFingerprint, lines }),
      lines,
    });
  }
  return okCommand(candidates);
}
