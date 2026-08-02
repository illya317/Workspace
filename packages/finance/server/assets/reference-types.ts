import type {
  FinanceAssetKind,
  FinanceAssetUsefulLifeMode,
} from "../../types/assets";
import type { FinanceAssetImpairmentVoucherReference } from "./close-validation-types";

export type FinanceAssetAccountReference = {
  id: number;
  code: string;
  name: string;
};

export type FinanceAssetCategoryReference = {
  id: number;
  code: string;
  name: string;
  assetKind: FinanceAssetKind;
  assetAccount: FinanceAssetAccountReference;
  accumulatedAccount: FinanceAssetAccountReference | null;
  expenseAccount: FinanceAssetAccountReference | null;
  defaultUsefulLifeMonths: number | null;
  defaultResidualRate: number | null;
  defaultMethod: string;
  usefulLifeMode: FinanceAssetUsefulLifeMode;
  minimumUsefulLifeMonths: number | null;
  maximumUsefulLifeMonths: number | null;
  reviewRequired: boolean;
};

export type FinanceAssetPeriodVoucherLinkContext = {
  period: { id: number; isClosed: boolean } | null;
  voucher: (Omit<FinanceAssetImpairmentVoucherReference, "items"> & {
    items: Array<{ accountCode: string; debit: number; credit: number }>;
  }) | null;
  entries: Array<{
    id: number;
    voucherId: number | null;
    status: string;
    assetId: number;
    accountCode: string;
    expenseAccountCode: string;
    amount: number;
    policyIssue: string | null;
  }>;
  adjustments: Array<{
    id: number;
    assetId: number | null;
    voucherId: number | null;
    status: string;
    accountCode: string;
    expenseAccountCode: string | null;
    amount: number;
    policyIssue: string | null;
  }>;
};
