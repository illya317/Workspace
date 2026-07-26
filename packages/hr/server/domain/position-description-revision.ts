export function pickPositionDescriptionRevisionAsOf<T extends {
  sequence: number;
  effectiveDate: string | null;
}>(revisions: readonly T[], asOfDate: string) {
  return revisions
    .filter((revision) => revision.effectiveDate === null || revision.effectiveDate <= asOfDate)
    .sort((left, right) => (right.effectiveDate ?? "").localeCompare(left.effectiveDate ?? "") || right.sequence - left.sequence)[0] ?? null;
}

export function nextPositionDescriptionRevision(input: {
  latest: { id: number; sequence: number };
  expectedSequence: number;
  changeKind: "change" | "correction";
}) {
  if (input.latest.sequence !== input.expectedSequence) {
    return { ok: false as const, error: "岗位说明书已产生新修订，请刷新后重试" };
  }
  return {
    ok: true as const,
    sequence: input.latest.sequence + 1,
    supersedesRevisionId: input.changeKind === "correction" ? input.latest.id : null,
  };
}
