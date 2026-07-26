import { matchText } from "@workspace/core/search";
import { prisma } from "@workspace/platform/server/prisma";
import type {
  FinanceCounterpartyBalanceCategory,
  FinanceCounterpartyBalanceResponse,
  FinanceCounterpartyBalanceRow,
} from "../../types/ledger";
import {
  accountPrefixForCounterpartyCategory,
  aggregateMonthlyCounterpartyBalances,
  rollForwardHistoricalCounterpartyBalances,
  totalCounterpartyBalances,
  type CounterpartyBalanceFact,
  type CounterpartyMemberFact,
  type CounterpartyVoucherFact,
} from "./counterparty-balance-calculation";

export interface ListCounterpartyBalancesInput {
  companyCode: string;
  year: number;
  month: number;
  category: FinanceCounterpartyBalanceCategory;
  page: number;
  pageSize: number;
  keyword?: string;
}

const accountSelect = { id: true, code: true, name: true } as const;
const memberSelect = {
  id: true,
  dimensionType: true,
  sourceCode: true,
  sourceName: true,
  shortName: true,
} as const;

export async function listCounterpartyBalances(
  input: ListCounterpartyBalancesInput,
): Promise<FinanceCounterpartyBalanceResponse> {
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
        periodId: period.id,
        sourceSystem: { not: "TPLUS" },
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
  const canonicalTypeByPair = await loadHistoricalCanonicalTypes(historicalPairs);
  const monthlyRows = aggregateMonthlyCounterpartyBalances(monthlyBalances.map((row) => ({
    sourceId: String(row.id),
    accountId: row.account.id,
    accountCode: row.account.code,
    accountName: row.account.name,
    members: toMemberFacts(row.account.id, row.members, new Map()),
    openingDebit: Number(row.openingDebit),
    openingCredit: Number(row.openingCredit),
    currentDebit: Number(row.currentDebit),
    currentCredit: Number(row.currentCredit),
  })), input.category);
  const historicalRows = rollForwardHistoricalCounterpartyBalances(
    historicalOpeningBalances.map((row): CounterpartyBalanceFact => ({
      sourceId: String(row.id),
      accountId: row.account.id,
      accountCode: row.account.code,
      accountName: row.account.name,
      members: toMemberFacts(row.account.id, row.members, canonicalTypeByPair),
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
      members: toMemberFacts(row.account.id, row.auxiliaryLinks, canonicalTypeByPair),
      debit: Number(row.debit),
      credit: Number(row.credit),
    })),
    input.category,
    input.month,
  );
  const keyword = input.keyword?.trim() ?? "";
  const filtered = [...monthlyRows, ...historicalRows].filter((row) => matchesRow(row, keyword));
  const start = (input.page - 1) * input.pageSize;
  return {
    data: filtered.slice(start, start + input.pageSize),
    total: filtered.length,
    page: input.page,
    pageSize: input.pageSize,
    totalPages: Math.max(1, Math.ceil(filtered.length / input.pageSize)),
    totals: totalCounterpartyBalances(filtered),
  };
}

function toMemberFacts(
  accountId: number,
  links: Array<{ member: Omit<CounterpartyMemberFact, "canonicalType"> }>,
  canonicalTypeByPair: ReadonlyMap<string, string>,
): CounterpartyMemberFact[] {
  return links.map(({ member }) => ({
    ...member,
    canonicalType: canonicalTypeByPair.get(`${member.id}:${accountId}`) ?? member.dimensionType,
  }));
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
