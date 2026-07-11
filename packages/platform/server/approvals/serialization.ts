import type {
  ApprovalEventType,
  ApprovalFlowType,
  ApprovalHandlerSource,
  ApprovalOperation,
  ApprovalRequestDto,
  ApprovalRequestRecord,
  ApprovalSeparationPolicy,
  ApprovalStatus,
} from "./types";
import { parseWorkflowNodes } from "../workflows";

export type ApprovalRequestRow = {
  id: number;
  resourceKey: string;
  scopeId: string | null;
  businessActionKey: string;
  flowType: string;
  separationPolicy: string;
  handlerSource: string;
  workflowNodesJson: string;
  activeWorkflowNodeKey: string | null;
  activeWorkflowNodeKeysJson: string;
  workflowJoinStateJson: string;
  handlerCanRevise: boolean;
  requestCanWithdraw: boolean;
  requestCanResubmit: boolean;
  requestCanCancel: boolean;
  requestCanRevise: boolean;
  subjectType: string;
  subjectId: string | null;
  operation: string;
  status: string;
  latestPayloadJson: string;
  submitterUserId: number;
  submittedAt: Date | null;
  resolvedByUserId: number | null;
  resolvedAt: Date | null;
  committedEntityType: string | null;
  committedEntityId: string | null;
  committedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

type ApprovalEventRow = {
  id: number;
  sequence: number;
  eventType: string;
  actorUserId: number;
  workflowNodeKey: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  comment: string | null;
  payloadJson: string | null;
  createdAt: Date;
  actor?: UserDisplayRow | null;
};
type UserDisplayRow = { employees?: Array<{ name: string }> };
export type ApprovalRequestRowWithEvents = ApprovalRequestRow & {
  events?: ApprovalEventRow[];
  submitter?: UserDisplayRow | null;
};

const STATUS_SET = new Set<ApprovalStatus>(["draft", "submitted", "committing", "withdrawn", "rejected", "approved", "cancelled"]);
const OPERATION_SET = new Set<ApprovalOperation>(["create", "update"]);
const FLOW_TYPE_SET = new Set<ApprovalFlowType>(["approval", "review", "publish"]);
const SEPARATION_POLICY_SET = new Set<ApprovalSeparationPolicy>([
  "independent_required",
  "auto_pass_if_authorized",
]);
const HANDLER_SOURCE_SET = new Set<ApprovalHandlerSource>(["direct_manager", "department_owner", "permission"]);

export const requestInclude = {
  submitter: { select: { employees: { select: { name: true }, take: 1 } } },
  events: {
    include: { actor: { select: { employees: { select: { name: true }, take: 1 } } } },
    orderBy: { sequence: "asc" as const },
  },
} as const;

export function toDto<TPayload = unknown>(row: ApprovalRequestRowWithEvents): ApprovalRequestDto<TPayload> {
  const payload = parsePayload<TPayload>(row.latestPayloadJson);
  return {
    id: row.id,
    resourceKey: row.resourceKey,
    scopeId: row.scopeId,
    businessActionKey: row.businessActionKey,
    flowType: normalizeFlowType(row.flowType),
    separationPolicy: normalizeSeparationPolicy(row.separationPolicy),
    handlerSource: normalizeHandlerSource(row.handlerSource),
    workflowNodes: parseWorkflowNodes(row.workflowNodesJson),
    activeWorkflowNodeKey: row.activeWorkflowNodeKey,
    activeWorkflowNodeKeys: parseStringArray(row.activeWorkflowNodeKeysJson, row.activeWorkflowNodeKey),
    workflowJoinState: parseWorkflowJoinState(row.workflowJoinStateJson),
    handlerCanRevise: booleanWithDefault(row.handlerCanRevise),
    requestCanWithdraw: booleanWithDefault(row.requestCanWithdraw),
    requestCanResubmit: booleanWithDefault(row.requestCanResubmit),
    requestCanCancel: booleanWithDefault(row.requestCanCancel),
    requestCanRevise: booleanWithDefault(row.requestCanRevise),
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    operation: normalizeOperation(row.operation),
    status: normalizeStatus(row.status),
    latestPayload: payload,
    submitterUserId: row.submitterUserId,
    submitterName: displayName(row.submitter),
    submittedAt: row.submittedAt?.toISOString() ?? null,
    resolvedByUserId: row.resolvedByUserId,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    committedEntityType: row.committedEntityType,
    committedEntityId: row.committedEntityId,
    committedAt: row.committedAt?.toISOString() ?? null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    events: (row.events || []).map((event) => ({
      id: event.id,
      sequence: event.sequence,
      eventType: event.eventType as ApprovalEventType,
      actorUserId: event.actorUserId,
      actorName: displayName(event.actor),
      workflowNodeKey: event.workflowNodeKey,
      fromStatus: event.fromStatus ? normalizeStatus(event.fromStatus) : null,
      toStatus: event.toStatus ? normalizeStatus(event.toStatus) : null,
      comment: event.comment,
      payloadSnapshot: event.payloadJson ? parsePayload<TPayload>(event.payloadJson) : null,
      createdAt: event.createdAt.toISOString(),
    })),
  };
}

export function toRecord<TPayload>(row: ApprovalRequestRow, payload: TPayload): ApprovalRequestRecord<TPayload> {
  return {
    id: row.id,
    resourceKey: row.resourceKey,
    scopeId: row.scopeId,
    businessActionKey: row.businessActionKey,
    flowType: normalizeFlowType(row.flowType),
    separationPolicy: normalizeSeparationPolicy(row.separationPolicy),
    handlerSource: normalizeHandlerSource(row.handlerSource),
    workflowNodes: parseWorkflowNodes(row.workflowNodesJson),
    activeWorkflowNodeKey: row.activeWorkflowNodeKey,
    activeWorkflowNodeKeys: parseStringArray(row.activeWorkflowNodeKeysJson, row.activeWorkflowNodeKey),
    workflowJoinState: parseWorkflowJoinState(row.workflowJoinStateJson),
    handlerCanRevise: booleanWithDefault(row.handlerCanRevise),
    requestCanWithdraw: booleanWithDefault(row.requestCanWithdraw),
    requestCanResubmit: booleanWithDefault(row.requestCanResubmit),
    requestCanCancel: booleanWithDefault(row.requestCanCancel),
    requestCanRevise: booleanWithDefault(row.requestCanRevise),
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    operation: normalizeOperation(row.operation),
    status: normalizeStatus(row.status),
    latestPayload: payload,
    submitterUserId: row.submitterUserId,
    submittedAt: row.submittedAt,
    resolvedByUserId: row.resolvedByUserId,
    resolvedAt: row.resolvedAt,
    committedEntityType: row.committedEntityType,
    committedEntityId: row.committedEntityId,
    committedAt: row.committedAt,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function stringifyPayload(payload: unknown) {
  return JSON.stringify(payload ?? {});
}

export function stringifyStringArray(values: readonly string[]) {
  return JSON.stringify(Array.from(new Set(values.filter((value) => value.trim()))));
}

export function stringifyWorkflowJoinState(value: Record<string, readonly string[]>) {
  const normalized = Object.fromEntries(Object.entries(value).map(([key, values]) => [key, Array.from(new Set(values))]));
  return JSON.stringify(normalized);
}

export function parsePayload<TPayload>(json: string | null | undefined): TPayload {
  if (!json) return {} as TPayload;
  try {
    return JSON.parse(json) as TPayload;
  } catch {
    return {} as TPayload;
  }
}

export function normalizeComment(comment: string | null | undefined) {
  const text = String(comment ?? "").trim();
  return text || null;
}

function normalizeStatus(status: string): ApprovalStatus {
  return STATUS_SET.has(status as ApprovalStatus) ? status as ApprovalStatus : "draft";
}

function normalizeOperation(operation: string): ApprovalOperation {
  return OPERATION_SET.has(operation as ApprovalOperation) ? operation as ApprovalOperation : "create";
}

function normalizeFlowType(flowType: string): ApprovalFlowType {
  return FLOW_TYPE_SET.has(flowType as ApprovalFlowType) ? flowType as ApprovalFlowType : "approval";
}

function parseStringArray(json: string | null | undefined, fallback: string | null) {
  try {
    const parsed = json ? JSON.parse(json) : [];
    if (Array.isArray(parsed)) {
      const values = Array.from(new Set(parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0)));
      if (values.length > 0) return values;
    }
  } catch {
    // fall through to legacy single-key fallback
  }
  return fallback ? [fallback] : [];
}

function parseWorkflowJoinState(json: string | null | undefined) {
  try {
    const parsed = json ? JSON.parse(json) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).flatMap(([key, value]) => (
      Array.isArray(value)
        ? [[key, Array.from(new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)))]]
        : []
    )));
  } catch {
    return {};
  }
}

function normalizeSeparationPolicy(separationPolicy: string): ApprovalSeparationPolicy {
  return SEPARATION_POLICY_SET.has(separationPolicy as ApprovalSeparationPolicy)
    ? separationPolicy as ApprovalSeparationPolicy
    : "auto_pass_if_authorized";
}

function normalizeHandlerSource(handlerSource: string): ApprovalHandlerSource {
  return HANDLER_SOURCE_SET.has(handlerSource as ApprovalHandlerSource)
    ? handlerSource as ApprovalHandlerSource
    : "permission";
}

function booleanWithDefault(value: unknown) {
  return value === undefined || value === null ? true : Boolean(value);
}

function displayName(user: UserDisplayRow | null | undefined) {
  return user?.employees?.[0]?.name ?? "";
}
