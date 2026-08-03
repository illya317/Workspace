import type {
  ConsolidationRateApplicationSnapshot,
} from "@workspace/finance/types";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { validateConsolidationFxFacts } from "../domain/consolidation-fx-validation";
import type { ConsolidationRateFact } from "./consolidation-snapshots";
import { ConsolidationSnapshotError } from "./consolidation-snapshots";
import { comparativePeriodEndDate } from "./consolidation-comparative";
import type { CadInvestmentVoucherFact, ConsolidationCurrencyPolicyFact, ConsolidationRateApplicationFact, HistoricalCapitalFact } from "./consolidation-rate-application-types";
export type { ConsolidationCurrencyPolicyFact, ConsolidationRateApplicationFact } from "./consolidation-rate-application-types";

export function buildHistoricalCapitalRateApplications(input: {
  facts: HistoricalCapitalFact[];
  rateIdByTargetDate: ReadonlyMap<string, number>;
  rateIdByHistoricalSource: ReadonlyMap<string, number>;
  comparativePeriodEnd: string;
  comparativeCompanyIds: ReadonlySet<number>;
  companyIdByCode: ReadonlyMap<string, number>;
  snapshotIdByCompany: ReadonlyMap<number, number>;
}) {
  return input.facts.flatMap((fact) => {
    if (!fact.capitalContributionDate && !fact.historicalAmountCny) {
      throw new ConsolidationSnapshotError(
        `${fact.companyCode} ${fact.lineCode === "paidInCapital" ? "实收资本" : "资本公积"} ${fact.originalAmount.toFixed(2)} 缺少实际出资日和历史折算人民币金额`,
        409,
      );
    }
    const exchangeRateId = fact.historicalAmountCny
      ? input.rateIdByHistoricalSource.get(`${fact.basis}:${fact.sourceRecordId}`)
      : input.rateIdByTargetDate.get(fact.capitalContributionDate!);
    const companyId = input.companyIdByCode.get(fact.companyCode);
    const entitySnapshotId = companyId ? input.snapshotIdByCompany.get(companyId) : null;
    if (!exchangeRateId || !companyId || !entitySnapshotId) {
      throw new ConsolidationSnapshotError(
        `${fact.companyCode} 权益资本历史证据未能绑定合并实体或冻结汇率`,
        409,
      );
    }
    const shared = {
      exchangeRateId,
      applicationType: "historicalCapital" as const,
      entitySnapshotId,
      voucherItemId: null,
      targetDate: fact.capitalContributionDate ?? fact.capitalEvidenceDate,
      capitalContributionDate: fact.capitalContributionDate,
      capitalEvidenceKind: fact.capitalEvidenceKind,
      capitalEvidenceDate: fact.capitalEvidenceDate,
      capitalOriginalAmount: fact.originalAmount,
      capitalHistoricalAmountCny: fact.historicalAmountCny,
      capitalLineCode: fact.lineCode,
      evidence: `${fact.historicalAmountCny ? "受控历史人民币金额" : "ERP 资本明细自动识别"}；${fact.evidence}`,
    };
    return [
      { ...shared, periodBasis: "current" as const },
      ...((fact.capitalContributionDate ?? fact.capitalEvidenceDate) <= input.comparativePeriodEnd && input.comparativeCompanyIds.has(companyId)
        ? [{ ...shared, periodBasis: "comparative" as const }]
        : []),
    ];
  });
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isPostedVoucher(voucher: { status: string; sourcePosted: boolean | null }) {
  return voucher.sourcePosted === true || voucher.status === "posted";
}

export function aggregateHistoricalCapitalFacts(input: {
  opening: {
    id?: number;
    companyCode: string;
    targetDate: string;
    accountCode: string;
    accountName: string;
    openingDebit: number;
    openingCredit: number;
    capitalHistoricalAmountCny?: number | null;
    capitalEvidenceKind?: string | null;
    capitalEvidence?: string | null;
  }[];
  movements: {
    id?: number;
    companyCode: string;
    targetDate: string;
    voucherNo: string;
    accountCode: string;
    accountName: string;
    description: string;
    debit: number;
    credit: number;
    capitalHistoricalAmountCny?: number | null;
    capitalEvidenceKind?: string | null;
    capitalEvidence?: string | null;
  }[];
}): HistoricalCapitalFact[] {
  const grouped = new Map<string, {
    sourceRecordId: number;
    companyCode: string;
    targetDate: string;
    capitalEvidenceKind: "openingBalance" | "openingVoucher" | "cumulativeVoucher" | "voucher";
    capitalEvidenceDate: string;
    capitalContributionDate: string | null;
    originalAmount: number;
    historicalAmountCny: number | null;
    evidence: string[];
    basis: "opening" | "movement";
    lineCode: "paidInCapital" | "capitalReserve";
  }>();
  const append = (fact: HistoricalCapitalFact) => {
    if (fact.originalAmount <= 0.004) return;
    const key = `${fact.companyCode}:${fact.targetDate}:${fact.basis}:${fact.lineCode}:${fact.sourceRecordId}`;
    const current = grouped.get(key) ?? {
      sourceRecordId: fact.sourceRecordId,
      companyCode: fact.companyCode,
      targetDate: fact.targetDate,
      capitalEvidenceKind: fact.capitalEvidenceKind,
      capitalEvidenceDate: fact.capitalEvidenceDate,
      capitalContributionDate: fact.capitalContributionDate,
      originalAmount: 0,
      historicalAmountCny: fact.historicalAmountCny,
      evidence: [],
      basis: fact.basis,
      lineCode: fact.lineCode,
    };
    current.originalAmount = money(current.originalAmount + fact.originalAmount);
    current.evidence.push(fact.evidence);
    grouped.set(key, current);
  };
  for (const row of input.opening) {
    append({
      sourceRecordId: row.id ?? 0,
      companyCode: row.companyCode,
      targetDate: row.targetDate,
      capitalEvidenceKind: "openingBalance",
      capitalEvidenceDate: row.targetDate,
      capitalContributionDate: null,
      originalAmount: money(row.openingCredit - row.openingDebit),
      historicalAmountCny: row.capitalHistoricalAmountCny ?? null,
      evidence: `${row.accountCode} ${row.accountName}：最早可用账期期初余额，仅证明余额，不作为出资日期${row.capitalEvidence ? `；${row.capitalEvidence}` : ""}`,
      basis: "opening",
      lineCode: row.accountName.includes("实收资本") || row.accountName.includes("股本")
        ? "paidInCapital"
        : "capitalReserve",
    });
  }
  for (const row of input.movements) {
    const historicalAmountCny = row.capitalHistoricalAmountCny ?? null;
    const historicalEvidenceKind = row.capitalEvidenceKind === "openingVoucher" || row.capitalEvidenceKind === "cumulativeVoucher"
      ? row.capitalEvidenceKind
      : null;
    append({
      sourceRecordId: row.id ?? 0,
      companyCode: row.companyCode,
      targetDate: row.targetDate,
      capitalEvidenceKind: historicalEvidenceKind ?? "voucher",
      capitalEvidenceDate: row.targetDate,
      capitalContributionDate: historicalEvidenceKind || historicalAmountCny ? null : row.targetDate,
      originalAmount: money(row.credit - row.debit),
      historicalAmountCny,
      evidence: `${row.voucherNo} · ${row.accountCode} ${row.accountName}${row.description ? ` · ${row.description}` : ""}${row.capitalEvidence ? `；${row.capitalEvidence}` : ""}`,
      basis: "movement",
      lineCode: row.accountName.includes("实收资本") || row.accountName.includes("股本")
        ? "paidInCapital"
        : "capitalReserve",
    });
  }
  return [...grouped.values()]
    .map((fact) => ({
      ...fact,
      originalAmount: money(fact.originalAmount),
      evidence: fact.evidence.join("；"),
    }))
    .filter((fact) => fact.originalAmount > 0.004)
    .sort((left, right) => left.companyCode.localeCompare(right.companyCode)
      || left.targetDate.localeCompare(right.targetDate));
}

export async function loadHistoricalCapitalFacts(
  companyCodes: string[],
  periodEnd: string,
): Promise<HistoricalCapitalFact[]> {
  if (companyCodes.length === 0) return [];
  const periods = await prisma.financePeriod.findMany({
    where: { companyCode: { in: companyCodes }, startDate: { lte: periodEnd } },
    select: { id: true, companyCode: true, startDate: true, year: true, month: true },
    orderBy: [{ year: "asc" }, { month: "asc" }, { id: "asc" }],
  });
  const firstPeriodByCompany = new Map<string, typeof periods[number]>();
  for (const period of periods) {
    if (!firstPeriodByCompany.has(period.companyCode)) firstPeriodByCompany.set(period.companyCode, period);
  }
  const capitalAccountWhere: Prisma.FinanceAccountWhereInput = {
    OR: [
      { name: { contains: "实收资本" } },
      { name: { contains: "股本" } },
      { name: { contains: "资本公积" } },
    ],
  };
  const [openingRows, movementRows] = await Promise.all([
    prisma.financeAccountBalance.findMany({
      where: {
        periodId: { in: [...firstPeriodByCompany.values()].map((period) => period.id) },
        account: capitalAccountWhere,
      },
      select: {
        id: true,
        companyCode: true,
        openingDebit: true,
        openingCredit: true,
        capitalHistoricalAmountCny: true,
        capitalEvidenceKind: true,
        capitalEvidence: true,
        period: { select: { startDate: true } },
        account: { select: { code: true, name: true } },
      },
      orderBy: [{ companyCode: "asc" }, { account: { code: "asc" } }],
    }),
    prisma.financeVoucherItem.findMany({
      where: {
        voucher: { companyCode: { in: companyCodes }, date: { lte: periodEnd } },
        account: capitalAccountWhere,
      },
      select: {
        id: true,
        debit: true,
        credit: true,
        description: true,
        capitalHistoricalAmountCny: true,
        capitalEvidenceKind: true,
        capitalEvidence: true,
        voucher: {
          select: {
            companyCode: true,
            voucherNo: true,
            date: true,
            description: true,
            status: true,
            sourcePosted: true,
          },
        },
        account: { select: { code: true, name: true } },
      },
      orderBy: [{ voucher: { date: "asc" } }, { id: "asc" }],
    }),
  ]);
  return aggregateHistoricalCapitalFacts({
    opening: openingRows.map((row) => ({
      id: row.id,
      companyCode: row.companyCode,
      targetDate: row.period.startDate,
      accountCode: row.account.code,
      accountName: row.account.name,
      openingDebit: row.openingDebit,
      openingCredit: row.openingCredit,
      capitalHistoricalAmountCny: row.capitalHistoricalAmountCny === null ? null : Number(row.capitalHistoricalAmountCny),
      capitalEvidenceKind: row.capitalEvidenceKind,
      capitalEvidence: row.capitalEvidence,
    })),
    movements: movementRows.filter((row) => isPostedVoucher(row.voucher)).map((row) => ({
      id: row.id,
      companyCode: row.voucher.companyCode,
      targetDate: row.voucher.date,
      voucherNo: row.voucher.voucherNo,
      accountCode: row.account.code,
      accountName: row.account.name,
      description: row.description || row.voucher.description,
      debit: row.debit,
      credit: row.credit,
      capitalHistoricalAmountCny: row.capitalHistoricalAmountCny === null ? null : Number(row.capitalHistoricalAmountCny),
      capitalEvidenceKind: row.capitalEvidenceKind,
      capitalEvidence: row.capitalEvidence,
    })),
  });
}

function originalAmount(row: { originalDebit: Prisma.Decimal | null; originalCredit: Prisma.Decimal | null }) {
  const debit = row.originalDebit === null ? 0 : Number(row.originalDebit);
  const credit = row.originalCredit === null ? 0 : Number(row.originalCredit);
  const amount = Math.max(Math.abs(debit), Math.abs(credit));
  return amount > 0 ? amount : null;
}

export function cadAmountFromDescription(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = value?.replaceAll(",", "").trim();
    if (!normalized) continue;
    const match = /(?:CAD\s*)?([0-9]+(?:\.[0-9]+)?)\s*(?:加元|加币|CAD)/i.exec(normalized)
      ?? /(?:加元|加币|CAD)\s*([0-9]+(?:\.[0-9]+)?)/i.exec(normalized);
    const amount = match ? Number(match[1]) : 0;
    if (Number.isFinite(amount) && amount > 0) return money(amount);
  }
  return null;
}

export function resolveCadInvestmentOriginalAmount(input: {
  investment: { originalDebit: Prisma.Decimal | null; originalCredit: Prisma.Decimal | null; currencyCode: string | null; description: string | null };
  voucherDescription: string;
  voucherItems: Array<{ originalDebit: Prisma.Decimal | null; originalCredit: Prisma.Decimal | null; currencyCode: string | null }>;
}) {
  const direct = input.investment.currencyCode?.toUpperCase() === "CAD"
    ? originalAmount(input.investment)
    : null;
  if (direct) return direct;
  const bankFlow = input.voucherItems.find((item) => item.currencyCode?.toUpperCase() === "CAD" && originalAmount(item));
  return bankFlow ? originalAmount(bankFlow) : cadAmountFromDescription(input.investment.description, input.voucherDescription);
}

interface VoucherMatchingEvidence {
  label: string;
  companyCode: string;
  lineCode: "paidInCapital" | "capitalReserve";
  currencyCode: "CAD";
  originalAmount: number;
  historicalRate: number;
  actualContributionDate: string;
}

function jsonRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function parseVoucherMatchingEvidence(sourceMetadata: unknown): VoucherMatchingEvidence | null {
  const metadata = jsonRecord(sourceMetadata);
  const evidence = jsonRecord(metadata?.evidence);
  const matching = jsonRecord(evidence?.matching);
  if (!matching
    || typeof matching.label !== "string" || !matching.label.trim()
    || typeof matching.companyCode !== "string" || !matching.companyCode.trim()
    || (matching.lineCode !== "paidInCapital" && matching.lineCode !== "capitalReserve")
    || matching.currencyCode !== "CAD"
    || typeof matching.originalAmount !== "number" || !Number.isFinite(matching.originalAmount) || matching.originalAmount <= 0
    || typeof matching.historicalRate !== "number" || !Number.isFinite(matching.historicalRate) || matching.historicalRate <= 0) {
    return null;
  }
  const actualContributionDate = typeof evidence?.actualContributionDate === "string"
    ? evidence.actualContributionDate
    : null;
  if (!actualContributionDate || !/^\d{4}-\d{2}-\d{2}$/.test(actualContributionDate)) return null;
  return {
    label: matching.label.trim(),
    companyCode: matching.companyCode.trim(),
    lineCode: matching.lineCode,
    currencyCode: matching.currencyCode,
    originalAmount: money(matching.originalAmount),
    historicalRate: matching.historicalRate,
    actualContributionDate,
  };
}

export async function loadCadInvestmentVoucherFacts(
  companyCodes: string[],
  periodEnd: string,
): Promise<CadInvestmentVoucherFact[]> {
  if (companyCodes.length === 0) return [];
  const rows = await prisma.financeVoucherItem.findMany({
    where: {
      account: { code: { startsWith: "1511" } },
      voucher: { companyCode: { in: companyCodes }, date: { lte: periodEnd } },
    },
    select: {
      id: true,
      debit: true,
      credit: true,
      description: true,
      currencyCode: true,
      originalDebit: true,
      originalCredit: true,
      sourceMetadata: true,
      account: { select: { code: true } },
      voucher: {
        select: {
          companyCode: true,
          voucherNo: true,
          date: true,
          description: true,
          sourceMetadata: true,
          items: { select: { currencyCode: true, originalDebit: true, originalCredit: true } },
        },
      },
    },
    orderBy: [{ voucher: { date: "asc" } }, { id: "asc" }],
  });
  return rows.flatMap((row) => {
    const matching = parseVoucherMatchingEvidence(row.sourceMetadata)
      ?? parseVoucherMatchingEvidence(row.voucher.sourceMetadata);
    const amount = matching?.originalAmount ?? resolveCadInvestmentOriginalAmount({
      investment: row,
      voucherDescription: row.voucher.description,
      voucherItems: row.voucher.items,
    });
    if (!amount) return [];
    return [{
      id: row.id,
      companyCode: row.voucher.companyCode,
      voucherNo: row.voucher.voucherNo,
      voucherDate: row.voucher.date,
      description: row.description || row.voucher.description,
      accountCode: row.account.code,
      bookedAmountCny: Math.max(Math.abs(row.debit), Math.abs(row.credit)),
      currencyCode: "CAD",
      originalAmount: amount,
      historicalRate: matching?.historicalRate ?? null,
      matchingCompanyCode: matching?.companyCode ?? null,
      matchingLineCode: matching?.lineCode ?? null,
      matchingLabel: matching?.label ?? null,
      capitalContributionDate: matching?.actualContributionDate ?? null,
    }];
  });
}

export function parseConsolidationRateApplications(value: unknown): ConsolidationRateApplicationSnapshot[] {
  return Array.isArray(value) ? value as ConsolidationRateApplicationSnapshot[] : [];
}

export async function applyConsolidationRatePolicies(input: {
  periodEnd: string;
  requiredComparativeEntityIds: number[];
  requiredInvestmentVoucherIds: number[];
  companyCodes: string[];
  entities: { id: number }[];
  currencyPolicies: ConsolidationCurrencyPolicyFact[];
  rateApplications: ConsolidationRateApplicationFact[];
  rateFacts: ConsolidationRateFact[];
}) {
  const comparativePeriodEnd = comparativePeriodEndDate(input.periodEnd);
  if (!comparativePeriodEnd) throw new ConsolidationSnapshotError("合并期间截止日无效", 409);
  const entityIds = new Set(input.entities.map((entity) => entity.id));
  const policyByEntityId = new Map(input.currencyPolicies.map((policy) => [policy.entitySnapshotId, policy]));
  if (policyByEntityId.size !== entityIds.size || [...entityIds].some((id) => !policyByEntityId.has(id))) {
    throw new ConsolidationSnapshotError("本位币政策必须完整覆盖批次内每个实体", 409);
  }
  const rateById = new Map(input.rateFacts.map((rate) => [rate.exchangeRateId, rate]));
  const investments = await loadCadInvestmentVoucherFacts(input.companyCodes, input.periodEnd);
  const investmentById = new Map(investments.map((investment) => [investment.id, investment]));
  const requiredInvestmentVoucherIds = input.requiredInvestmentVoucherIds.filter((id) => investmentById.has(id));
  const applicationsByRateId = new Map<number, ConsolidationRateApplicationSnapshot[]>();
  for (const application of input.rateApplications) {
    const entityPolicy = policyByEntityId.get(application.entitySnapshotId);
    if (!entityPolicy) throw new ConsolidationSnapshotError("汇率应用引用了批次范围外实体", 409);
    const rate = rateById.get(application.exchangeRateId);
    if (!rate) throw new ConsolidationSnapshotError("汇率应用引用了未冻结的汇率证据", 409);
    const voucher = application.voucherItemId ? investmentById.get(application.voucherItemId) : null;
    if (application.applicationType === "historicalInvestment" && !voucher) {
      throw new ConsolidationSnapshotError("投资日汇率必须绑定当前批次范围内的 CAD 长期股权投资凭证", 409);
    }
    if (application.applicationType === "historicalCapital"
      && (!application.capitalOriginalAmount
        || !application.capitalContributionDate && !application.capitalHistoricalAmountCny)) {
      throw new ConsolidationSnapshotError("境外权益资本必须填写正数原币金额，并提供实际出资日或历史折算人民币金额", 409);
    }
    const snapshot: ConsolidationRateApplicationSnapshot = {
      applicationType: application.applicationType,
      periodBasis: application.periodBasis,
      entitySnapshotId: application.entitySnapshotId,
      voucherItemId: voucher?.id ?? null,
      targetDate: application.capitalContributionDate
        ?? voucher?.voucherDate
        ?? application.targetDate
        ?? (application.periodBasis === "current" ? input.periodEnd : comparativePeriodEnd),
      evidence: application.evidence,
      capitalEvidenceKind: application.capitalEvidenceKind ?? null,
      capitalEvidenceDate: application.capitalEvidenceDate ?? null,
      capitalContributionDate: application.capitalContributionDate ?? null,
      capitalOriginalAmount: application.capitalOriginalAmount ?? null,
      capitalHistoricalAmountCny: application.capitalHistoricalAmountCny ?? null,
      capitalLineCode: application.capitalLineCode ?? null,
      voucher: voucher ? {
        companyCode: voucher.companyCode,
        voucherNo: voucher.voucherNo,
        voucherDate: voucher.voucherDate,
        description: voucher.description,
        accountCode: voucher.accountCode,
        bookedAmountCny: voucher.bookedAmountCny,
        currencyCode: voucher.currencyCode,
        originalAmount: voucher.originalAmount,
        matchingLineCode: voucher.matchingLineCode,
        matchingLabel: voucher.matchingLabel,
      } : null,
    };
    const current = applicationsByRateId.get(rate.exchangeRateId) ?? [];
    current.push(snapshot);
    applicationsByRateId.set(rate.exchangeRateId, current);
  }
  const appliedRates = input.rateFacts.map((rate) => ({
    ...rate,
    applications: JSON.parse(JSON.stringify(applicationsByRateId.get(rate.exchangeRateId) ?? [])) as Prisma.InputJsonValue,
  }));
  const validation = validateConsolidationFxFacts({
    periodEnd: input.periodEnd,
    comparativePeriodEnd,
    entities: input.currencyPolicies.map((policy) => ({
      id: policy.entitySnapshotId,
      functionalCurrency: policy.functionalCurrency,
      currencyEvidence: policy.evidence,
    })),
    rates: appliedRates.map((rate) => ({
      exchangeRateId: rate.exchangeRateId,
      rateKind: rate.rateKind,
      rateDate: rate.rateDate,
      recordedBy: rate.recordedBy,
      recordedAt: rate.recordedAt.toISOString(),
      applications: parseConsolidationRateApplications(rate.applications),
    })),
    requiredInvestmentVoucherIds,
    requiredComparativeEntityIds: input.requiredComparativeEntityIds,
  });
  if (!validation.ok) throw new ConsolidationSnapshotError(validation.issue.message, validation.issue.status);
  return { rates: appliedRates, investments };
}
