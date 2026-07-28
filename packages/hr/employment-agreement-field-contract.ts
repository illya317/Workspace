export const EMPLOYMENT_AGREEMENT_COMMAND_KINDS = [
  "create",
  "replace",
  "renew",
  "end",
  "correct",
  "supplement-term",
  "supplement-missing",
  "correct-existing",
  "set-primary",
  "cancel-future",
] as const;

export type EmploymentAgreementCommandKind = typeof EMPLOYMENT_AGREEMENT_COMMAND_KINDS[number];

export type EmploymentAgreementFormField =
  | "kind"
  | "agreementUid"
  | "termUid"
  | "effectiveFrom"
  | "effectiveThrough"
  | "reason"
  | "company"
  | "insuranceStatus"
  | "legalRelation"
  | "contractType"
  | "employmentForm"
  | "confidentialityDate"
  | "nonCompeteDate"
  | "isPrimary"
  | "termKind";

export const EMPLOYMENT_AGREEMENT_FIELD_LABELS: Record<EmploymentAgreementFormField, string> = {
  kind: "期限动作",
  agreementUid: "合同",
  termUid: "期限记录",
  effectiveFrom: "开始日期",
  effectiveThrough: "到期日期",
  reason: "修订说明",
  company: "公司",
  insuranceStatus: "历史参保状态",
  legalRelation: "法律关系",
  contractType: "协议类型",
  employmentForm: "用工形式",
  confidentialityDate: "保密协议",
  nonCompeteDate: "竞业限制",
  isPrimary: "历史主合同标记",
  termKind: "期限性质",
};

/**
 * Single source of truth for user-entered required fields.
 * UI stars and domain required validation must both consume this contract.
 */
export const EMPLOYMENT_AGREEMENT_REQUIRED_FIELDS = {
  create: ["kind", "effectiveFrom", "termKind"],
  replace: ["kind", "agreementUid", "effectiveFrom", "termKind"],
  renew: ["kind", "agreementUid", "effectiveFrom", "termKind"],
  end: ["kind", "agreementUid", "termUid", "effectiveThrough", "reason"],
  correct: ["kind", "agreementUid", "termUid", "effectiveFrom", "termKind", "reason"],
  "supplement-term": ["kind", "agreementUid", "termUid", "reason"],
  "supplement-missing": ["kind", "agreementUid", "reason"],
  "correct-existing": ["kind", "agreementUid", "reason"],
  "set-primary": ["kind", "agreementUid"],
  "cancel-future": ["kind", "agreementUid", "termUid", "reason"],
} as const satisfies Record<EmploymentAgreementCommandKind, readonly EmploymentAgreementFormField[]>;

export function employmentAgreementFieldRequired(
  kind: EmploymentAgreementCommandKind,
  field: EmploymentAgreementFormField,
): boolean {
  return (EMPLOYMENT_AGREEMENT_REQUIRED_FIELDS[kind] as readonly EmploymentAgreementFormField[]).includes(field);
}

export function employmentAgreementFieldLabel(
  kind: EmploymentAgreementCommandKind,
  field: EmploymentAgreementFormField,
): string {
  if (kind === "end" && field === "effectiveThrough") return "结束日期";
  if ((kind === "create" || kind === "replace") && field === "reason") return "备注";
  if ((kind === "supplement-term" || kind === "supplement-missing") && field === "reason") return "补充说明";
  if ((kind === "correct" || kind === "correct-existing") && field === "reason") return "修正说明";
  return EMPLOYMENT_AGREEMENT_FIELD_LABELS[field];
}

export function employmentAgreementMissingFieldLabel(fieldPath: string): string {
  if (fieldPath.startsWith("content.")) {
    const field = fieldPath.slice("content.".length) as EmploymentAgreementFormField;
    return EMPLOYMENT_AGREEMENT_FIELD_LABELS[field] ?? fieldPath;
  }
  const termMatch = /^terms\.(\d+)\.(effectiveFrom|effectiveThrough)$/.exec(fieldPath);
  if (termMatch) {
    const field = termMatch[2] as "effectiveFrom" | "effectiveThrough";
    return `第 ${termMatch[1]} 期${EMPLOYMENT_AGREEMENT_FIELD_LABELS[field]}`;
  }
  return fieldPath;
}
