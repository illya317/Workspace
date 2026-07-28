import type {
  ContractRow,
  EmploymentAgreementRevisionRow,
  EmploymentAgreementTermRow,
} from "@workspace/hr/types";
import {
  agreementTermDurationKind,
  agreementTermExpiryLabel,
  agreementTermStageKind,
  contractPeriodLabel,
  preferredAgreementTerm,
} from "@workspace/hr/agreement-term-semantics";

export { contractPeriodLabel } from "@workspace/hr/agreement-term-semantics";

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
  const stage = agreementTermStageKind(term) === "initial" ? "首期" : "续期";
  const duration = agreementTermDurationKind(term) === "indefinite" ? "无固定期限" : "固定期限";
  return {
    key: term.termUid,
    title: `第 ${term.sequence} 期 · ${stage} · ${duration}`,
    description: term.changeKind === "legacy" ? undefined : term.reason || undefined,
    validFrom: term.effectiveFrom,
    validThrough: term.effectiveThrough,
    temporalState: term.temporalState,
    recordState: term.recordState,
  } as const;
}

export function uniqueContractMissingLabels(fields: ContractRow["missingFields"]): string[] {
  return [...new Set(fields.map((field) => field.label))];
}

type AgreementChoiceRow = Pick<ContractRow, "company" | "contractType" | "expiryDate"> & {
  terms: ReadonlyArray<Pick<EmploymentAgreementTermRow, "sequence" | "recordState" | "termKind" | "effectiveFrom" | "effectiveThrough" | "temporalState">>;
};

export function agreementChoiceLabel(row: AgreementChoiceRow): string {
  const preferred = preferredAgreementTerm(row.terms.filter((term) => term.recordState === "confirmed"));
  const expiry = preferred ? agreementTermExpiryLabel(preferred) : row.expiryDate ?? "未设置";
  const expiryLabel = expiry === "无固定期限" || expiry === "到期日期待补充"
    ? expiry
    : `到期日期 ${expiry}`;
  return [
    row.company || "未设置公司",
    row.contractType || "未设置类型",
    expiryLabel,
  ].filter(Boolean).join(" · ");
}
