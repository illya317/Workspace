import type {
  ConsolidationRateApplicationSnapshot,
  SaveConsolidationSourcesInput,
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

function originalAmount(row: { originalDebit: Prisma.Decimal | null; originalCredit: Prisma.Decimal | null }) {
  const debit = row.originalDebit === null ? 0 : Number(row.originalDebit);
  const credit = row.originalCredit === null ? 0 : Number(row.originalCredit);
  const amount = Math.max(Math.abs(debit), Math.abs(credit));
  return amount > 0 ? amount : null;
}

export async function loadCadInvestmentVoucherFacts(
  companyCodes: string[],
  periodEnd: string,
): Promise<CadInvestmentVoucherFact[]> {
  if (companyCodes.length === 0) return [];
  const rows = await prisma.financeVoucherItem.findMany({
    where: {
      currencyCode: "CAD",
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
      voucher: { select: { companyCode: true, voucherNo: true, date: true, description: true } },
    },
    orderBy: [{ voucher: { date: "asc" } }, { id: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    companyCode: row.voucher.companyCode,
    voucherNo: row.voucher.voucherNo,
    voucherDate: row.voucher.date,
    description: row.description || row.voucher.description,
    accountCode: row.account.code,
    bookedAmountCny: Math.max(Math.abs(row.debit), Math.abs(row.credit)),
    currencyCode: row.currencyCode,
    originalAmount: originalAmount(row),
  }));
}

export function parseConsolidationRateApplications(value: unknown): ConsolidationRateApplicationSnapshot[] {
  return Array.isArray(value) ? value as ConsolidationRateApplicationSnapshot[] : [];
}

export async function applyConsolidationRatePolicies(input: {
  periodEnd: string;
  requiredComparativeEntityIds: number[];
  companyCodes: string[];
  entities: { id: number }[];
  currencyPolicies: SaveConsolidationSourcesInput["currencyPolicies"];
  rateApplications: SaveConsolidationSourcesInput["rateApplications"];
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
    const snapshot: ConsolidationRateApplicationSnapshot = {
      applicationType: application.applicationType,
      periodBasis: application.periodBasis,
      entitySnapshotId: application.entitySnapshotId,
      voucherItemId: voucher?.id ?? null,
      targetDate: voucher?.voucherDate ?? (application.periodBasis === "current" ? input.periodEnd : comparativePeriodEnd),
      evidence: application.evidence,
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
      verifiedBy: rate.verifiedBy,
      verifiedAt: rate.verifiedAt?.toISOString() ?? null,
      applications: parseConsolidationRateApplications(rate.applications),
    })),
    requiredInvestmentVoucherIds: investments.map((investment) => investment.id),
    requiredComparativeEntityIds: input.requiredComparativeEntityIds,
  });
  if (!validation.ok) throw new ConsolidationSnapshotError(validation.issue.message, validation.issue.status);
  return { rates: appliedRates, investments };
}
