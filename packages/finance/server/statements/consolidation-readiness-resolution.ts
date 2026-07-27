import type { ConsolidationReadinessCheck } from "@workspace/finance/types";

export function consolidationReadinessResolution(
  batchId: number | null,
  key: string,
  batchStatus?: string,
): ConsolidationReadinessCheck["resolution"] {
  const batchTarget = batchId
    ? `/api/modules/finance/statements/consolidation/batches/${batchId}`
    : "/api/modules/finance/statements/consolidation/batches";
  if (key === "scope" || key === "ownership") return {
    ownerModule: "finance",
    actionKey: "finance.statements.consolidationScope.save",
    target: "/api/modules/finance/statements/consolidation/scope-selections",
  };
  if (key === "fx") return {
    ownerModule: "finance",
    actionKey: "finance.statements.exchangeRate.save",
    target: "/api/modules/finance/statements/consolidation/exchange-rates",
  };
  if (!batchId) return {
    ownerModule: "finance",
    actionKey: "finance.statements.consolidationBatch.ensure",
    target: batchTarget,
  };
  if (key === "sources") return {
    ownerModule: "finance",
    actionKey: "finance.statements.consolidationSources.save",
    target: `${batchTarget}/sources`,
  };
  if (key === "eliminations") return {
    ownerModule: "finance",
    actionKey: "finance.statements.consolidationEntry.save",
    target: `${batchTarget}/entries`,
  };
  if (key === "tax") return {
    ownerModule: "finance",
    actionKey: "finance.statements.consolidationControl.resolve",
    target: `${batchTarget}/control-decisions`,
  };
  const lifecycle = batchStatus === "submitted"
    ? "review"
    : batchStatus === "reviewed"
      ? "lock"
      : batchStatus === "locked"
        ? "publish"
        : "submit";
  return {
    ownerModule: "finance",
    actionKey: `finance.statements.consolidationBatch.${lifecycle}`,
    target: `${batchTarget}/${lifecycle}`,
  };
}
