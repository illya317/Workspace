export interface RuleCandidate {
  accountCode: string;
  accountName: string;
  balanceDirection: string;
  abnormalSide: string;
  abnormalAmount: number;
  suggestedTarget: string;
  existingRuleId: number | null;
  existingTarget: string | null;
  existingSource: string | null;
  existingEnabled: boolean | null;
}
