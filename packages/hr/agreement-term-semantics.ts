export type AgreementDurationKind = "fixed" | "indefinite";

export interface AgreementTermSemanticRow {
  sequence: number;
  termKind: "initial" | "renewal" | "permanent" | "legacy";
  effectiveFrom: string | null;
  effectiveThrough: string | null;
  recordState: "confirmed" | "cancelled" | "superseded" | "voided" | "unknown";
  temporalState: "current" | "upcoming" | "past" | "invalid";
}

export function agreementTermDurationKind(
  term: Pick<AgreementTermSemanticRow, "termKind">,
): AgreementDurationKind {
  return term.termKind === "permanent" ? "indefinite" : "fixed";
}

export function agreementTermStageKind(
  term: Pick<AgreementTermSemanticRow, "sequence" | "termKind">,
): "initial" | "renewal" {
  if (term.termKind === "initial" || term.termKind === "renewal") return term.termKind;
  return term.sequence === 1 ? "initial" : "renewal";
}

export function agreementTermExpiryLabel(
  term: Pick<AgreementTermSemanticRow, "termKind" | "effectiveThrough">,
): string {
  if (term.termKind === "permanent") return "无固定期限";
  return term.effectiveThrough || "到期日期待补充";
}

export function contractPeriodLabel(
  term: Pick<AgreementTermSemanticRow, "termKind" | "effectiveFrom" | "effectiveThrough">,
): string {
  return `${term.effectiveFrom || "开始日期待补充"} — ${agreementTermExpiryLabel(term)}`;
}

export function isLiveAgreementTerm(
  term: Pick<AgreementTermSemanticRow, "recordState">,
): boolean {
  return term.recordState === "confirmed" || term.recordState === "unknown";
}

export function preferredAgreementTerm<T extends AgreementTermSemanticRow>(
  terms: readonly T[],
): T | null {
  const live = terms.filter(isLiveAgreementTerm);
  const current = latestStarting(live.filter((term) => term.temporalState === "current"));
  if (current) return current;
  const upcoming = earliestStarting(live.filter((term) => term.temporalState === "upcoming"));
  if (upcoming) return upcoming;
  return latestEnding(live.filter((term) => term.temporalState === "past"))
    ?? latestStarting(live)
    ?? null;
}

function latestStarting<T extends AgreementTermSemanticRow>(terms: readonly T[]): T | null {
  return [...terms].sort((left, right) => (
    dateKey(right.effectiveFrom).localeCompare(dateKey(left.effectiveFrom))
    || right.sequence - left.sequence
  ))[0] ?? null;
}

function earliestStarting<T extends AgreementTermSemanticRow>(terms: readonly T[]): T | null {
  return [...terms].sort((left, right) => (
    dateKey(left.effectiveFrom, "9999-12-31").localeCompare(dateKey(right.effectiveFrom, "9999-12-31"))
    || left.sequence - right.sequence
  ))[0] ?? null;
}

function latestEnding<T extends AgreementTermSemanticRow>(terms: readonly T[]): T | null {
  return [...terms].sort((left, right) => (
    dateKey(right.effectiveThrough, right.effectiveFrom ?? "").localeCompare(
      dateKey(left.effectiveThrough, left.effectiveFrom ?? ""),
    )
    || right.sequence - left.sequence
  ))[0] ?? null;
}

function dateKey(value: string | null, fallback = "") {
  return value || fallback;
}
