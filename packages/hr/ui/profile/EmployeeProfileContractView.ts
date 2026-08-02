import type {
  ContractRow,
  EmploymentAgreementRevisionRow,
  EmploymentAgreementTermRow,
} from "@workspace/hr/types";

export function agreementRevisionItem(
  row: ContractRow,
  revision: EmploymentAgreementRevisionRow,
  terms: EmploymentAgreementTermRow[],
) {
  return {
    key: revision.revisionUid,
    title: `${agreementRevisionKindLabel(revision.changeKind)} · 版本 ${revision.revisionNo}`,
    description: [revision.content.contractType, revision.content.legalRelation, revision.content.employmentForm].filter(Boolean).join(" · ") || "未填写条款分类",
    meta: terms.length > 0 ? terms.map(contractPeriodLabel).join("；") : revision.createdAt || undefined,
    temporalState: row.temporalState,
    recordState: revision.recordState,
  } as const;
}

function agreementRevisionKindLabel(kind: EmploymentAgreementRevisionRow["changeKind"]): string {
  if (kind === "baseline-import") return "历史基准";
  if (kind === "supplement") return "补充缺失资料";
  if (kind === "correction") return "修正已登记资料";
  if (kind === "amendment") return "协议修订";
  if (kind === "legacy") return "历史资料";
  return kind === "initial" ? "初始资料" : "资料版本";
}

export function agreementTermItem(term: EmploymentAgreementTermRow) {
  return {
    key: term.termUid,
    title: `${term.termKind === "initial" ? "首签" : term.termKind === "renewal" ? "续签" : term.termKind === "permanent" ? "无固定期限" : "旧期限"} · 第 ${term.sequence} 期`,
    description: term.changeKind === "legacy" ? undefined : term.reason || undefined,
    validFrom: term.effectiveFrom,
    validThrough: term.effectiveThrough,
    temporalState: term.temporalState,
    recordState: term.recordState,
  } as const;
}

export function contractPeriodLabel(term: EmploymentAgreementTermRow) {
  return `${term.effectiveFrom || "开始日期待补"} — ${term.effectiveThrough || "长期"}`;
}

export function uniqueContractMissingLabels(fields: ContractRow["missingFields"]): string[] {
  return [...new Set(fields.map((field) => field.label))];
}

type AgreementChoiceRow = Pick<ContractRow, "company" | "contractType" | "expiryDate"> & {
  terms: ReadonlyArray<Pick<EmploymentAgreementTermRow, "recordState" | "termKind" | "effectiveThrough">>;
};

export function agreementChoiceLabel(row: AgreementChoiceRow): string {
  const confirmedTerms = row.terms.filter((term) => term.recordState === "confirmed");
  const latestConfirmedTerm = confirmedTerms.at(-1);
  const expiry = latestConfirmedTerm?.termKind === "permanent" && !latestConfirmedTerm.effectiveThrough
    ? "无固定期限"
    : row.expiryDate ?? "未设置";
  return [
    row.company || "未设置公司",
    row.contractType || "未设置类型",
    `到期日期 ${expiry}`,
  ].filter(Boolean).join(" · ");
}
