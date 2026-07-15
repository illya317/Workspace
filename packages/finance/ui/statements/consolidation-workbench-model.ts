import type {
  ConsolidationBatchSnapshot,
  ConsolidationOverview,
  SaveConsolidationSourcesInput,
  StatementReportType,
} from "@workspace/finance/types";

export interface CurrencyPolicyDraft {
  functionalCurrency: "" | "CNY" | "CAD";
  evidence: string;
}

export type CurrencyPolicyDrafts = Record<number, CurrencyPolicyDraft>;
export type InvestmentEntitySelections = Partial<Record<number, number>>;

export interface StatementLineOption {
  value: string;
  label: string;
  reportType: StatementReportType;
  side: "debit" | "credit";
}

type LifecycleAction = "submit" | "review" | "lock" | "publish";

export function nextConsolidationLifecycleAction(
  status: ConsolidationBatchSnapshot["status"],
): LifecycleAction | null {
  if (status === "draft") return "submit";
  if (status === "submitted") return "review";
  if (status === "reviewed") return "lock";
  if (status === "locked") return "publish";
  return null;
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function payloadRows(reportType: StatementReportType, payloadValue: unknown) {
  const envelope = object(payloadValue);
  const payload = object(envelope?.payload) ?? envelope;
  if (!payload) return [];
  if (reportType === "balanceSheet") {
    return [payload.assets, payload.liabilities, payload.equity]
      .flatMap((value) => Array.isArray(value) ? value : []);
  }
  return Array.isArray(payload.lines) ? payload.lines : [];
}

export function statementLineOptions(
  batch: ConsolidationBatchSnapshot | null,
  reportType: StatementReportType,
): StatementLineOption[] {
  const options = new Map<string, StatementLineOption>();
  for (const source of batch?.sources.filter((item) => item.reportType === reportType) ?? []) {
    for (const value of payloadRows(reportType, source.reportPayload)) {
      const row = object(value);
      const lineCode = typeof row?.lineCode === "string" ? row.lineCode.trim() : "";
      const label = typeof row?.label === "string" ? row.label.trim() : "";
      const side = row?.side === "debit" || row?.side === "credit" ? row.side : null;
      const derived = row?.isHeader === true || row?.isTotal === true || row?.isGrandTotal === true || row?.direction === "net";
      if (!lineCode || !label || !side || derived || options.has(lineCode)) continue;
      options.set(lineCode, { value: lineCode, label: `${label} · ${lineCode}`, reportType, side });
    }
  }
  return [...options.values()];
}

function dateDistanceDays(later: string, earlier: string) {
  return (Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86_400_000;
}

export function comparativePeriodEndDate(periodEnd: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(periodEnd);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  return new Date(Date.UTC(year - 1, month, 0)).toISOString().slice(0, 10);
}

function sourceHasNonzeroPreviousAmount(source: ConsolidationBatchSnapshot["sources"][number]) {
  return payloadRows(source.reportType, source.reportPayload).some((value) => {
    const row = object(value);
    const previousAmount = typeof row?.previousAmount === "number" || typeof row?.previousAmount === "string"
      ? Number(row.previousAmount)
      : 0;
    return Number.isFinite(previousAmount) && Math.abs(previousAmount) > 0.005;
  });
}

function closestClosingRate(data: ConsolidationOverview, targetDate: string) {
  return data.fxPolicy.rates
    .filter((rate) => rate.status === "verified" && rate.rateKind === "closing")
    .filter((rate) => {
      const days = dateDistanceDays(targetDate, rate.rateDate);
      return Number.isFinite(days) && days >= 0 && days <= 7;
    })
    .sort((left, right) => right.rateDate.localeCompare(left.rateDate))[0] ?? null;
}

function closestHistoricalRate(data: ConsolidationOverview, targetDate: string) {
  return data.fxPolicy.rates
    .filter((rate) => rate.status === "verified" && rate.rateKind === "historicalInvestment")
    .filter((rate) => {
      const days = dateDistanceDays(targetDate, rate.rateDate);
      return Number.isFinite(days) && days >= 0 && days <= 7;
    })
    .sort((left, right) => right.rateDate.localeCompare(left.rateDate))[0] ?? null;
}

export function buildSourceFreezeInput(
  data: ConsolidationOverview,
  policies: CurrencyPolicyDrafts,
  investmentEntitySelections: InvestmentEntitySelections,
  systemEvidence: string,
): { ok: true; input: Omit<SaveConsolidationSourcesInput, "expectedRevision"> } | { ok: false; error: string } {
  const batch = data.batch;
  if (!batch) return { ok: false, error: "请先创建合并批次" };
  const expectedSources = batch.entities.length * 3;
  if (batch.sources.length !== expectedSources || batch.sources.some((source) => source.sourceKind === "missing")) {
    return { ok: false, error: "批次仍有缺失的个别三表，请先上传并提交来源包" };
  }
  const normalizedEvidence = systemEvidence.trim();
  if (batch.sources.some((source) => source.sourceKind === "system") && !normalizedEvidence) {
    return { ok: false, error: "接受系统账快照时必须填写人工核对依据" };
  }
  const currencyPolicies: NonNullable<SaveConsolidationSourcesInput["currencyPolicies"]> = [];
  for (const entity of batch.entities) {
    const policy = policies[entity.id];
    if (!policy?.functionalCurrency || !policy.evidence.trim()) {
      return { ok: false, error: `请确认 ${entity.companyName} 的本位币并填写依据` };
    }
    currencyPolicies.push({
      entitySnapshotId: entity.id,
      functionalCurrency: policy.functionalCurrency,
      evidence: policy.evidence.trim(),
    });
  }
  const cadEntities = currencyPolicies.filter((policy) => policy.functionalCurrency === "CAD");
  const subsidiaryEntityIds = new Set(batch.entities
    .filter((entity) => entity.role === "subsidiary")
    .map((entity) => entity.id));
  const cadInvesteeEntities = cadEntities.filter((entity) => subsidiaryEntityIds.has(entity.entitySnapshotId));
  const comparativePeriodEnd = data.fxPolicy.comparativePeriodEndDate
    || comparativePeriodEndDate(data.fxPolicy.periodEndDate);
  const comparativeCadEntityIds = new Set(batch.sources
    .filter(sourceHasNonzeroPreviousAmount)
    .map((source) => source.entitySnapshotId)
    .filter((entityId) => cadEntities.some((entity) => entity.entitySnapshotId === entityId)));
  const selectedCadEntityIdByInvestmentId = new Map<number, number>();
  for (const investment of data.fxPolicy.investmentEvidence) {
    const investmentLabel = `${investment.companyCode} · ${investment.voucherNo}`;
    const selectedEntitySnapshotId = investmentEntitySelections[investment.id];
    if (!selectedEntitySnapshotId) {
      return { ok: false, error: `请为投资凭证 ${investmentLabel} 选择被投资 CAD 实体` };
    }
    const cadEntity = cadInvesteeEntities.find((entity) => entity.entitySnapshotId === selectedEntitySnapshotId);
    if (!cadEntity) {
      return { ok: false, error: `投资凭证 ${investmentLabel} 的被投资主体必须是已确认 CAD 本位币的合并实体` };
    }
    selectedCadEntityIdByInvestmentId.set(investment.id, cadEntity.entitySnapshotId);
  }
  const closingRate = closestClosingRate(data, data.fxPolicy.periodEndDate);
  if (cadEntities.length > 0 && !closingRate) {
    return { ok: false, error: "CAD 本位币实体必须先独立复核期末中行折算价" };
  }
  const comparativeClosingRate = closestClosingRate(data, comparativePeriodEnd);
  if (comparativeCadEntityIds.size > 0 && !comparativeClosingRate) {
    return { ok: false, error: `含非零上期数的 CAD 实体必须先独立复核 ${comparativePeriodEnd} 比较期期末中行折算价` };
  }
  const rateApplications: NonNullable<SaveConsolidationSourcesInput["rateApplications"]> = [];
  for (const entity of cadEntities) {
    rateApplications.push({
      exchangeRateId: closingRate!.id,
      applicationType: "closing",
      periodBasis: "current",
      entitySnapshotId: entity.entitySnapshotId,
      evidence: `外币三表按 ${closingRate!.rateDate} 中国银行期末中行折算价`,
    });
    if (comparativeCadEntityIds.has(entity.entitySnapshotId)) {
      rateApplications.push({
        exchangeRateId: comparativeClosingRate!.id,
        applicationType: "closing",
        periodBasis: "comparative",
        entitySnapshotId: entity.entitySnapshotId,
        evidence: `外币三表上期数按 ${comparativeClosingRate!.rateDate} 中国银行比较期期末中行折算价`,
      });
    }
  }
  for (const investment of data.fxPolicy.investmentEvidence) {
    const investmentLabel = `${investment.companyCode} · ${investment.voucherNo}`;
    const historicalRate = closestHistoricalRate(data, investment.voucherDate);
    if (!historicalRate) {
      return { ok: false, error: `投资凭证 ${investmentLabel} 缺少投资日或此前7日内已复核中行汇率` };
    }
    rateApplications.push({
      exchangeRateId: historicalRate.id,
      applicationType: "historicalInvestment",
      periodBasis: "current",
      entitySnapshotId: selectedCadEntityIdByInvestmentId.get(investment.id)!,
      voucherItemId: investment.id,
      evidence: `投资凭证 ${investment.voucherNo} 按 ${historicalRate.rateDate} 中行历史折算价`,
    });
    const entitySnapshotId = selectedCadEntityIdByInvestmentId.get(investment.id)!;
    if (comparativeCadEntityIds.has(entitySnapshotId) && investment.voucherDate <= comparativePeriodEnd) {
      rateApplications.push({
        exchangeRateId: historicalRate.id,
        applicationType: "historicalInvestment",
        periodBasis: "comparative",
        entitySnapshotId,
        voucherItemId: investment.id,
        evidence: `比较期实收资本仅纳入 ${comparativePeriodEnd} 前投资；凭证 ${investment.voucherNo} 按 ${historicalRate.rateDate} 中行历史折算价`,
      });
    }
  }
  const exchangeRateIds = [...new Set(rateApplications.map((application) => application.exchangeRateId))];
  return {
    ok: true,
    input: {
      selections: batch.sources.map((source) => ({
        entitySnapshotId: source.entitySnapshotId,
        reportType: source.reportType,
        workpaperId: source.workpaperId,
        acceptSystemSource: source.sourceKind === "system",
        evidence: source.sourceKind === "system" ? normalizedEvidence : source.evidence,
      })),
      exchangeRateIds,
      currencyPolicies,
      rateApplications,
    },
  };
}
