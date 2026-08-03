import type {
  ConsolidationControlKey,
  ConsolidationEntryType,
} from "@workspace/finance/types";

export const CONSOLIDATION_ENTRY_TYPES: readonly ConsolidationEntryType[] = [
  "groupAdjustment",
  "investmentEquity",
  "reclassification",
  "nonControllingInterest",
  "intercompanyBalance",
  "internalTrading",
  "internalLongTermAsset",
  "incomeDividend",
  "cashFlow",
];

/** Current product scope. Remaining statutory elimination types stay modeled for a later phase. */
export const ACTIVE_CONSOLIDATION_ENTRY_TYPES: readonly ConsolidationEntryType[] = [
  "investmentEquity",
  "nonControllingInterest",
  "intercompanyBalance",
  "cashFlow",
];

/** Entry types that belong to statutory elimination controls; manual group adjustments are not elimination packages. */
export const CONSOLIDATION_ELIMINATION_ENTRY_TYPES = CONSOLIDATION_ENTRY_TYPES.filter(
  (entryType) => entryType !== "groupAdjustment",
);

/** Objective preparation controls confirmed together after the system facts are complete. */
export const CONSOLIDATION_COMPLETION_CONTROL_KEYS: readonly ConsolidationControlKey[] = [
  "scope",
  "ownership",
  "sources",
  "fx",
  "tax",
];

export const CONSOLIDATION_CONTROL_KEYS: readonly ConsolidationControlKey[] = [
  "scope",
  "ownership",
  "sources",
  "fx",
  "tax",
  ...CONSOLIDATION_ELIMINATION_ENTRY_TYPES.map((entryType) => `elimination:${entryType}` as const),
];
