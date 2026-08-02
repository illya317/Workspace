import { defineBusinessTemporalRegistration } from "@workspace/platform/contracts/business-temporal";

export const FINANCE_ACCOUNTING_POLICY_TEMPORAL = defineBusinessTemporalRegistration({
  key: "finance.accounting-policy-revision",
  ownerModuleKey: "finance",
  resourceKey: "finance.ledger",
  aggregate: "FinanceAccountingPolicy",
  maturity: "partial",
  records: {
    authority: [
      {
        kind: "model",
        model: "FinanceAccountingPolicyVersion",
        fields: ["id", "versionNo", "effectiveFrom", "effectiveTo", "status"],
        role: "revision",
      },
      {
        kind: "model",
        model: "FinanceGroupAccountRevision",
        fields: ["id", "policyVersionId", "groupAccountId", "code", "name", "isActive"],
        role: "revision",
      },
    ],
  },
  commands: ["publish", "supersede", "purge-draft"],
  ui: {
    asOf: "optional",
    upcoming: true,
    history: true,
    recordState: true,
    sourceNavigation: false,
  },
  policy: {
    storage: "revision",
    granularity: "date",
    futureChanges: "allow",
    sameDayChanges: "single",
    overlaps: "forbid",
    gaps: "allow",
    revision: "supersede",
    deletion: "draft-only",
  },
  notes: "已有版本/修订分表；统一 adapter 与 UI coverage 完成前标记 partial。",
});

export const FINANCE_BUSINESS_TEMPORAL_REGISTRATIONS = [
  FINANCE_ACCOUNTING_POLICY_TEMPORAL,
] as const;
