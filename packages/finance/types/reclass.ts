export interface RuleCandidate {
  accountCode: string;
  accountName: string;
  balanceDirection: string;
  abnormalSide: "debit" | "credit" | "both";
  abnormalAmount: number;
  existingRuleId: number | null;
  existingTarget: string | null;
  existingDecision: "reclassify" | "no_reclass" | null;
  existingSource: string | null;
  existingRuleSourceAccountCode: string | null;
  existingEnabled: boolean | null;
}
