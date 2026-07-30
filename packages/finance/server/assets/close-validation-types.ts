import type {
  ConfirmFinanceAssetAcquisitionEvidenceInput,
  ConfirmFinanceAssetDisposalInput,
  ConfirmFinanceAssetImpairmentAssessmentInput,
} from "../../types/assets";
import type { AssetAccumulatedReplayInput } from "./accumulated-replay";
import type { AssetScopeCard } from "./period-scope";

export type FinanceAssetImpairmentContext = {
  period: { id: number; isClosed: boolean };
  cards: AssetScopeCard[];
  policies: Array<{
    categoryId: number;
    assetAccountCode: string | null;
    assetAccountId: number | null;
    accumulatedAccountCode: string | null;
    accumulatedAccountId: number | null;
    impairmentLossAccountCode: string | null;
    impairmentAllowanceAccountCode: string | null;
  }>;
};

export type FinanceAssetImpairmentVoucherReference = {
  id: number;
  voucherNo: string;
  periodId: number;
  companyCode: string;
  status: string;
  totalDebit: number;
  totalCredit: number;
  items: Array<{ id: number; accountCode: string; debit: number; credit: number }>;
};

export type FinanceAssetImpairmentAssessmentConfirmCommand = {
  input: ConfirmFinanceAssetImpairmentAssessmentInput;
  userId: number;
  periodId: number;
  assetCount: number;
  assetScopeFingerprint: string;
  voucher: FinanceAssetImpairmentVoucherReference | null;
};

export type FinanceAssetAcquisitionContext = {
  period: { id: number; isClosed: boolean } | null;
  company: { id: number; code: string } | null;
  asset: ({
    id: number;
    companyCode: string;
    companyId: number | null;
    version: number;
    status: string;
    acquisitionDate: string | null;
    categoryId: number;
    originalCost: number;
    assetAccountCode: string;
    assetAccountId: number | null;
  }) | null;
  existingEvidenceId: number | null;
  voucher: FinanceAssetImpairmentVoucherReference | null;
  policy: { assetAccountCode: string; assetAccountId: number } | null;
  occupiedVoucherItemIds: number[];
};

export type FinanceAssetAcquisitionEvidenceConfirmCommand = {
  input: ConfirmFinanceAssetAcquisitionEvidenceInput;
  userId: number;
  companyId: number;
  periodId: number;
  voucherItemId: number;
  amount: number;
};

export type FinanceAssetDisposalContext = {
  period: { id: number; isClosed: boolean } | null;
  asset: ({
    id: number;
    companyCode: string;
    version: number;
    status: string;
    acquisitionDate: string | null;
    categoryId: number;
    assetCode: string;
    originalCost: number;
    assetAccountCode: string;
    assetAccountId: number | null;
    accumulatedAccountCode: string | null;
    accumulatedAccountId: number | null;
    openingAccumulatedAmount: number;
    openingAsOfDate: string | null;
  }) | null;
  existingDisposalId: number | null;
  voucher: FinanceAssetImpairmentVoucherReference | null;
  policy: {
    assetAccountCode: string;
    assetAccountId: number;
    accumulatedAccountCode: string | null;
    accumulatedAccountId: number | null;
    impairmentAllowanceAccountCode: string | null;
    disposalGainLossAccountCode: string | null;
  } | null;
  priorEntries: AssetAccumulatedReplayInput["priorEntries"];
  priorAdjustments: AssetAccumulatedReplayInput["priorAdjustments"];
  priorImpairments: AssetAccumulatedReplayInput["priorImpairments"];
  currentEntries: Array<{ assetId: number; normalAmount: number; status: string; voucher: AssetAccumulatedReplayInput["priorEntries"][number]["voucher"] }>;
  currentAdjustments: Array<{ assetId: number | null; amount: number; status: string; voucher: AssetAccumulatedReplayInput["priorAdjustments"][number]["voucher"] }>;
  occupiedVoucherItemIds: number[];
};

export type FinanceAssetDisposalConfirmCommand = {
  input: ConfirmFinanceAssetDisposalInput;
  userId: number;
  periodId: number;
  voucherId: number;
  voucherItems: {
    assetVoucherItemId: number;
    accumulatedVoucherItemId: number | null;
    impairmentAllowanceVoucherItemId: number | null;
    proceedsVoucherItemId: number | null;
    gainLossVoucherItemId: number | null;
  };
};
