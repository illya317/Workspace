import type {
  TreasuryBankReconciliationDto,
  TreasuryBlockerDto,
  TreasuryInterestWorkpaperDto,
  TreasuryScope,
} from "../../types/treasury";

export function buildTreasuryBlockers(
  scope: TreasuryScope,
  periodExists: boolean,
  reconciliations: TreasuryBankReconciliationDto[],
  workpapers: TreasuryInterestWorkpaperDto[],
): TreasuryBlockerDto[] {
  const base = `/finance/treasury?companyCode=${encodeURIComponent(scope.companyCode)}&year=${scope.year}&month=${scope.month}`;
  return [
    ...(!periodExists ? [{
      code: "treasury_period_missing",
      message: "会计期间不存在，期间资金底稿不可用",
      entityKind: "scope" as const,
      entityId: null,
      deepLink: base,
    }] : []),
    ...reconciliations.filter((row) => Math.abs(row.calculation.difference) > 0.01).map((row) => ({
      code: "bank_reconciliation_difference",
      message: `银行对账差额 ${row.calculation.difference.toFixed(2)}`,
      entityKind: "bank_reconciliation" as const,
      entityId: row.id,
      deepLink: `${base}&reconciliationId=${row.id}`,
    })),
    ...workpapers.filter((row) => Math.abs(row.calculation.voucherDifference) > 0.01).map((row) => ({
      code: "interest_voucher_difference",
      message: `利息底稿与凭证差额 ${row.calculation.voucherDifference.toFixed(2)}`,
      entityKind: "interest_workpaper" as const,
      entityId: row.id,
      deepLink: `${base}&workpaperId=${row.id}`,
    })),
    ...workpapers.filter((row) => row.calculation.sourceDifference != null && Math.abs(row.calculation.sourceDifference) > 0.01).map((row) => ({
      code: "interest_source_difference",
      message: `利息底稿与来源金额差额 ${row.calculation.sourceDifference!.toFixed(2)}`,
      entityKind: "interest_workpaper" as const,
      entityId: row.id,
      deepLink: `${base}&workpaperId=${row.id}`,
    })),
  ];
}
