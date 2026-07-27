import type {
  ConsolidationRateApplicationSnapshot,
} from "@workspace/finance/types";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { validateConsolidationFxFacts } from "../domain/consolidation-fx-validation";
import type { ConsolidationRateFact } from "./consolidation-snapshots";
import { ConsolidationSnapshotError } from "./consolidation-snapshots";
import { comparativePeriodEndDate } from "./consolidation-comparative";

export interface CadInvestmentVoucherFact {
  id: number;
  companyCode: string;
  voucherNo: string;
  voucherDate: string;
  description: string;
  accountCode: string;
  bookedAmountCny: number;
  currencyCode: string | null;
  originalAmount: number | null;
}

export interface HistoricalCapitalFact {
  companyCode: string;
  targetDate: string;
  originalAmount: number;
  evidence: string;
}

export interface ConsolidationCurrencyPolicyFact {
  entitySnapshotId: number;
  functionalCurrency: string;
  evidence: string;
}

export interface ConsolidationRateApplicationFact {
  exchangeRateId: number;
  applicationType: "closing" | "historicalInvestment" | "historicalCapital";
  periodBasis: "current" | "comparative";
  entitySnapshotId: number;
  voucherItemId?: number | null;
  capitalContributionDate?: string | null;
  capitalOriginalAmount?: number | null;
  evidence: string;
}

export function buildHistoricalCapitalRateApplications(input: {
  facts: HistoricalCapitalFact[];
  rateIdByTargetDate: ReadonlyMap<string, number>;
  comparativePeriodEnd: string;
  comparativeCompanyIds: ReadonlySet<number>;
  companyIdByCode: ReadonlyMap<string, number>;
  snapshotIdByCompany: ReadonlyMap<number, number>;
}) {
  return input.facts.flatMap((fact) => {
    const exchangeRateId = input.rateIdByTargetDate.get(fact.targetDate);
    const companyId = input.companyIdByCode.get(fact.companyCode);
    const entitySnapshotId = companyId ? input.snapshotIdByCompany.get(companyId) : null;
    if (!exchangeRateId || !companyId || !entitySnapshotId) return [];
    const shared = {
      exchangeRateId,
      applicationType: "historicalCapital" as const,
      entitySnapshotId,
      voucherItemId: null,
      capitalContributionDate: fact.targetDate,
      capitalOriginalAmount: fact.originalAmount,
      evidence: `ERP 资本明细自动识别；${fact.evidence}`,
    };
    return [
      { ...shared, periodBasis: "current" as const },
      ...(fact.targetDate <= input.comparativePeriodEnd && input.comparativeCompanyIds.has(companyId)
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
    companyCode: string;
    targetDate: string;
    accountCode: string;
    accountName: string;
    openingDebit: number;
    openingCredit: number;
  }[];
  movements: {
    companyCode: string;
    targetDate: string;
    voucherNo: string;
    accountCode: string;
    accountName: string;
    description: string;
    debit: number;
    credit: number;
  }[];
}): HistoricalCapitalFact[] {
  const grouped = new Map<string, {
    companyCode: string;
    targetDate: string;
    originalAmount: number;
    evidence: string[];
  }>();
  const append = (fact: HistoricalCapitalFact) => {
    if (fact.originalAmount <= 0.004) return;
    const key = `${fact.companyCode}:${fact.targetDate}`;
    const current = grouped.get(key) ?? {
      companyCode: fact.companyCode,
      targetDate: fact.targetDate,
      originalAmount: 0,
      evidence: [],
    };
    current.originalAmount = money(current.originalAmount + fact.originalAmount);
    current.evidence.push(fact.evidence);
    grouped.set(key, current);
  };
  for (const row of input.opening) {
    append({
      companyCode: row.companyCode,
      targetDate: row.targetDate,
      originalAmount: money(row.openingCredit - row.openingDebit),
      evidence: `${row.accountCode} ${row.accountName}：最早可用账期期初余额，原出资日缺失，以该账期起始日作为可复核历史折算日`,
    });
  }
  for (const row of input.movements) {
    append({
      companyCode: row.companyCode,
      targetDate: row.targetDate,
      originalAmount: money(row.credit - row.debit),
      evidence: `${row.voucherNo} · ${row.accountCode} ${row.accountName}${row.description ? ` · ${row.description}` : ""}`,
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
        companyCode: true,
        openingDebit: true,
        openingCredit: true,
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
        debit: true,
        credit: true,
        description: true,
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
      companyCode: row.companyCode,
      targetDate: row.period.startDate,
      accountCode: row.account.code,
      accountName: row.account.name,
      openingDebit: row.openingDebit,
      openingCredit: row.openingCredit,
    })),
    movements: movementRows.filter((row) => isPostedVoucher(row.voucher)).map((row) => ({
      companyCode: row.voucher.companyCode,
      targetDate: row.voucher.date,
      voucherNo: row.voucher.voucherNo,
      accountCode: row.account.code,
      accountName: row.account.name,
      description: row.description || row.voucher.description,
      debit: row.debit,
      credit: row.credit,
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
      account: { select: { code: true } },
      voucher: {
        select: {
          companyCode: true,
          voucherNo: true,
          date: true,
          description: true,
          items: { select: { currencyCode: true, originalDebit: true, originalCredit: true } },
        },
      },
    },
    orderBy: [{ voucher: { date: "asc" } }, { id: "asc" }],
  });
  return rows.flatMap((row) => {
    const amount = resolveCadInvestmentOriginalAmount({
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
    if (application.applicationType === "historicalCapital" && (!application.capitalContributionDate || !application.capitalOriginalAmount)) {
      throw new ConsolidationSnapshotError("境外权益资本历史汇率必须填写出资日期和原币金额", 409);
    }
    const snapshot: ConsolidationRateApplicationSnapshot = {
      applicationType: application.applicationType,
      periodBasis: application.periodBasis,
      entitySnapshotId: application.entitySnapshotId,
      voucherItemId: voucher?.id ?? null,
      targetDate: voucher?.voucherDate
        ?? application.capitalContributionDate
        ?? (application.periodBasis === "current" ? input.periodEnd : comparativePeriodEnd),
      evidence: application.evidence,
      capitalOriginalAmount: application.capitalOriginalAmount ?? null,
      voucher: voucher ? {
        companyCode: voucher.companyCode,
        voucherNo: voucher.voucherNo,
        voucherDate: voucher.voucherDate,
        description: voucher.description,
        accountCode: voucher.accountCode,
        bookedAmountCny: voucher.bookedAmountCny,
        currencyCode: voucher.currencyCode,
        originalAmount: voucher.originalAmount,
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
