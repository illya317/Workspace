import { matchText } from "@workspace/core/search";
import {
  statementPeriodStartMonth,
  type StatementPeriodKind,
} from "@workspace/finance/types/statement-period";
import { prisma } from "@workspace/platform/server/prisma";
import type {
  FinanceCounterpartyBalanceCategory,
  FinanceCounterpartyObjectKind,
  FinanceCounterpartyObjectType,
  FinanceCounterpartyBalanceResponse,
  FinanceCounterpartyBalanceRow,
  FinanceCounterpartyRelationScope,
} from "../../types/ledger";
import {
  accountPrefixForCounterpartyCategory,
  aggregatePeriodCounterpartyBalances,
  matchesCounterpartyRelationScope,
  rollForwardHistoricalCounterpartyBalances,
  totalCounterpartyBalances,
  type CounterpartyBalanceFact,
  type CounterpartyMemberFact,
  type CounterpartyVoucherFact,
} from "./counterparty-balance-calculation";
import {
  loadCounterpartyIdentityFacts,
  type CounterpartyIdentityFact,
  type CounterpartyIdentityMember,
} from "./counterparty-identity";

export interface ListCounterpartyBalancesInput {
  companyCode: string;
  year: number;
  month: number;
  periodKind?: StatementPeriodKind;
  category: FinanceCounterpartyBalanceCategory;
  page: number;
  pageSize: number;
  keyword?: string;
  relationScope?: FinanceCounterpartyRelationScope;
  objectType?: FinanceCounterpartyObjectType;
}

const accountSelect = { id: true, code: true, name: true } as const;
const memberSelect = {
  id: true,
  dimensionType: true,
  sourceCode: true,
  sourceName: true,
  shortName: true,
  linkedCompanyId: true,
  linkedEmployeeId: true,
  linkedPartyId: true,
} as const;

interface SelectedCounterpartyMember extends CounterpartyIdentityMember {
  dimensionType: string;
  sourceCode: string;
  sourceName: string;
  shortName: string | null;
}

export async function listCounterpartyBalances(
  input: ListCounterpartyBalancesInput,
): Promise<FinanceCounterpartyBalanceResponse> {
  const periodKind = input.periodKind ?? "month";
  const startMonth = statementPeriodStartMonth(input.month, periodKind);
  const period = await prisma.financePeriod.findUnique({
    where: {
      companyCode_year_month: {
        companyCode: input.companyCode,
        year: input.year,
        month: input.month,
      },
    },
    select: { id: true },
  });
  if (!period) return emptyResponse(input);

  const prefix = accountPrefixForCounterpartyCategory(input.category);
  const [monthlyBalances, historicalOpeningBalances, historicalVoucherItems] = await Promise.all([
    prisma.financeAuxiliaryBalance.findMany({
      where: {
        companyCode: input.companyCode,
        period: { year: input.year, month: { gte: startMonth, lte: input.month } },
        sourceSystem: { not: "TPLUS" },
        account: { code: { startsWith: prefix } },
      },
      select: {
        id: true,
        openingDebit: true,
        openingCredit: true,
        currentDebit: true,
        currentCredit: true,
        period: { select: { month: true } },
        account: { select: accountSelect },
        members: { select: { member: { select: memberSelect } } },
      },
    }),
    prisma.financeAuxiliaryBalance.findMany({
      where: {
        companyCode: input.companyCode,
        sourceSystem: "TPLUS",
        period: { year: input.year, month: 1 },
        account: { code: { startsWith: prefix } },
      },
      select: {
        id: true,
        openingDebit: true,
        openingCredit: true,
        currentDebit: true,
        currentCredit: true,
        account: { select: accountSelect },
        members: { select: { member: { select: memberSelect } } },
      },
    }),
    prisma.financeVoucherItem.findMany({
      where: {
        account: {
          companyCode: input.companyCode,
          year: input.year,
          sourceSystem: "TPLUS",
          code: { startsWith: prefix },
        },
        voucher: {
          companyCode: input.companyCode,
          status: "posted",
          period: { year: input.year, month: { lte: input.month } },
          OR: [{ sourceInvalid: false }, { sourceInvalid: null }],
        },
      },
      select: {
        id: true,
        debit: true,
        credit: true,
        account: { select: accountSelect },
        voucher: { select: { period: { select: { month: true } } } },
        auxiliaryLinks: { select: { member: { select: memberSelect } } },
      },
    }),
  ]);

  const historicalPairs = [
    ...historicalOpeningBalances.map((row) => ({ accountId: row.account.id, members: row.members })),
    ...historicalVoucherItems.map((row) => ({ accountId: row.account.id, members: row.auxiliaryLinks })),
  ];
  const allMemberLinks = [
    ...monthlyBalances.flatMap((row) => row.members),
    ...historicalOpeningBalances.flatMap((row) => row.members),
    ...historicalVoucherItems.flatMap((row) => row.auxiliaryLinks),
  ];
  const identityByMemberId = await loadCounterpartyIdentityFacts(
    uniqueIdentityMembers(allMemberLinks),
    periodEndDate(input.year, input.month),
  );
  const canonicalTypeByPair = await loadHistoricalCanonicalTypes(historicalPairs);
  const monthlyRows = aggregatePeriodCounterpartyBalances(monthlyBalances.map((row) => ({
    sourceId: String(row.id),
    month: row.period.month,
    accountId: row.account.id,
    accountCode: row.account.code,
    accountName: row.account.name,
    members: toMemberFacts(row.account.id, row.members, new Map(), identityByMemberId),
    openingDebit: Number(row.openingDebit),
    openingCredit: Number(row.openingCredit),
    currentDebit: Number(row.currentDebit),
    currentCredit: Number(row.currentCredit),
  })), input.category, startMonth, input.month);
  const historicalRows = rollForwardHistoricalCounterpartyBalances(
    historicalOpeningBalances.map((row): CounterpartyBalanceFact => ({
      sourceId: String(row.id),
      accountId: row.account.id,
      accountCode: row.account.code,
      accountName: row.account.name,
      members: toMemberFacts(row.account.id, row.members, canonicalTypeByPair, identityByMemberId),
      openingDebit: Number(row.openingDebit),
      openingCredit: Number(row.openingCredit),
      currentDebit: 0,
      currentCredit: 0,
    })),
    historicalVoucherItems.map((row): CounterpartyVoucherFact => ({
      sourceId: String(row.id),
      month: row.voucher.period.month,
      accountId: row.account.id,
      accountCode: row.account.code,
      accountName: row.account.name,
      members: toMemberFacts(row.account.id, row.auxiliaryLinks, canonicalTypeByPair, identityByMemberId),
      debit: Number(row.debit),
      credit: Number(row.credit),
    })),
    input.category,
    startMonth,
    input.month,
  );
  const keyword = input.keyword?.trim() ?? "";
  const relationScope = input.relationScope ?? "all";
  const objectType = input.objectType ?? "all";
  const filtered = [...monthlyRows, ...historicalRows]
    .filter((row) => matchesCounterpartyRelationScope(row, relationScope))
    .filter((row) => objectType === "all" || row.counterpartyObjectKind === objectType)
    .filter((row) => matchesRow(row, keyword));
  return paginateCounterpartyBalanceRows(filtered, input.page, input.pageSize);
}

export function paginateCounterpartyBalanceRows(
  rows: FinanceCounterpartyBalanceRow[],
  page: number,
  pageSize: number,
): FinanceCounterpartyBalanceResponse {
  const ordered = [...rows].sort(counterpartyBalanceRowOrder);
  const start = (page - 1) * pageSize;
  return {
    data: ordered.slice(start, start + pageSize),
    total: ordered.length,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(ordered.length / pageSize)),
    totals: totalCounterpartyBalances(ordered),
  };
}

function counterpartyBalanceRowOrder(left: FinanceCounterpartyBalanceRow, right: FinanceCounterpartyBalanceRow) {
  return left.accountCode.localeCompare(right.accountCode, "zh-CN")
    || left.counterpartyName.localeCompare(right.counterpartyName, "zh-CN")
    || left.counterpartyCode.localeCompare(right.counterpartyCode, "zh-CN")
    || left.id.localeCompare(right.id);
}

function toMemberFacts(
  accountId: number,
  links: Array<{ member: SelectedCounterpartyMember }>,
  canonicalTypeByPair: ReadonlyMap<string, string>,
  identityByMemberId: ReadonlyMap<number, CounterpartyIdentityFact>,
): CounterpartyMemberFact[] {
  return links.map(({ member }) => {
    const canonicalType = canonicalTypeByPair.get(`${member.id}:${accountId}`) ?? member.dimensionType;
    const identity = identityByMemberId.get(member.id);
    return {
      ...member,
      canonicalType,
      objectKind: memberObjectKind(canonicalType, identity?.targetKind),
      identityMatched: identity?.identityMatched ?? false,
      relatedPartyType: identity?.relatedPartyType ?? null,
    };
  });
}

function memberObjectKind(
  canonicalType: string,
  targetKind: CounterpartyIdentityFact["targetKind"] | undefined,
): FinanceCounterpartyObjectKind {
  if (targetKind === "company") return "groupCompany";
  if (targetKind === "employee") return "employee";
  if (canonicalType === "customer") return "customer";
  if (canonicalType === "supplier") return "supplier";
  if (canonicalType === "department") return "department";
  return "other";
}

function uniqueIdentityMembers(
  links: Array<{ member: CounterpartyIdentityMember }>,
): CounterpartyIdentityMember[] {
  return [...new Map(links.map(({ member }) => [member.id, member])).values()];
}

function periodEndDate(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

async function loadHistoricalCanonicalTypes(
  pairs: Array<{ accountId: number; members: Array<{ member: { id: number } }> }>,
) {
  const accountIds = [...new Set(pairs.map((pair) => pair.accountId))];
  const memberIds = [...new Set(pairs.flatMap((pair) => pair.members.map(({ member }) => member.id)))];
  if (!accountIds.length || !memberIds.length) return new Map<string, string>();
  const rows = await prisma.financeCounterpartyClassification.findMany({
    where: { accountId: { in: accountIds }, memberId: { in: memberIds } },
    select: { accountId: true, memberId: true, counterpartyType: true },
  });
  return new Map(rows.map((row) => [`${row.memberId}:${row.accountId}`, row.counterpartyType]));
}

function matchesRow(row: FinanceCounterpartyBalanceRow, keyword: string) {
  if (!keyword) return true;
  return matchText(row.counterpartyCode, keyword)
    || matchText(row.counterpartyName, keyword)
    || matchText(row.counterpartyShortName ?? "", keyword)
    || matchText(row.accountCode, keyword)
    || matchText(row.accountName, keyword);
}

function emptyResponse(input: ListCounterpartyBalancesInput): FinanceCounterpartyBalanceResponse {
  return {
    data: [],
    total: 0,
    page: input.page,
    pageSize: input.pageSize,
    totalPages: 1,
    totals: totalCounterpartyBalances([]),
  };
}
