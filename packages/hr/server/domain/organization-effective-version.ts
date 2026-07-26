import {
  businessDateWindowContains,
  businessDateWindowsOverlap,
  classifyBusinessDateWindow,
  requireBusinessDate,
  type BusinessTemporalPosition,
} from "@workspace/platform/contracts/business-temporal";

export type OrganizationChangeKind = "schedule" | "correct" | "end-date" | "cancel-future";
export type OrganizationVersionRecordState = "confirmed" | "cancelled" | "unknown";

export type OrganizationEffectiveVersion<TPayload> = {
  id: number;
  sequence: number;
  validFrom: string | null;
  validToExclusive: string | null;
  recordState: OrganizationVersionRecordState | string;
  supersedesId: number | null;
  payload: TPayload;
};

export type OrganizationEffectiveVersionDraft<TPayload> = {
  validFrom: string | null;
  validToExclusive: string | null;
  recordState: OrganizationVersionRecordState;
  changeKind: OrganizationChangeKind;
  supersedesId: number | null;
  payload: TPayload;
};

export type OrganizationEffectiveChange<TPayload> = {
  kind: OrganizationChangeKind;
  effectiveOn: string;
  asOf: string;
  reason?: string | null;
  targetVersionId?: number | null;
  payload?: TPayload;
};

export type OrganizationLifecycleMeta = {
  kind: OrganizationChangeKind;
  effectiveOn: string;
  expectedSequence: number;
  idempotencyKey: string;
  reason: string | null;
  targetVersionId: number | null;
};

export function parseOrganizationLifecycleMeta(input: unknown): OrganizationLifecycleMeta {
  const raw = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const kind = String(raw.kind ?? "");
  if (!(["schedule", "correct", "end-date", "cancel-future"] as const).includes(kind as OrganizationChangeKind)) {
    throw new Error("组织结构变更命令无效");
  }
  const effectiveOn = requireBusinessDate(raw.effectiveOn, "生效日");
  const expectedSequence = Number(raw.expectedSequence);
  if (!Number.isInteger(expectedSequence) || expectedSequence < 0) throw new Error("缺少有效的 expected sequence");
  const idempotencyKey = typeof raw.idempotencyKey === "string" ? raw.idempotencyKey.trim() : "";
  if (!idempotencyKey || idempotencyKey.length > 200) throw new Error("缺少有效的幂等键");
  const reason = typeof raw.reason === "string" ? raw.reason.trim() || null : null;
  if ((kind === "correct" || kind === "end-date" || kind === "cancel-future") && !reason) {
    throw new Error(`${kind === "correct" ? "纠错" : kind === "end-date" ? "终止" : "取消未来变化"}必须填写原因`);
  }
  const target = raw.targetVersionId === null || raw.targetVersionId === undefined || raw.targetVersionId === ""
    ? null
    : Number(raw.targetVersionId);
  if (target !== null && (!Number.isInteger(target) || target <= 0)) throw new Error("目标版本无效");
  return {
    kind: kind as OrganizationChangeKind,
    effectiveOn,
    expectedSequence,
    idempotencyKey,
    reason,
    targetVersionId: target,
  };
}

export type OrganizationEffectiveChangePlan<TPayload> = {
  targetVersionId: number | null;
  drafts: OrganizationEffectiveVersionDraft<TPayload>[];
  liveBefore: OrganizationEffectiveVersion<TPayload>[];
  liveAfter: Array<Pick<OrganizationEffectiveVersionDraft<TPayload>, "validFrom" | "validToExclusive" | "recordState" | "payload">>;
};

export function liveOrganizationVersions<TPayload>(rows: readonly OrganizationEffectiveVersion<TPayload>[]) {
  const supersededIds = new Set(rows.map((row) => row.supersedesId).filter((id): id is number => id !== null));
  return rows
    .filter((row) => !supersededIds.has(row.id) && (row.recordState === "confirmed" || row.recordState === "unknown"))
    .sort(compareEffectiveVersions);
}

export function organizationVersionAt<TPayload>(
  rows: readonly OrganizationEffectiveVersion<TPayload>[],
  asOf: string,
) {
  const date = requireBusinessDate(asOf, "基准日");
  const matches = liveOrganizationVersions(rows).filter((row) => businessDateWindowContains(row, date));
  if (matches.length > 1) throw new Error("组织结构存在重叠的有效版本");
  return matches[0] ?? null;
}

export function classifyOrganizationVersion<TPayload>(
  row: OrganizationEffectiveVersion<TPayload>,
  asOf: string,
): BusinessTemporalPosition {
  return classifyBusinessDateWindow(row, requireBusinessDate(asOf, "基准日"));
}

export function planOrganizationEffectiveChange<TPayload>(
  rows: readonly OrganizationEffectiveVersion<TPayload>[],
  change: OrganizationEffectiveChange<TPayload>,
): OrganizationEffectiveChangePlan<TPayload> {
  const effectiveOn = requireBusinessDate(change.effectiveOn, "生效日");
  const asOf = requireBusinessDate(change.asOf, "业务日");
  const liveBefore = liveOrganizationVersions(rows);
  assertNoLiveOverlap(liveBefore);

  if ((change.kind === "correct" || change.kind === "cancel-future") && !change.targetVersionId) {
    throw new Error(`${change.kind === "correct" ? "纠错" : "取消未来变化"}必须指定目标版本`);
  }
  if (change.kind === "correct" && !change.reason?.trim()) throw new Error("历史纠错必须填写原因");
  if (change.kind !== "end-date" && change.kind !== "cancel-future" && change.payload === undefined) {
    throw new Error("组织结构变化缺少目标状态");
  }

  const explicitTarget = change.targetVersionId
    ? liveBefore.find((row) => row.id === change.targetVersionId) ?? null
    : null;
  if (change.targetVersionId && !explicitTarget) throw new Error("目标版本不存在或已被替代");

  if (change.kind === "cancel-future") {
    if (!explicitTarget?.validFrom || explicitTarget.validFrom <= asOf) throw new Error("只能取消尚未生效的未来版本");
    const draft = cancellationDraft(explicitTarget, change.kind);
    return finalizePlan(liveBefore, explicitTarget, [draft]);
  }

  if (change.kind === "correct") {
    const target = explicitTarget!;
    const draft: OrganizationEffectiveVersionDraft<TPayload> = {
      validFrom: target.validFrom,
      validToExclusive: target.validToExclusive,
      recordState: "confirmed",
      changeKind: change.kind,
      supersedesId: target.id,
      payload: change.payload!,
    };
    return finalizePlan(liveBefore, target, [draft]);
  }

  const target = liveBefore.find((row) => businessDateWindowContains(row, effectiveOn)) ?? null;
  if (change.kind === "end-date") {
    if (!target) throw new Error("终止日没有有效的组织结构版本");
    const drafts: OrganizationEffectiveVersionDraft<TPayload>[] = [];
    if (!target.validFrom || target.validFrom < effectiveOn) {
      drafts.push({
        validFrom: target.validFrom,
        validToExclusive: effectiveOn,
        recordState: target.recordState === "unknown" ? "unknown" : "confirmed",
        changeKind: change.kind,
        supersedesId: target.id,
        payload: target.payload,
      });
    }
    drafts.push(cancellationDraft(target, change.kind, effectiveOn));
    return finalizePlan(liveBefore, target, drafts);
  }

  if (target?.validFrom === effectiveOn) {
    throw new Error("同一生效日已存在版本；请使用纠错命令并填写原因");
  }
  const drafts: OrganizationEffectiveVersionDraft<TPayload>[] = [];
  if (target) {
    drafts.push({
      validFrom: target.validFrom,
      validToExclusive: effectiveOn,
      recordState: target.recordState === "unknown" ? "unknown" : "confirmed",
      changeKind: change.kind,
      supersedesId: target.id,
      payload: target.payload,
    });
    drafts.push({
      validFrom: effectiveOn,
      validToExclusive: target.validToExclusive,
      recordState: "confirmed",
      changeKind: change.kind,
      supersedesId: target.id,
      payload: change.payload!,
    });
  } else {
    const next = liveBefore.find((row) => row.validFrom && row.validFrom > effectiveOn) ?? null;
    drafts.push({
      validFrom: effectiveOn,
      validToExclusive: next?.validFrom ?? null,
      recordState: "confirmed",
      changeKind: change.kind,
      supersedesId: null,
      payload: change.payload!,
    });
  }
  return finalizePlan(liveBefore, target, drafts);
}

function cancellationDraft<TPayload>(
  target: OrganizationEffectiveVersion<TPayload>,
  changeKind: "cancel-future" | "end-date",
  validFrom = target.validFrom,
): OrganizationEffectiveVersionDraft<TPayload> {
  return {
    validFrom,
    validToExclusive: target.validToExclusive,
    recordState: "cancelled",
    changeKind,
    supersedesId: target.id,
    payload: target.payload,
  };
}

function finalizePlan<TPayload>(
  liveBefore: OrganizationEffectiveVersion<TPayload>[],
  target: OrganizationEffectiveVersion<TPayload> | null,
  drafts: OrganizationEffectiveVersionDraft<TPayload>[],
): OrganizationEffectiveChangePlan<TPayload> {
  const liveAfter = [
    ...liveBefore.filter((row) => row.id !== target?.id).map((row) => ({
      validFrom: row.validFrom,
      validToExclusive: row.validToExclusive,
      recordState: row.recordState === "unknown" ? "unknown" as const : "confirmed" as const,
      payload: row.payload,
    })),
    ...drafts.filter((draft) => draft.recordState !== "cancelled").map((draft) => ({
      validFrom: draft.validFrom,
      validToExclusive: draft.validToExclusive,
      recordState: draft.recordState,
      payload: draft.payload,
    })),
  ].sort(compareEffectiveVersions);
  assertNoLiveOverlap(liveAfter);
  return { targetVersionId: target?.id ?? null, drafts, liveBefore, liveAfter };
}

function assertNoLiveOverlap(rows: ReadonlyArray<{ validFrom: string | null; validToExclusive: string | null }>) {
  for (let leftIndex = 0; leftIndex < rows.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < rows.length; rightIndex += 1) {
      if (businessDateWindowsOverlap(rows[leftIndex]!, rows[rightIndex]!)) {
        throw new Error("组织结构有效版本不能重叠");
      }
    }
  }
}

function compareEffectiveVersions(
  left: { validFrom: string | null; sequence?: number },
  right: { validFrom: string | null; sequence?: number },
) {
  const from = (left.validFrom ?? "0001-01-01").localeCompare(right.validFrom ?? "0001-01-01");
  return from || (left.sequence ?? 0) - (right.sequence ?? 0);
}
