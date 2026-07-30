import { serviceError, serviceOk } from "@workspace/platform/server/api";

import { sha256CanonicalJson } from "../close/canonical-json";
import type {
  FinanceBalanceCutoverReplayAccount,
  FinanceBalanceCutoverReplayCachedRow,
  FinanceBalanceCutoverReplayDependencies,
  FinanceBalanceCutoverReplayFacts,
  FinanceBalanceCutoverReplayScope,
  FinanceBalanceCutoverReplaySourceRow,
} from "./balance-cutover-replay-contract";
import { financeBalanceCutoverReplayDependencies } from "./balance-cutover-replay-data";
import {
  addToMap,
  rollUpByParent,
  toSides,
  type SideBalance,
} from "./balance-utils";

export type {
  FinanceBalanceCutoverReplayAccount,
  FinanceBalanceCutoverReplayCachedRow,
  FinanceBalanceCutoverReplayDependencies,
  FinanceBalanceCutoverReplayFacts,
  FinanceBalanceCutoverReplayScope,
  FinanceBalanceCutoverReplaySourceRow,
  FinanceBalanceCutoverReplayVoucher,
} from "./balance-cutover-replay-contract";

export const FINANCE_BALANCE_CUTOVER_REPLAY_VERSION = "finance-balance-cutover-replay-v1";

type BalanceAmountField =
  | "openingDebit"
  | "openingCredit"
  | "currentDebit"
  | "currentCredit"
  | "closingDebit"
  | "closingCredit";

type ReplayBalanceRow = {
  accountId: number;
  accountCode: string;
  accountName: string;
  openingDebit: number;
  openingCredit: number;
  currentDebit: number;
  currentCredit: number;
  closingDebit: number;
  closingCredit: number;
};

export type FinanceBalanceCutoverReplayDifference = {
  accountId: number;
  accountCode: string;
  accountName: string;
  field: BalanceAmountField | "row";
  derivedValue: number | null;
  actualValue: number | null;
  difference: number | null;
  issue?: "missing_actual" | "unexpected_actual";
};

class FinanceBalanceCutoverReplayInvariantError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 409) {
    super(message);
    this.name = "FinanceBalanceCutoverReplayInvariantError";
    this.statusCode = statusCode;
  }
}

const amountFields: readonly BalanceAmountField[] = [
  "openingDebit",
  "openingCredit",
  "currentDebit",
  "currentCredit",
  "closingDebit",
  "closingCredit",
];

function money(value: number) {
  if (!Number.isFinite(value)) throw new FinanceBalanceCutoverReplayInvariantError("余额重放遇到非有限金额");
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function cents(value: number) {
  return Math.round(money(value) * 100);
}

function compareRows(
  derivedRows: ReplayBalanceRow[],
  actualRows: ReplayBalanceRow[],
): FinanceBalanceCutoverReplayDifference[] {
  const derivedByAccount = new Map(derivedRows.map((row) => [row.accountId, row]));
  const actualByAccount = new Map(actualRows.map((row) => [row.accountId, row]));
  const differences: FinanceBalanceCutoverReplayDifference[] = [];

  for (const derived of derivedRows) {
    const actual = actualByAccount.get(derived.accountId);
    if (!actual) {
      differences.push({
        accountId: derived.accountId,
        accountCode: derived.accountCode,
        accountName: derived.accountName,
        field: "row",
        derivedValue: null,
        actualValue: null,
        difference: null,
        issue: "missing_actual",
      });
      continue;
    }
    for (const field of amountFields) {
      const differenceCents = cents(actual[field]) - cents(derived[field]);
      if (differenceCents === 0) continue;
      differences.push({
        accountId: derived.accountId,
        accountCode: derived.accountCode,
        accountName: derived.accountName,
        field,
        derivedValue: money(derived[field]),
        actualValue: money(actual[field]),
        difference: differenceCents / 100,
      });
    }
  }

  for (const actual of actualRows) {
    if (derivedByAccount.has(actual.accountId)) continue;
    differences.push({
      accountId: actual.accountId,
      accountCode: actual.accountCode,
      accountName: actual.accountName,
      field: "row",
      derivedValue: null,
      actualValue: null,
      difference: null,
      issue: "unexpected_actual",
    });
  }
  return differences;
}

function replayBalanceRow(
  account: FinanceBalanceCutoverReplayAccount,
  opening: SideBalance,
  current: SideBalance,
): ReplayBalanceRow {
  const closing = toSides(
    account.balanceDirection,
    opening.debit,
    opening.credit,
    current.debit,
    current.credit,
  );
  return {
    accountId: account.id,
    accountCode: account.code,
    accountName: account.name,
    openingDebit: money(opening.debit),
    openingCredit: money(opening.credit),
    currentDebit: money(current.debit),
    currentCredit: money(current.credit),
    closingDebit: money(closing.debit),
    closingCredit: money(closing.credit),
  };
}

function sourceBalanceRow(row: FinanceBalanceCutoverReplaySourceRow): ReplayBalanceRow {
  return {
    accountId: row.accountId,
    accountCode: row.account.code,
    accountName: row.account.name,
    openingDebit: money(row.openingDebit),
    openingCredit: money(row.openingCredit),
    currentDebit: money(row.currentDebit),
    currentCredit: money(row.currentCredit),
    closingDebit: money(row.closingDebit),
    closingCredit: money(row.closingCredit),
  };
}

function cachedBalanceRow(row: FinanceBalanceCutoverReplayCachedRow): ReplayBalanceRow {
  return {
    accountId: row.accountId,
    accountCode: row.account.code,
    accountName: row.account.name,
    openingDebit: money(row.openingDebit),
    openingCredit: money(row.openingCredit),
    currentDebit: money(row.currentDebit),
    currentCredit: money(row.currentCredit),
    closingDebit: money(row.closingDebit),
    closingCredit: money(row.closingCredit),
  };
}

function validateAccountScope(
  account: Pick<FinanceBalanceCutoverReplayAccount, "id" | "code" | "companyCode" | "year" | "isActive">,
  scope: FinanceBalanceCutoverReplayScope,
  context: string,
) {
  if (!account.isActive || account.companyCode !== scope.companyCode || account.year !== scope.year) {
    throw new FinanceBalanceCutoverReplayInvariantError(
      `${context}引用停用、跨公司或错年度科目 ${account.code}（${account.id}）`,
    );
  }
}

export function buildFinanceBalanceCutoverReplay(
  scope: FinanceBalanceCutoverReplayScope,
  facts: FinanceBalanceCutoverReplayFacts,
) {
  if (
    facts.period.companyCode !== scope.companyCode
    || facts.period.year !== scope.year
    || facts.period.month !== scope.month
  ) {
    throw new FinanceBalanceCutoverReplayInvariantError("余额重放期间与请求范围不一致");
  }
  if (!facts.period.sourceSystem || !facts.period.sourceDatabase) {
    throw new FinanceBalanceCutoverReplayInvariantError("当前期间缺少来源系统或来源账套，不能执行切换重放");
  }

  const accounts = [...facts.accounts].sort((left, right) => left.code.localeCompare(right.code) || left.id - right.id);
  const accountIds = new Set<number>();
  const accountCodes = new Set<string>();
  for (const account of accounts) {
    validateAccountScope(account, scope, "科目表");
    if (accountIds.has(account.id) || accountCodes.has(account.code)) {
      throw new FinanceBalanceCutoverReplayInvariantError(`科目表存在重复科目 ${account.code}（${account.id}）`);
    }
    accountIds.add(account.id);
    accountCodes.add(account.code);
  }

  const sourceBalances = [...facts.sourceBalances].sort((left, right) => (
    left.account.code.localeCompare(right.account.code) || left.accountId - right.accountId || left.id - right.id
  ));
  if (sourceBalances.length === 0) {
    throw new FinanceBalanceCutoverReplayInvariantError("当前期间没有来源期初余额，不能执行切换重放");
  }
  const importIds = new Set(sourceBalances.map((row) => row.importId));
  if (importIds.size !== 1) {
    throw new FinanceBalanceCutoverReplayInvariantError("当前期间来源余额跨多个导入批次，不能确定唯一切换输入");
  }

  const openingByCode = new Map<string, SideBalance>();
  const sourceAccountIds = new Set<number>();
  for (const row of sourceBalances) {
    validateAccountScope(row.account, scope, "来源余额");
    if (!accountIds.has(row.accountId)) {
      throw new FinanceBalanceCutoverReplayInvariantError(`来源余额科目 ${row.account.code} 不在当前有效科目表`);
    }
    if (sourceAccountIds.has(row.accountId)) {
      throw new FinanceBalanceCutoverReplayInvariantError(`来源余额科目 ${row.account.code} 存在多行，切换输入不唯一`);
    }
    sourceAccountIds.add(row.accountId);
    if (row.companyCode !== scope.companyCode
      || row.sourceSystem !== facts.period.sourceSystem
      || row.sourceDatabase !== facts.period.sourceDatabase
      || row.import.id !== row.importId
      || row.import.status !== "completed"
      || row.import.sourceSystem !== row.sourceSystem
      || row.import.sourceDatabase !== row.sourceDatabase
      || row.import.cutoffDate !== facts.period.endDate) {
      throw new FinanceBalanceCutoverReplayInvariantError(`来源余额 ${row.sourceKey} 的公司、账套、批次状态或截止日与期间不一致`);
    }
    openingByCode.set(row.account.code, {
      debit: money(row.openingDebit),
      credit: money(row.openingCredit),
    });
  }

  const statusCounts = new Map<string, number>();
  const directCurrent = new Map<string, SideBalance>();
  const postedVouchers = [...facts.vouchers]
    .filter((voucher) => voucher.status === "posted")
    .sort((left, right) => left.id - right.id);
  let postedItemCount = 0;
  let totalDebitCents = 0;
  let totalCreditCents = 0;
  for (const voucher of facts.vouchers) {
    statusCounts.set(voucher.status, (statusCounts.get(voucher.status) ?? 0) + 1);
  }
  for (const voucher of postedVouchers) {
    if (voucher.companyCode !== scope.companyCode) {
      throw new FinanceBalanceCutoverReplayInvariantError(`凭证 ${voucher.voucherNo} 不属于当前公司`);
    }
    let itemDebitCents = 0;
    let itemCreditCents = 0;
    for (const item of [...voucher.items].sort((left, right) => left.id - right.id)) {
      validateAccountScope(item.account, scope, `凭证 ${voucher.voucherNo}`);
      if (!accountIds.has(item.accountId)) {
        throw new FinanceBalanceCutoverReplayInvariantError(`凭证 ${voucher.voucherNo} 的科目 ${item.account.code} 不在当前有效科目表`);
      }
      const debit = money(item.debit);
      const credit = money(item.credit);
      addToMap(directCurrent, item.account.code, debit, credit);
      itemDebitCents += cents(debit);
      itemCreditCents += cents(credit);
      postedItemCount += 1;
    }
    const headerDebitCents = cents(voucher.totalDebit);
    const headerCreditCents = cents(voucher.totalCredit);
    if (headerDebitCents !== headerCreditCents
      || itemDebitCents !== itemCreditCents
      || headerDebitCents !== itemDebitCents
      || headerCreditCents !== itemCreditCents) {
      throw new FinanceBalanceCutoverReplayInvariantError(`凭证 ${voucher.voucherNo} 借贷或表头明细不一致`);
    }
    totalDebitCents += headerDebitCents;
    totalCreditCents += headerCreditCents;
  }

  const currentByCode = rollUpByParent(accounts, directCurrent);
  const derivedBalances = accounts.map((account) => replayBalanceRow(
    account,
    openingByCode.get(account.code) ?? { debit: 0, credit: 0 },
    currentByCode.get(account.code) ?? { debit: 0, credit: 0 },
  ));
  const derivedByAccount = new Map(derivedBalances.map((row) => [row.accountId, row]));
  const sourceExpected = sourceBalances.map((row) => derivedByAccount.get(row.accountId)!);
  const sourceActual = sourceBalances.map(sourceBalanceRow);

  const cachedRows = [...facts.cachedBalances].sort((left, right) => (
    left.account.code.localeCompare(right.account.code) || left.accountId - right.accountId || left.id - right.id
  ));
  for (const row of cachedRows) validateAccountScope(row.account, scope, "余额缓存");
  const sourceDifferences = compareRows(sourceExpected, sourceActual);
  const cacheDifferences = compareRows(derivedBalances, cachedRows.map(cachedBalanceRow));
  const sourceImport = sourceBalances[0]!.import;
  const ignoredVoucherStatusCounts = Object.fromEntries(
    [...statusCounts.entries()].filter(([voucherStatus]) => voucherStatus !== "posted").sort(([left], [right]) => left.localeCompare(right)),
  );

  const result = {
    algorithmVersion: FINANCE_BALANCE_CUTOVER_REPLAY_VERSION,
    scope: { ...scope, periodId: facts.period.id, periodEndDate: facts.period.endDate },
    sourceInput: {
      importId: sourceImport.id,
      batchKey: sourceImport.batchKey,
      sourceSystem: facts.period.sourceSystem,
      sourceDatabase: facts.period.sourceDatabase,
      cutoffDate: sourceImport.cutoffDate,
      checksum: sourceImport.checksum,
      openingRowCount: sourceBalances.length,
      defaultedZeroOpeningRowCount: derivedBalances.length - sourceBalances.length,
    },
    vouchers: {
      postedVoucherCount: postedVouchers.length,
      postedItemCount,
      totalDebit: totalDebitCents / 100,
      totalCredit: totalCreditCents / 100,
      ignoredStatusCounts: ignoredVoucherStatusCounts,
    },
    derived: { rowCount: derivedBalances.length, balances: derivedBalances },
    sourceComparison: {
      comparedRowCount: sourceBalances.length,
      differenceCount: sourceDifferences.length,
      differences: sourceDifferences,
    },
    cacheComparison: {
      comparedRowCount: derivedBalances.length,
      actualRowCount: cachedRows.length,
      differenceCount: cacheDifferences.length,
      differences: cacheDifferences,
    },
    ready: sourceDifferences.length === 0 && cacheDifferences.length === 0,
  };

  return {
    ...result,
    fingerprint: sha256CanonicalJson({
      ...result,
      sourceOpenings: sourceBalances.map((row) => ({
        id: row.id,
        sourceKey: row.sourceKey,
        accountId: row.accountId,
        openingDebit: money(row.openingDebit),
        openingCredit: money(row.openingCredit),
      })),
      postedVouchers: postedVouchers.map((voucher) => ({
        id: voucher.id,
        voucherNo: voucher.voucherNo,
        totalDebit: money(voucher.totalDebit),
        totalCredit: money(voucher.totalCredit),
        items: [...voucher.items].sort((left, right) => left.id - right.id).map((item) => ({
          id: item.id,
          accountId: item.accountId,
          debit: money(item.debit),
          credit: money(item.credit),
        })),
      })),
    }),
  };
}

export async function replayFinanceBalanceCutover(
  scope: FinanceBalanceCutoverReplayScope,
  deps: FinanceBalanceCutoverReplayDependencies = financeBalanceCutoverReplayDependencies,
) {
  const facts = await deps.loadFacts(scope);
  if (!facts) return serviceError("会计期间不存在", 404);
  try {
    return serviceOk({ success: true as const, replay: buildFinanceBalanceCutoverReplay(scope, facts) });
  } catch (error) {
    if (error instanceof FinanceBalanceCutoverReplayInvariantError) {
      return serviceError(error.message, error.statusCode);
    }
    throw error;
  }
}
