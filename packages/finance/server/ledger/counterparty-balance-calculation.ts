import type {
  FinanceCounterpartyBalanceCategory,
  FinanceCounterpartyBalanceRow,
  FinanceCounterpartyBalanceTotals,
  FinanceCounterpartyObjectKind,
  FinanceCounterpartyRelatedPartyType,
  FinanceCounterpartyRelationScope,
} from "../../types/ledger";

export interface CounterpartyMemberFact {
  id: number;
  dimensionType: string;
  sourceCode: string;
  sourceName: string;
  shortName: string | null;
  canonicalType?: string;
  objectKind?: FinanceCounterpartyObjectKind;
  identityMatched?: boolean;
  relatedPartyType?: FinanceCounterpartyRelatedPartyType | null;
}

export interface CounterpartyBalanceFact {
  sourceId: string;
  accountId: number;
  accountCode: string;
  accountName: string;
  members: CounterpartyMemberFact[];
  openingDebit: number;
  openingCredit: number;
  currentDebit: number;
  currentCredit: number;
}

export interface CounterpartyPeriodBalanceFact extends CounterpartyBalanceFact {
  month: number;
}

export interface CounterpartyVoucherFact {
  sourceId: string;
  month: number;
  accountId: number;
  accountCode: string;
  accountName: string;
  members: CounterpartyMemberFact[];
  debit: number;
  credit: number;
}

type MutableBalanceRow = FinanceCounterpartyBalanceRow;

const ZERO_TOTALS: FinanceCounterpartyBalanceTotals = {
  openingDebit: 0,
  openingCredit: 0,
  currentDebit: 0,
  currentCredit: 0,
  closingDebit: 0,
  closingCredit: 0,
};

export function accountPrefixForCounterpartyCategory(category: FinanceCounterpartyBalanceCategory) {
  return { ar: "1122", ap: "2202", otherAr: "1221", otherAp: "2241" }[category];
}

export function aggregateMonthlyCounterpartyBalances(
  facts: readonly CounterpartyBalanceFact[],
  category: FinanceCounterpartyBalanceCategory,
): FinanceCounterpartyBalanceRow[] {
  const rows = groupFacts(facts, category, "erpMonthly");
  for (const row of rows.values()) normalizeClosing(row);
  return sortRows([...rows.values()].filter(hasBalanceActivity));
}

export function aggregatePeriodCounterpartyBalances(
  facts: readonly CounterpartyPeriodBalanceFact[],
  category: FinanceCounterpartyBalanceCategory,
  startMonth: number,
  endMonth: number,
): FinanceCounterpartyBalanceRow[] {
  const rows = new Map<string, MutableBalanceRow>();
  for (const fact of facts) {
    if (fact.month < startMonth || fact.month > endMonth) continue;
    const row = findOrCreateRow(rows, fact, category, "erpMonthly");
    if (fact.month === startMonth) {
      row.openingDebit += fact.openingDebit;
      row.openingCredit += fact.openingCredit;
    }
    row.currentDebit += fact.currentDebit;
    row.currentCredit += fact.currentCredit;
  }
  for (const row of rows.values()) normalizeClosing(row);
  return sortRows([...rows.values()].filter(hasBalanceActivity));
}

export function rollForwardHistoricalCounterpartyBalances(
  openingFacts: readonly CounterpartyBalanceFact[],
  voucherFacts: readonly CounterpartyVoucherFact[],
  category: FinanceCounterpartyBalanceCategory,
  startMonth: number,
  endMonth: number,
): FinanceCounterpartyBalanceRow[] {
  const rows = groupFacts(openingFacts.map((fact) => ({
    ...fact,
    currentDebit: 0,
    currentCredit: 0,
  })), category, "historicalRollforward");
  for (const fact of voucherFacts) {
    if (fact.month > endMonth) continue;
    const row = findOrCreateRow(rows, fact, category, "historicalRollforward");
    if (fact.month < startMonth) {
      row.openingDebit += fact.debit;
      row.openingCredit += fact.credit;
    } else {
      row.currentDebit += fact.debit;
      row.currentCredit += fact.credit;
    }
  }
  for (const row of rows.values()) {
    const openingNet = row.openingDebit - row.openingCredit;
    row.openingDebit = roundMoney(Math.max(openingNet, 0));
    row.openingCredit = roundMoney(Math.max(-openingNet, 0));
    normalizeClosing(row);
  }
  return sortRows([...rows.values()].filter(hasBalanceActivity));
}

export function totalCounterpartyBalances(
  rows: readonly FinanceCounterpartyBalanceRow[],
): FinanceCounterpartyBalanceTotals {
  return rows.reduce((totals, row) => ({
    openingDebit: roundMoney(totals.openingDebit + row.openingDebit),
    openingCredit: roundMoney(totals.openingCredit + row.openingCredit),
    currentDebit: roundMoney(totals.currentDebit + row.currentDebit),
    currentCredit: roundMoney(totals.currentCredit + row.currentCredit),
    closingDebit: roundMoney(totals.closingDebit + row.closingDebit),
    closingCredit: roundMoney(totals.closingCredit + row.closingCredit),
  }), { ...ZERO_TOTALS });
}

export function matchesCounterpartyRelationScope(
  row: FinanceCounterpartyBalanceRow,
  scope: FinanceCounterpartyRelationScope,
) {
  if (scope === "related") return row.relatedPartyType !== null;
  if (scope === "other") return row.relatedPartyType === null;
  if (scope === "unrelated") return row.identityMatched && row.relatedPartyType === null;
  if (scope === "unmatched") return !row.identityMatched;
  return true;
}

function groupFacts(
  facts: readonly CounterpartyBalanceFact[],
  category: FinanceCounterpartyBalanceCategory,
  sourceBasis: FinanceCounterpartyBalanceRow["sourceBasis"],
) {
  const rows = new Map<string, MutableBalanceRow>();
  for (const fact of facts) {
    const row = findOrCreateRow(rows, fact, category, sourceBasis);
    row.openingDebit += fact.openingDebit;
    row.openingCredit += fact.openingCredit;
    row.currentDebit += fact.currentDebit;
    row.currentCredit += fact.currentCredit;
  }
  return rows;
}

function findOrCreateRow(
  rows: Map<string, MutableBalanceRow>,
  fact: Pick<CounterpartyBalanceFact, "sourceId" | "accountId" | "accountCode" | "accountName" | "members">,
  category: FinanceCounterpartyBalanceCategory,
  sourceBasis: FinanceCounterpartyBalanceRow["sourceBasis"],
) {
  const party = selectPrimaryCounterparty(fact.members, category, fact.accountCode);
  const partyKey = party ? String(party.id) : `unassigned-${fact.sourceId}`;
  const key = `${fact.accountId}:${partyKey}`;
  const existing = rows.get(key);
  if (existing) return existing;
  const row: MutableBalanceRow = {
    id: key,
    counterpartyCode: party?.sourceCode ?? "—",
    counterpartyName: party?.sourceName ?? "未指定往来对象",
    counterpartyShortName: party?.shortName ?? null,
    counterpartyType: party?.canonicalType ?? party?.dimensionType ?? "unknown",
    counterpartyObjectKind: party?.objectKind ?? inferObjectKind(party),
    identityMatched: party?.identityMatched ?? false,
    relatedPartyType: party?.relatedPartyType ?? null,
    accountCode: fact.accountCode,
    accountName: fact.accountName,
    openingDebit: 0,
    openingCredit: 0,
    currentDebit: 0,
    currentCredit: 0,
    closingDebit: 0,
    closingCredit: 0,
    sourceBasis,
  };
  rows.set(key, row);
  return row;
}

function inferObjectKind(party: CounterpartyMemberFact | undefined): FinanceCounterpartyObjectKind {
  const type = party?.canonicalType ?? party?.dimensionType;
  if (type === "customer") return "customer";
  if (type === "supplier") return "supplier";
  if (type === "person") return "other";
  if (type === "department") return "department";
  return "other";
}

function selectPrimaryCounterparty(
  members: readonly CounterpartyMemberFact[],
  category: FinanceCounterpartyBalanceCategory,
  accountCode: string,
) {
  const priorities = preferredTypes(category, accountCode);
  return [...members].sort((left, right) => {
    const leftType = left.canonicalType ?? left.dimensionType;
    const rightType = right.canonicalType ?? right.dimensionType;
    const typeOrder = priorityIndex(priorities, leftType) - priorityIndex(priorities, rightType);
    return typeOrder || left.sourceCode.localeCompare(right.sourceCode, "zh-CN");
  })[0];
}

function preferredTypes(category: FinanceCounterpartyBalanceCategory, accountCode: string) {
  if (category === "ar") return ["customer", "person", "supplier"];
  if (category === "ap") return ["supplier", "person", "customer"];
  if (accountCode.startsWith("122102") || accountCode.startsWith("224102")) {
    return ["person", category === "otherAr" ? "customer" : "supplier", "department"];
  }
  return category === "otherAr"
    ? ["customer", "person", "supplier", "department"]
    : ["supplier", "person", "customer", "department"];
}

function priorityIndex(priorities: readonly string[], value: string) {
  const index = priorities.indexOf(value);
  return index === -1 ? priorities.length : index;
}

function normalizeClosing(row: MutableBalanceRow) {
  row.openingDebit = roundMoney(row.openingDebit);
  row.openingCredit = roundMoney(row.openingCredit);
  row.currentDebit = roundMoney(row.currentDebit);
  row.currentCredit = roundMoney(row.currentCredit);
  const closingNet = row.openingDebit - row.openingCredit + row.currentDebit - row.currentCredit;
  row.closingDebit = roundMoney(Math.max(closingNet, 0));
  row.closingCredit = roundMoney(Math.max(-closingNet, 0));
}

function sortRows(rows: FinanceCounterpartyBalanceRow[]) {
  return rows.sort((left, right) => left.accountCode.localeCompare(right.accountCode, "zh-CN")
    || left.counterpartyName.localeCompare(right.counterpartyName, "zh-CN")
    || left.counterpartyCode.localeCompare(right.counterpartyCode, "zh-CN"));
}

function hasBalanceActivity(row: FinanceCounterpartyBalanceRow) {
  return row.openingDebit !== 0
    || row.openingCredit !== 0
    || row.currentDebit !== 0
    || row.currentCredit !== 0
    || row.closingDebit !== 0
    || row.closingCredit !== 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
