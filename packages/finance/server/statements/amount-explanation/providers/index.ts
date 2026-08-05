import { consolidationMatchProvider } from "./consolidation-matches";
import { fxTraceProvider } from "./fx-trace";
import { reclassLineageProvider } from "./reclass-lineage";
import { voucherLineProvider } from "./voucher-lines";
import { workbookCellProvider } from "./workbook-cells";
import type { AmountEvidenceProvider } from "./types";

/**
 * provider 注册顺序即诊断顺序与去重优先顺序（确定性）。
 * voucherLine 在最前：直接凭证明细是最常用的直接命中来源。
 */
export function defaultAmountEvidenceProviders(): AmountEvidenceProvider[] {
  return [
    voucherLineProvider(),
    consolidationMatchProvider(),
    reclassLineageProvider(),
    fxTraceProvider(),
    workbookCellProvider(),
  ];
}

export {
  consolidationMatchProvider,
  fxTraceProvider,
  reclassLineageProvider,
  voucherLineProvider,
  workbookCellProvider,
};
export type { AmountEvidenceProvider, EvidenceCandidate, ProviderContext, ProviderOutcome } from "./types";
