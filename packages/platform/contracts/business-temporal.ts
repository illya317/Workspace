import type { BusinessTemporalBaselinePolicy } from "./business-temporal-baseline";
import {
  businessTemporalUiPolicyError,
  type BusinessTemporalUiPolicy,
} from "./business-temporal-ui";

export type { BusinessTemporalUiPolicy } from "./business-temporal-ui";

export const BUSINESS_TEMPORAL_STORAGE_KINDS = [
  "current",
  "date-enabled",
  "effective-version",
  "revision",
  "event-projection",
] as const;
export type BusinessTemporalStorageKind = typeof BUSINESS_TEMPORAL_STORAGE_KINDS[number];
export const BUSINESS_TEMPORAL_VIEW_KINDS = [
  "current-audit",
  "availability",
  "effective-period",
  "revision",
  "event-ledger",
] as const;
export type BusinessTemporalViewKind = typeof BUSINESS_TEMPORAL_VIEW_KINDS[number];
export type BusinessTemporalMaturity = "implemented" | "partial" | "planned";
export type BusinessTemporalPosition = "past" | "current" | "upcoming" | "invalid";
export const BUSINESS_TEMPORAL_COMMAND_KINDS = [
  "change",
  "schedule",
  "correct",
  "end-date",
  "cancel-future",
  "publish",
  "supersede",
  "append-event",
  "reverse",
  "purge-draft",
] as const;
export type BusinessTemporalCommandKind = typeof BUSINESS_TEMPORAL_COMMAND_KINDS[number];
export type BusinessTemporalRecordState =
  | "draft"
  | "pending"
  | "confirmed"
  | "cancelled"
  | "superseded"
  | "reversed"
  | "voided"
  | "unknown";
export type BusinessTemporalErrorCode =
  | "TEMPORAL_INVALID_DATE"
  | "TEMPORAL_INVALID_PERIOD"
  | "TEMPORAL_INVALID_POLICY"
  | "TEMPORAL_DUPLICATE_POLICY"
  | "TEMPORAL_POLICY_NOT_FOUND";
declare const businessDateBrand: unique symbol;
/** A tenant business calendar date, never an instant or browser-local timestamp. */
export type BusinessDate = string & { readonly [businessDateBrand]: "BusinessDate" };
/** Latest date that can be stored as an inclusive end and still convert to an exclusive end. */
export const LATEST_INCLUSIVE_BUSINESS_DATE = "9999-12-30" as BusinessDate;

export interface InclusiveBusinessPeriod {
  validFrom?: string | null;
  validThrough?: string | null;
}

/** Canonical calculation window. The lower bound is inclusive and the upper bound is exclusive. */
export interface BusinessDateWindow {
  validFrom?: string | null;
  validToExclusive?: string | null;
}

export interface BusinessTemporalPolicy {
  storage: BusinessTemporalStorageKind;
  granularity: "date" | "instant";
  futureChanges: "allow" | "forbid";
  /** Whether a command may be recorded with an effective date before the current business date. Defaults to allow. */
  retrospectiveChanges?: "allow" | "forbid";
  sameDayChanges: "single" | "sequenced";
  overlaps: "allow" | "forbid" | "by-slot";
  gaps: "allow" | "forbid";
  /** How an already-recorded temporal fact is revised. `forbid` removes the revise capability entirely. */
  revision: "forbid" | "audited-overwrite" | "supersede" | "reverse";
  deletion: "draft-only" | "cancel-future" | "end-date" | "never";
}

export function businessTemporalRetrospectiveChanges(
  policy: BusinessTemporalPolicy,
): "allow" | "forbid" {
  return policy.retrospectiveChanges ?? "allow";
}

export interface BusinessTemporalProjectionPolicy {
  eventSource: string;
  projection: string;
  sourceEventField: string;
  generationField: string;
  runModel: string;
  projectorKey: string;
  projectorVersion: number;
  rebuildAdapterKey: string;
}

export interface BusinessTemporalImplementationPolicy {
  adapterKey: string;
  modulePath: string;
}

export type BusinessTemporalSourceRole =
  | "anchor"
  | "period"
  | "revision"
  | "event"
  | "projection"
  | "audit"
  | "evidence"
  | "legacy-source";

export type BusinessTemporalSource =
  | {
      kind: "model";
      model: string;
      fields: readonly string[];
      role: Exclude<BusinessTemporalSourceRole, "legacy-source">;
    }
  | {
      kind: "json-field";
      model: string;
      field: string;
      role: "legacy-source";
    };

export interface BusinessTemporalRecordPolicy {
  authority: readonly BusinessTemporalSource[];
  supplementary?: readonly BusinessTemporalSource[];
}

export interface BusinessTemporalRegistration {
  key: string;
  ownerModuleKey: string;
  resourceKey: string;
  aggregate: string;
  maturity: BusinessTemporalMaturity;
  policy: BusinessTemporalPolicy;
  commands: readonly BusinessTemporalCommandKind[];
  ui: BusinessTemporalUiPolicy;
  records: BusinessTemporalRecordPolicy;
  baseline?: BusinessTemporalBaselinePolicy;
  projection?: BusinessTemporalProjectionPolicy;
  implementation?: BusinessTemporalImplementationPolicy;
  notes?: string;
}

export interface BusinessTemporalCatalog {
  get(key: string): BusinessTemporalRegistration | null;
  require(key: string): BusinessTemporalRegistration;
  keys(): string[];
  definitions(): BusinessTemporalRegistration[];
}

export interface BusinessTemporalExecutionMeta {
  effectiveOn?: BusinessDate;
  expectedRevision?: string | number;
  idempotencyKey?: string;
  reason?: string | null;
}

export interface BusinessTemporalPreviewRequest<TSubject, TCommand> {
  mode: "preview";
  subject: TSubject;
  command: TCommand;
  meta: Omit<BusinessTemporalExecutionMeta, "idempotencyKey"> & { idempotencyKey?: never };
}

export interface BusinessTemporalCommitRequest<TSubject, TCommand> {
  mode: "commit";
  subject: TSubject;
  command: TCommand;
  meta: BusinessTemporalExecutionMeta & {
    expectedRevision: string | number | null;
    idempotencyKey: string;
  };
}

export type BusinessTemporalExecutionRequest<TSubject, TCommand> =
  | BusinessTemporalPreviewRequest<TSubject, TCommand>
  | BusinessTemporalCommitRequest<TSubject, TCommand>;

export interface BusinessTemporalStateQuery {
  asOf: BusinessDate;
  /** Optional transaction-time cutoff for the few domains that require bitemporal reconstruction. */
  knownAt?: string;
}

export interface BusinessTemporalTimelineQuery {
  from?: BusinessDate;
  toExclusive?: BusinessDate;
}

export interface BusinessTemporalProjectionProvenance {
  projectorKey: string;
  projectorVersion: number;
  sourceEventIds: readonly (string | number)[];
  generation: string | number;
  sourceCursor: string;
  sourceDigest: string;
  projectedAt: string;
}

export interface BusinessTemporalStateResult<TState> {
  registrationKey: string;
  asOf: BusinessDate;
  knownAt?: string;
  state: TState | null;
  projection?: BusinessTemporalProjectionProvenance;
}

export interface BusinessTemporalTimelineResult<TTimelineItem> {
  registrationKey: string;
  from?: BusinessDate;
  toExclusive?: BusinessDate;
  items: readonly TTimelineItem[];
}

/**
 * Domain adapters expose this small Interface. Platform owns calendar semantics;
 * each domain still owns validation, transactions, persistence and typed payloads.
 */
export interface BusinessTemporalAdapter<
  TSubject,
  TCommand,
  TState,
  TTimelineItem,
  TPreview,
  TResult,
> {
  execute(
    request: BusinessTemporalPreviewRequest<TSubject, TCommand>,
  ): Promise<{ mode: "preview"; preview: TPreview }>;
  execute(
    request: BusinessTemporalCommitRequest<TSubject, TCommand>,
  ): Promise<{ mode: "commit"; result: TResult }>;
  getState(subject: TSubject, query: BusinessTemporalStateQuery): Promise<BusinessTemporalStateResult<TState>>;
  getTimeline(
    subject: TSubject,
    query: BusinessTemporalTimelineQuery,
  ): Promise<BusinessTemporalTimelineResult<TTimelineItem>>;
}

export interface BusinessTemporalModule<
  TSubject,
  TCommand,
  TState,
  TTimelineItem,
  TPreview,
  TResult,
> {
  registration: BusinessTemporalRegistration;
  adapter: BusinessTemporalAdapter<TSubject, TCommand, TState, TTimelineItem, TPreview, TResult>;
}

export class BusinessTemporalContractError extends Error {
  constructor(
    readonly code: BusinessTemporalErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BusinessTemporalContractError";
  }
}

export function defineBusinessTemporalRegistration<const TRegistration extends BusinessTemporalRegistration>(
  registration: TRegistration,
) {
  assertBusinessTemporalRegistration(registration);
  return Object.freeze(registration);
}

export function createBusinessTemporalCatalog(
  definitions: readonly BusinessTemporalRegistration[],
): BusinessTemporalCatalog {
  const byKey = new Map<string, BusinessTemporalRegistration>();
  for (const definition of definitions) {
    if (byKey.has(definition.key)) {
      throw new BusinessTemporalContractError(
        "TEMPORAL_DUPLICATE_POLICY",
        `重复注册 Business Temporal policy: ${definition.key}`,
      );
    }
    byKey.set(definition.key, definition);
  }
  return {
    get: (key) => byKey.get(key) ?? null,
    require(key) {
      const definition = byKey.get(key);
      if (!definition) {
        throw new BusinessTemporalContractError(
          "TEMPORAL_POLICY_NOT_FOUND",
          `未注册 Business Temporal policy: ${key}`,
        );
      }
      return definition;
    },
    keys: () => [...byKey.keys()].sort(),
    definitions: () => [...byKey.values()].sort((left, right) => left.key.localeCompare(right.key)),
  };
}

export function defineBusinessTemporalModule<
  TSubject,
  TCommand,
  TState,
  TTimelineItem,
  TPreview,
  TResult,
>(
  registration: BusinessTemporalRegistration,
  adapter: BusinessTemporalAdapter<TSubject, TCommand, TState, TTimelineItem, TPreview, TResult>,
): BusinessTemporalModule<TSubject, TCommand, TState, TTimelineItem, TPreview, TResult> {
  assertBusinessTemporalRegistration(registration);
  if (
    typeof adapter.execute !== "function"
    || typeof adapter.getState !== "function"
    || typeof adapter.getTimeline !== "function"
  ) {
    invalidTemporalPolicy(registration.key, "runtime adapter 必须实现 execute、getState 和 getTimeline");
  }
  return Object.freeze({ registration, adapter });
}

export function parseBusinessDate(value: unknown): BusinessDate | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  if (normalized.startsWith("0000-")) return null;
  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) return null;
  return normalized as BusinessDate;
}

export function requireBusinessDate(value: unknown, label = "业务日期") {
  const parsed = parseBusinessDate(value);
  if (parsed) return parsed;
  throw new BusinessTemporalContractError(
    "TEMPORAL_INVALID_DATE",
    `${label}必须是有效的 YYYY-MM-DD 日期`,
  );
}

export function shiftBusinessDate(value: string, days: number): BusinessDate {
  const date = requireBusinessDate(value);
  if (!Number.isInteger(days)) {
    throw new BusinessTemporalContractError("TEMPORAL_INVALID_DATE", "日期偏移必须是整数天");
  }
  const shifted = new Date(`${date}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return requireBusinessDate(shifted.toISOString().slice(0, 10), "偏移后的业务日期");
}

export function inclusiveThroughToExclusive(value: string): BusinessDate {
  return shiftBusinessDate(value, 1);
}

export function exclusiveEndToInclusiveThrough(value: string): BusinessDate {
  return shiftBusinessDate(value, -1);
}

export function inclusiveBusinessPeriodToWindow(
  period: InclusiveBusinessPeriod,
): BusinessDateWindow | null {
  const validFrom = optionalBusinessDate(period.validFrom);
  const validThrough = optionalBusinessDate(period.validThrough);
  if (validFrom === "invalid" || validThrough === "invalid") return null;
  if (validFrom && validThrough && validFrom > validThrough) return null;
  try {
    return {
      validFrom,
      validToExclusive: validThrough ? inclusiveThroughToExclusive(validThrough) : null,
    };
  } catch (error) {
    if (error instanceof BusinessTemporalContractError) return null;
    throw error;
  }
}

export function classifyBusinessDateWindow(
  window: BusinessDateWindow,
  asOf: string,
): BusinessTemporalPosition {
  const date = parseBusinessDate(asOf);
  if (!date) return "invalid";
  const validFrom = optionalBusinessDate(window.validFrom);
  const validToExclusive = optionalBusinessDate(window.validToExclusive);
  if (validFrom === "invalid" || validToExclusive === "invalid") return "invalid";
  if (validFrom && validToExclusive && validFrom >= validToExclusive) return "invalid";
  if (validFrom && validFrom > date) return "upcoming";
  if (validToExclusive && validToExclusive <= date) return "past";
  return "current";
}

export function businessDateWindowContains(window: BusinessDateWindow, date: string) {
  return classifyBusinessDateWindow(window, date) === "current";
}

export function businessDateWindowsOverlap(
  left: BusinessDateWindow,
  right: BusinessDateWindow,
) {
  const leftFrom = optionalBusinessDate(left.validFrom);
  const leftTo = optionalBusinessDate(left.validToExclusive);
  const rightFrom = optionalBusinessDate(right.validFrom);
  const rightTo = optionalBusinessDate(right.validToExclusive);
  if (
    leftFrom === "invalid"
    || leftTo === "invalid"
    || rightFrom === "invalid"
    || rightTo === "invalid"
    || (leftFrom && leftTo && leftFrom >= leftTo)
    || (rightFrom && rightTo && rightFrom >= rightTo)
  ) {
    throw new BusinessTemporalContractError(
      "TEMPORAL_INVALID_PERIOD",
      "有效期间必须使用合法日期，且开始日期必须早于排他结束日期",
    );
  }
  return (!leftTo || !rightFrom || leftTo > rightFrom)
    && (!rightTo || !leftFrom || rightTo > leftFrom);
}

export function classifyInclusiveBusinessPeriod(
  period: InclusiveBusinessPeriod,
  asOf: string,
): BusinessTemporalPosition {
  const window = inclusiveBusinessPeriodToWindow(period);
  return window ? classifyBusinessDateWindow(window, asOf) : "invalid";
}

export function inclusiveBusinessPeriodContains(
  period: InclusiveBusinessPeriod,
  date: string,
) {
  return classifyInclusiveBusinessPeriod(period, date) === "current";
}

export function businessTemporalViewKind(
  storage: BusinessTemporalStorageKind,
): BusinessTemporalViewKind {
  if (storage === "current") return "current-audit" as const;
  if (storage === "date-enabled") return "availability" as const;
  if (storage === "effective-version") return "effective-period" as const;
  if (storage === "revision") return "revision" as const;
  return "event-ledger" as const;
}

export function assertBusinessTemporalRegistration(
  registration: BusinessTemporalRegistration,
): asserts registration is BusinessTemporalRegistration {
  if (!/^[a-z][a-z0-9.-]+$/.test(registration.key)) {
    invalidTemporalPolicy(registration.key, "key 必须是稳定的小写点分标识");
  }
  if (!registration.ownerModuleKey.trim() || !registration.resourceKey.trim() || !registration.aggregate.trim()) {
    invalidTemporalPolicy(registration.key, "ownerModuleKey、resourceKey 和 aggregate 不能为空");
  }
  if (registration.records.authority.length === 0) {
    invalidTemporalPolicy(registration.key, "records.authority 必须声明至少一个类型化事实源");
  }
  const recordSources = [
    ...registration.records.authority,
    ...(registration.records.supplementary ?? []),
  ];
  const sourceKeys = recordSources.map(businessTemporalSourceKey);
  if (new Set(sourceKeys).size !== sourceKeys.length) {
    invalidTemporalPolicy(registration.key, "同一个 model/field 不能重复登记为多个 records source");
  }
  for (const source of recordSources) {
    if (!source.model.trim()) invalidTemporalPolicy(registration.key, "records source model 不能为空");
    if (source.kind === "model") {
      if (source.fields.length === 0 || source.fields.some((field) => !field.trim())) {
        invalidTemporalPolicy(registration.key, `${source.model} 必须声明用于 lifecycle contract 的字段`);
      }
    } else if (!source.field.trim()) {
      invalidTemporalPolicy(registration.key, `${source.model} 的 legacy JSON field 不能为空`);
    }
  }
  if (registration.baseline && !recordSources.some((source) => source.role === "legacy-source")) {
    invalidTemporalPolicy(registration.key, "baseline policy 必须登记 legacy-source 作为迁移证据");
  }
  if (registration.maturity !== "planned" && registration.commands.length === 0) {
    invalidTemporalPolicy(registration.key, "已接入或部分接入的聚合必须声明业务命令能力");
  }
  if (registration.maturity === "implemented") {
    if (!registration.implementation?.adapterKey.trim() || !registration.implementation.modulePath.trim()) {
      invalidTemporalPolicy(registration.key, "implemented 聚合必须声明已绑定 runtime adapter 的 key 和 modulePath");
    }
  } else if (registration.implementation) {
    invalidTemporalPolicy(registration.key, "只有 implemented 聚合可以声明 implementation adapter");
  }
  if (new Set(registration.commands).size !== registration.commands.length) {
    invalidTemporalPolicy(registration.key, "commands 不能重复");
  }
  if (registration.policy.revision === "forbid" && registration.commands.includes("correct")) {
    invalidTemporalPolicy(registration.key, "revision=forbid 时不能声明 correct 命令");
  }
  if (registration.policy.storage === "event-projection") {
    const projection = registration.projection;
    if (
      !projection
      || !projection.eventSource.trim()
      || !projection.projection.trim()
      || !projection.sourceEventField.trim()
      || !projection.generationField.trim()
      || !projection.runModel.trim()
      || !projection.projectorKey.trim()
      || !Number.isInteger(projection.projectorVersion)
      || projection.projectorVersion < 1
      || !projection.rebuildAdapterKey.trim()
    ) {
      invalidTemporalPolicy(registration.key, "event-projection 必须声明完整的来源、provenance、generation 和 rebuild adapter");
    }
    if (
      registration.maturity !== "planned"
      && !registration.commands.includes("append-event")
    ) {
      invalidTemporalPolicy(registration.key, "已接入的 event-projection 必须通过业务命令追加事件");
    }
  } else if (registration.projection) {
    invalidTemporalPolicy(registration.key, "只有 event-projection 可以声明 projection policy");
  }
  if (!registration.ui.history && registration.policy.storage !== "current" && registration.maturity !== "planned") {
    invalidTemporalPolicy(registration.key, "已接入的时间事实必须暴露历史视图");
  }
  const uiPolicyError = businessTemporalUiPolicyError(registration.ui);
  if (uiPolicyError) invalidTemporalPolicy(registration.key, uiPolicyError);
}

export function businessTemporalSourceKey(source: BusinessTemporalSource) {
  return source.kind === "model" ? `model:${source.model}` : `json-field:${source.model}.${source.field}`;
}

function invalidTemporalPolicy(key: string, message: string): never {
  throw new BusinessTemporalContractError(
    "TEMPORAL_INVALID_POLICY",
    `Business Temporal policy ${key || "<unknown>"} 无效：${message}`,
  );
}

function optionalBusinessDate(value: string | null | undefined): BusinessDate | null | "invalid" {
  const normalized = value?.trim();
  if (!normalized) return null;
  return parseBusinessDate(normalized) ?? "invalid";
}
