import {
  classifyBusinessDateWindow,
  requireBusinessDate,
  shiftBusinessDate,
  type BusinessDate,
  type BusinessTemporalPosition,
  type BusinessTemporalRecordState,
} from "./business-temporal";

export type PartyLegalFactCommandKind = "establish" | "change" | "correction" | "cancel-future";

export interface PartyLegalFactSnapshot {
  subjectType: "organization" | "individual";
  name: string;
  fullName: string | null;
  identityNumber: string;
  legalRepresentative: string | null;
  registeredCapital: string | null;
  registeredAddress: string | null;
  registeredDate: string | null;
}

export interface PartyLegalFactRevisionLike extends PartyLegalFactSnapshot {
  id: number;
  revision: number;
  commandKind: PartyLegalFactCommandKind;
  effectiveOn: string;
  recordState: "confirmed" | "cancelled";
  supersedesId: number | null;
  idempotencyKey: string;
  reason: string | null;
  sourceType?: string | null;
  sourceLabel?: string | null;
  sourceReference?: string | null;
  sourceRegistryChangeId?: number | null;
  recordedBy?: number | null;
  recordedAt: string;
}

export interface PartyLegalFactTimelineItem extends PartyLegalFactRevisionLike {
  validToExclusive: string | null;
  validThrough: string | null;
  temporalState: BusinessTemporalPosition;
  displayRecordState: BusinessTemporalRecordState;
}

export type PartyLegalFactLifecycleCommand =
  | { kind: "change"; effectiveOn: string; snapshot: PartyLegalFactSnapshot; reason?: string | null }
  | { kind: "correction"; supersedesId: number; snapshot: PartyLegalFactSnapshot; reason: string }
  | { kind: "cancel-future"; supersedesId: number; reason: string };

export interface PlanPartyLegalFactCommandInput {
  timeline: readonly PartyLegalFactRevisionLike[];
  command: PartyLegalFactLifecycleCommand;
  asOf: string;
  expectedRevision: number;
  idempotencyKey: string;
}

export type PartyLegalFactAppendPlan =
  | { kind: "idempotent"; existing: PartyLegalFactRevisionLike }
  | {
      kind: "append";
      revision: number;
      commandKind: PartyLegalFactCommandKind;
      effectiveOn: BusinessDate;
      recordState: "confirmed" | "cancelled";
      supersedesId: number | null;
      snapshot: PartyLegalFactSnapshot;
      reason: string | null;
      idempotencyKey: string;
    };

export class PartyLegalFactLifecycleError extends Error {}

export function normalizePartyLegalFactSnapshot(snapshot: PartyLegalFactSnapshot): PartyLegalFactSnapshot {
  const name = snapshot.name.trim();
  const identityNumber = snapshot.identityNumber.trim().toUpperCase();
  if (!name) throw new PartyLegalFactLifecycleError("法定名称不能为空");
  if (!identityNumber) throw new PartyLegalFactLifecycleError("统一代码或证件号码不能为空");
  return {
    subjectType: snapshot.subjectType,
    name,
    fullName: nullableText(snapshot.fullName),
    identityNumber,
    legalRepresentative: nullableText(snapshot.legalRepresentative),
    registeredCapital: nullableText(snapshot.registeredCapital),
    registeredAddress: nullableText(snapshot.registeredAddress),
    registeredDate: nullableText(snapshot.registeredDate),
  };
}

export function resolvePartyLegalFactAsOf(
  timeline: readonly PartyLegalFactRevisionLike[],
  asOf: string,
): PartyLegalFactRevisionLike | null {
  const businessDate = requireBusinessDate(asOf);
  const superseded = supersededRevisionIds(timeline);
  return [...timeline]
    .filter((item) => item.recordState === "confirmed" && !superseded.has(item.id) && item.effectiveOn <= businessDate)
    .sort(compareEffectiveThenRevision)
    .at(-1) ?? null;
}

export function buildPartyLegalFactTimeline(
  timeline: readonly PartyLegalFactRevisionLike[],
  asOf: string,
): PartyLegalFactTimelineItem[] {
  const businessDate = requireBusinessDate(asOf);
  const superseded = supersededRevisionIds(timeline);
  const authoritative = timeline
    .filter((item) => item.recordState === "confirmed" && !superseded.has(item.id))
    .sort(compareEffectiveThenRevision);
  const nextEffectiveById = new Map<number, string | null>();
  authoritative.forEach((item, index) => {
    nextEffectiveById.set(item.id, authoritative[index + 1]?.effectiveOn ?? null);
  });
  return [...timeline]
    .sort((left, right) => right.revision - left.revision)
    .map((item) => {
      const validToExclusive = nextEffectiveById.get(item.id) ?? null;
      const displayRecordState: BusinessTemporalRecordState = item.recordState === "cancelled"
        ? "cancelled"
        : superseded.has(item.id)
          ? "superseded"
          : "confirmed";
      return {
        ...item,
        validToExclusive,
        validThrough: validToExclusive ? shiftBusinessDate(validToExclusive, -1) : null,
        temporalState: classifyBusinessDateWindow({ validFrom: item.effectiveOn, validToExclusive }, businessDate),
        displayRecordState,
      };
    });
}

export function planPartyLegalFactCommand(input: PlanPartyLegalFactCommandInput): PartyLegalFactAppendPlan {
  const asOf = requireBusinessDate(input.asOf);
  const idempotencyKey = input.idempotencyKey.trim();
  if (!idempotencyKey) throw new PartyLegalFactLifecycleError("幂等键不能为空");
  const duplicate = input.timeline.find((item) => item.idempotencyKey === idempotencyKey);
  if (duplicate) return { kind: "idempotent", existing: duplicate };
  const latestRevision = Math.max(0, ...input.timeline.map((item) => item.revision));
  if (input.expectedRevision !== latestRevision) {
    throw new PartyLegalFactLifecycleError("法定事实版本已变化，请刷新后重试");
  }
  const revision = latestRevision + 1;

  if (input.command.kind === "change") {
    return {
      kind: "append",
      revision,
      commandKind: "change",
      effectiveOn: requireBusinessDate(input.command.effectiveOn, "生效日期"),
      recordState: "confirmed",
      supersedesId: null,
      snapshot: normalizePartyLegalFactSnapshot(input.command.snapshot),
      reason: nullableText(input.command.reason),
      idempotencyKey,
    };
  }

  const target = input.timeline.find((item) => item.id === input.command.supersedesId);
  if (!target) throw new PartyLegalFactLifecycleError("被替代的法定事实版本不存在");
  if (supersededRevisionIds(input.timeline).has(target.id)) {
    throw new PartyLegalFactLifecycleError("该法定事实版本已经被替代或取消");
  }
  const reason = input.command.reason.trim();
  if (!reason) throw new PartyLegalFactLifecycleError("更正或取消原因不能为空");
  if (input.command.kind === "cancel-future") {
    if (target.effectiveOn <= asOf) throw new PartyLegalFactLifecycleError("只能取消尚未生效的法定事实版本");
    return {
      kind: "append",
      revision,
      commandKind: "cancel-future",
      effectiveOn: requireBusinessDate(target.effectiveOn),
      recordState: "cancelled",
      supersedesId: target.id,
      snapshot: partyLegalFactSnapshotOf(target),
      reason,
      idempotencyKey,
    };
  }
  return {
    kind: "append",
    revision,
    commandKind: "correction",
    effectiveOn: requireBusinessDate(target.effectiveOn),
    recordState: "confirmed",
    supersedesId: target.id,
    snapshot: normalizePartyLegalFactSnapshot(input.command.snapshot),
    reason,
    idempotencyKey,
  };
}

export function partyLegalFactSnapshotOf(value: PartyLegalFactSnapshot): PartyLegalFactSnapshot {
  return normalizePartyLegalFactSnapshot(value);
}

function nullableText(value: string | null | undefined) {
  return value?.trim() || null;
}

function supersededRevisionIds(timeline: readonly PartyLegalFactRevisionLike[]) {
  const superseded = new Set(timeline.flatMap((item) => item.supersedesId ? [item.supersedesId] : []));
  const latestByEffectiveDate = new Map<string, PartyLegalFactRevisionLike>();
  for (const item of timeline.filter((entry) => entry.recordState === "confirmed" && !superseded.has(entry.id))) {
    const latest = latestByEffectiveDate.get(item.effectiveOn);
    if (!latest || latest.revision < item.revision) latestByEffectiveDate.set(item.effectiveOn, item);
  }
  for (const item of timeline) {
    const latest = latestByEffectiveDate.get(item.effectiveOn);
    if (item.recordState === "confirmed" && latest && latest.id !== item.id) superseded.add(item.id);
  }
  return superseded;
}

function compareEffectiveThenRevision(left: PartyLegalFactRevisionLike, right: PartyLegalFactRevisionLike) {
  return left.effectiveOn.localeCompare(right.effectiveOn) || left.revision - right.revision;
}
