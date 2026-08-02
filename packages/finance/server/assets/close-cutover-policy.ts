import type { FinanceCloseScope } from "../../types/close";
import type { AssetCloseCard, AssetDepreciationCloseFacts } from "./close-provider-evidence";
import { FINANCE_ASSET_LEGACY_CUTOVER_MODE } from "./legacy-cutover";
import { moneyIsNonZero } from "./money-cents";

export function isControlledCutoverOpening(card: AssetCloseCard, periodEnd: string): boolean {
  return card.initializationMode === FINANCE_ASSET_LEGACY_CUTOVER_MODE
    && card.cutoverDate === periodEnd
    && card.openingAsOfDate === periodEnd
    && Boolean(card.depreciationStartDate && card.depreciationStartDate > periodEnd);
}

export function buildSourceClosedCutoverOutcome(
  scope: FinanceCloseScope,
  facts: AssetDepreciationCloseFacts,
  relevantCards: AssetCloseCard[],
  periodEnd: string,
) {
  const voucherIds = facts.ledgerVoucherIds ?? [];
  const controlled = scope.year === 2026 && scope.month === 6
    && facts.period?.sourceClosed === true
    && relevantCards.length > 0
    && relevantCards.every((card) => card.initializationMode === FINANCE_ASSET_LEGACY_CUTOVER_MODE
      && card.cutoverDate === periodEnd && card.openingAsOfDate === periodEnd)
    && facts.entries.length === 0
    && facts.adjustments.length === 0
    && facts.ledgerByAccount.some((row) => moneyIsNonZero(row.amount))
    && voucherIds.length > 0;
  if (!controlled || !facts.period) return null;
  return {
    payload: {
      periodId: facts.period.id,
      applicable: true,
      cutoverPolicy: "source-closed-ledger-v1",
      cutoverDate: periodEnd,
      assetCount: relevantCards.length,
      ledgerByAccount: facts.ledgerByAccount,
      ledgerVoucherIds: voucherIds,
      decision: "June activity is already included in the June-30 opening cutover balances; do not generate duplicate period rows",
    },
    evidenceRefs: [`finance-period:${facts.period.id}`],
    voucherRefs: voucherIds.map((id) => `finance-voucher:${id}`),
  };
}
