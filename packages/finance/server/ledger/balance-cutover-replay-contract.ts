import type { FinanceAccountLike } from "./balance-contract";

export interface FinanceBalanceCutoverReplayScope {
  companyCode: string;
  year: number;
  month: number;
}

export interface FinanceBalanceCutoverReplayAccount extends FinanceAccountLike {
  name: string;
  companyCode: string;
  year: number | null;
  isActive: boolean;
}

type ScopedReplayAccount = Pick<
  FinanceBalanceCutoverReplayAccount,
  "id" | "code" | "name" | "companyCode" | "year" | "isActive"
>;

export interface FinanceBalanceCutoverReplaySourceRow {
  id: number;
  importId: number;
  accountId: number;
  companyCode: string;
  sourceSystem: string;
  sourceDatabase: string;
  sourceKey: string;
  openingDebit: number;
  openingCredit: number;
  currentDebit: number;
  currentCredit: number;
  closingDebit: number;
  closingCredit: number;
  account: ScopedReplayAccount;
  import: {
    id: number;
    status: string;
    batchKey: string | null;
    sourceSystem: string | null;
    sourceDatabase: string | null;
    cutoffDate: string | null;
    checksum: string | null;
  };
}

export interface FinanceBalanceCutoverReplayCachedRow {
  id: number;
  accountId: number;
  openingDebit: number;
  openingCredit: number;
  currentDebit: number;
  currentCredit: number;
  closingDebit: number;
  closingCredit: number;
  account: ScopedReplayAccount;
}

export interface FinanceBalanceCutoverReplayVoucher {
  id: number;
  voucherNo: string;
  status: string;
  companyCode: string;
  totalDebit: number;
  totalCredit: number;
  items: Array<{
    id: number;
    accountId: number;
    debit: number;
    credit: number;
    account: ScopedReplayAccount;
  }>;
}

export interface FinanceBalanceCutoverReplayFacts {
  period: {
    id: number;
    companyCode: string;
    year: number;
    month: number;
    endDate: string;
    sourceSystem: string | null;
    sourceDatabase: string | null;
  };
  accounts: FinanceBalanceCutoverReplayAccount[];
  sourceBalances: FinanceBalanceCutoverReplaySourceRow[];
  cachedBalances: FinanceBalanceCutoverReplayCachedRow[];
  vouchers: FinanceBalanceCutoverReplayVoucher[];
}

export interface FinanceBalanceCutoverReplayDependencies {
  loadFacts(scope: FinanceBalanceCutoverReplayScope): Promise<FinanceBalanceCutoverReplayFacts | null>;
}
