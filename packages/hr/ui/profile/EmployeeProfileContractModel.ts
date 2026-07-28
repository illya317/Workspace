import type { EmploymentAgreementCommandKind } from "@workspace/hr/employment-agreement-field-contract";
import {
  agreementTermDurationKind,
  agreementTermStageKind,
  preferredAgreementTerm,
  type AgreementDurationKind,
} from "@workspace/hr/agreement-term-semantics";
import type { ContractRow, EmploymentRow } from "@workspace/hr/types";
import type { EditableRecord } from "./EmployeeProfileUtils";

export type AgreementCommandKind = Exclude<EmploymentAgreementCommandKind, "supplement-missing" | "correct-existing">;

export interface AgreementDraft extends EditableRecord {
  kind: AgreementCommandKind;
  agreementUid: string;
  employmentId: number | null;
  termUid: string;
  effectiveFrom: string;
  effectiveThrough: string | null;
  durationKind: AgreementDurationKind;
  company: string | null;
  legalRelation: string | null;
  contractType: string | null;
  employmentForm: string | null;
  reason: string | null;
}

export interface AgreementHistoryRow {
  key: string;
  recordType: "term" | "revision";
  recordUid: string;
  record: string;
  kind: string;
  validFrom: string;
  validThrough: string;
  state: string;
}

export function initialDraft(employments: EmploymentRow[], agreements: ContractRow[], asOfDate: string): AgreementDraft {
  const agreement = agreements.find((row) => row.isPrimary) ?? agreements[0] ?? null;
  const kind: AgreementCommandKind = agreement?.migrationState === "baseline-incomplete"
    ? "supplement-term"
    : agreements.length > 0 ? "renew" : "create";
  return applyAgreement({
    ...emptyAgreementDraft(employments, asOfDate),
    kind,
  }, agreement);
}

export function emptyAgreementDraft(employments: EmploymentRow[], asOfDate: string): AgreementDraft {
  return {
    kind: "create",
    agreementUid: "",
    employmentId: employments.find((row) => row.temporalState === "current")?.id ?? employments[0]?.id ?? null,
    termUid: "",
    effectiveFrom: asOfDate,
    effectiveThrough: null,
    durationKind: "fixed",
    company: null,
    legalRelation: null,
    contractType: null,
    employmentForm: null,
    reason: null,
  };
}

export function agreementTermsForCommand(selected: ContractRow, kind: AgreementCommandKind) {
  const live = selected.terms.filter((term) => term.recordState === "confirmed" || term.recordState === "unknown");
  if (kind === "supplement-term") return live.filter((term) => agreementTermMissingFields(selected, term).size > 0);
  if (kind === "correct") return live;
  if (kind === "end") return live.filter((term) => term.recordState === "confirmed" && term.temporalState === "current");
  if (kind === "cancel-future") return live.filter((term) => term.recordState === "confirmed" && term.temporalState === "upcoming");
  return [];
}

export function agreementTermMissingFields(selected: ContractRow, term: ContractRow["terms"][number]) {
  const prefix = `terms.${term.storageSequence}.`;
  return new Set(selected.missingFields
    .map((field) => field.path)
    .filter((path) => path.startsWith(prefix))
    .map((path) => path.slice(prefix.length))
    .filter((field): field is "effectiveFrom" | "effectiveThrough" => field === "effectiveFrom" || field === "effectiveThrough"));
}

export function termKindForCommand(
  kind: "create" | "replace" | "renew" | "correct",
  durationKind: AgreementDurationKind,
  term?: ContractRow["terms"][number] | null,
): "initial" | "renewal" | "permanent" {
  if (durationKind === "indefinite") return "permanent";
  if (kind === "create" || kind === "replace") return "initial";
  if (kind === "renew") return "renewal";
  return term ? agreementTermStageKind(term) : "initial";
}

export function applyAgreement(draft: AgreementDraft, agreement: ContractRow | null): AgreementDraft {
  if (!agreement) return draft;
  const kind = draft.kind === "create" || draft.kind === "replace"
    ? agreement.migrationState === "baseline-incomplete" ? "supplement-term" : "renew"
    : draft.kind;
  const eligibleTerms = agreementTermsForCommand(agreement, kind);
  const term = eligibleTerms.length > 0
    ? preferredAgreementTerm(eligibleTerms) ?? eligibleTerms[0] ?? null
    : preferredAgreementTerm(agreement.terms) ?? null;
  const renewing = kind === "renew";
  return {
    ...draft,
    kind,
    agreementUid: agreement.agreementUid || "",
    employmentId: agreement.employmentId,
    termUid: term?.termUid ?? "",
    effectiveFrom: renewing ? draft.effectiveFrom : term?.effectiveFrom ?? "",
    effectiveThrough: renewing ? null : term?.effectiveThrough ?? null,
    durationKind: renewing || !term ? "fixed" : agreementTermDurationKind(term),
    company: agreement.company || null,
    legalRelation: agreement.legalRelation || null,
    contractType: agreement.contractType || null,
    employmentForm: agreement.employmentForm || null,
  };
}

export function applyAgreementTerm(draft: AgreementDraft, term: ContractRow["terms"][number]): AgreementDraft {
  return {
    ...draft,
    termUid: term.termUid,
    effectiveFrom: term.effectiveFrom ?? "",
    effectiveThrough: term.effectiveThrough,
    durationKind: agreementTermDurationKind(term),
  };
}

export function nextAgreementPeriodNo(agreement: ContractRow) {
  return Math.max(0, ...agreement.terms.map((term) => term.sequence)) + 1;
}

export function agreementTermRowChanges(
  term: ContractRow["terms"][number],
  draft: AgreementDraft,
) {
  const changes = new Set<"effectiveFrom" | "effectiveThrough" | "durationKind">();
  if ((term.effectiveFrom ?? "") !== draft.effectiveFrom) changes.add("effectiveFrom");
  if ((term.effectiveThrough ?? null) !== (draft.effectiveThrough ?? null)) changes.add("effectiveThrough");
  if (agreementTermDurationKind(term) !== draft.durationKind) changes.add("durationKind");
  return changes;
}

export function agreementTermRowCommandKind(
  agreement: ContractRow,
  term: ContractRow["terms"][number],
  draft: AgreementDraft,
): "supplement-term" | "correct" {
  const changes = agreementTermRowChanges(term, draft);
  const missing = agreementTermMissingFields(agreement, term);
  return changes.size > 0
    && [...changes].every((field) => field !== "durationKind" && missing.has(field))
      ? "supplement-term"
      : "correct";
}

export function agreementTermRowReady(
  agreement: ContractRow,
  term: ContractRow["terms"][number],
  draft: AgreementDraft,
) {
  if (!draft.reason?.trim() || agreementTermRowChanges(term, draft).size === 0) return false;
  const kind = agreementTermRowCommandKind(agreement, term, draft);
  if (kind === "supplement-term") {
    const missing = agreementTermMissingFields(agreement, term);
    return (
      (missing.has("effectiveFrom") && Boolean(draft.effectiveFrom))
      || (missing.has("effectiveThrough") && Boolean(draft.effectiveThrough))
    );
  }
  return Boolean(
    draft.effectiveFrom
    && (draft.durationKind === "indefinite" || draft.effectiveThrough),
  );
}

export function agreementHistoryRows(row: ContractRow): AgreementHistoryRow[] {
  return [
    ...row.terms.map((term) => ({
      key: `term-${term.termUid}`,
      recordType: "term" as const,
      recordUid: term.termUid,
      record: `第 ${term.sequence} 期 · ${agreementTermDurationKind(term) === "indefinite" ? "无固定期限" : "固定期限"}`,
      kind: "协议期限",
      validFrom: term.effectiveFrom || "待补充",
      validThrough: term.termKind === "permanent" ? "无固定期限" : term.effectiveThrough || "到期日期待补充",
      state: agreementTermMissingBoundary(term)
        ? "资料待补充"
        : termRecordStateLabel(term.recordState, term.temporalState),
    })),
    ...row.revisions.map((revision) => ({
      key: `revision-${revision.revisionUid}`,
      recordType: "revision" as const,
      recordUid: revision.revisionUid,
      record: `${revisionKindLabel(revision.changeKind)} · 版本 ${revision.revisionNo}`,
      kind: "资料版本",
      validFrom: "—",
      validThrough: revision.createdAt || "—",
      state: revision.revisionUid === row.currentRevisionUid ? "当前" : revisionRecordStateLabel(revision.recordState),
    })),
  ];
}

function agreementTermMissingBoundary(term: ContractRow["terms"][number]) {
  return !term.effectiveFrom || (term.termKind !== "permanent" && !term.effectiveThrough);
}

function termRecordStateLabel(
  recordState: ContractRow["terms"][number]["recordState"],
  temporalState: ContractRow["terms"][number]["temporalState"],
) {
  if (recordState === "cancelled") return "已取消";
  if (recordState === "superseded") return "已替代";
  if (recordState === "voided") return "已作废";
  if (recordState === "unknown") return "状态待补充";
  if (temporalState === "current") return "当前";
  if (temporalState === "upcoming") return "待生效";
  return "历史";
}

function revisionKindLabel(kind: ContractRow["revisions"][number]["changeKind"]) {
  if (kind === "baseline-import") return "初始资料";
  if (kind === "supplement") return "补充资料";
  if (kind === "correction") return "资料修正";
  if (kind === "amendment") return "协议修订";
  if (kind === "initial") return "初始资料";
  if (kind === "legacy") return "历史资料";
  return "资料版本";
}

function revisionRecordStateLabel(state: ContractRow["revisions"][number]["recordState"]) {
  if (state === "draft") return "草稿";
  if (state === "cancelled") return "已取消";
  if (state === "superseded") return "已替代";
  if (state === "unknown") return "状态待补充";
  return "历史";
}
