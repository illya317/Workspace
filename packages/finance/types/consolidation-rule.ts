import type { FinanceConsolidationRole } from "./group-account";

export type FinanceConsolidationRuleType =
  | "intercompanyBalance"
  | "investmentEquity"
  | "intercompanyRevenueExpense"
  | "intercompanyDividend"
  | "inventoryProfit"
  | "fixedAssetProfit"
  | "internalCashFlow"
  | "manualReclassification";

export interface FinanceConsolidationRuleSelectorRow {
  id: number;
  side: "left" | "right" | "difference";
  sequence: number;
  selectorType: "role" | "groupAccount";
  consolidationRole: FinanceConsolidationRole | null;
  groupAccountId: number | null;
  groupAccount: { id: number; code: string; name: string } | null;
  includeChildren: boolean;
  resolvedGroupAccounts: Array<{
    id: number;
    code: string;
    name: string;
    consolidationRole: FinanceConsolidationRole;
    counterpartyRequirement: "none" | "optional" | "required";
    movementType: "closingBalance" | "periodMovement" | "transaction";
    translationRateType: "closing" | "average" | "historical" | "transactionDate";
  }>;
}

export interface FinanceConsolidationRuleRow {
  id: number;
  policyVersionId: number;
  ruleCode: string;
  name: string;
  ruleType: FinanceConsolidationRuleType;
  dataBasis: "closingBalance" | "periodMovement" | "voucher" | "openItem";
  matchMode: "partnerAggregate" | "ownershipChain" | "documentReference" | "manual";
  amountMode: "lowerOfTwoSides" | "fullSource" | "netChange" | "fixed";
  postingSide: "both" | "leading" | "partner";
  differenceHandling: "exception" | "postToDifferenceAccount" | "carryForward";
  toleranceAmount: number;
  currencyRateType: "source" | "closing" | "average" | "historical" | "transactionDate";
  enabled: boolean;
  priority: number;
  sourceKind: "systemDefault" | "manual";
  note: string | null;
  createdAt: string;
  updatedAt: string;
  selectors: FinanceConsolidationRuleSelectorRow[];
}

export interface FinanceConsolidationRuleResponse {
  currentPolicyVersionId: number;
  selectedPolicyVersionId: number;
  policyVersions: Array<{
    id: number;
    versionNo: number;
    code: string;
    name: string;
    effectiveFrom: string | null;
    effectiveTo: string | null;
    status: string;
    createdAt: string;
  }>;
  rows: FinanceConsolidationRuleRow[];
}

export interface SaveFinanceConsolidationRuleInput {
  ruleCode: string;
  name: string;
  ruleType: FinanceConsolidationRuleType;
  dataBasis: FinanceConsolidationRuleRow["dataBasis"];
  matchMode: FinanceConsolidationRuleRow["matchMode"];
  amountMode: FinanceConsolidationRuleRow["amountMode"];
  postingSide: FinanceConsolidationRuleRow["postingSide"];
  differenceHandling: FinanceConsolidationRuleRow["differenceHandling"];
  toleranceAmount: number;
  currencyRateType: FinanceConsolidationRuleRow["currencyRateType"];
  enabled: boolean;
  priority: number;
  note: string | null;
  leftRoles: FinanceConsolidationRole[];
  rightRoles: FinanceConsolidationRole[];
  differenceGroupAccountId: number | null;
  expectedUpdatedAt?: string;
}
