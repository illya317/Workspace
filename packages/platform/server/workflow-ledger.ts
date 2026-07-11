import { prisma } from "./prisma";
import {
  listWorkflowBusinessActions,
  WORKFLOW_FLOW_TYPES,
  WORKFLOW_HANDLER_SOURCES,
  WORKFLOW_SEPARATION_POLICIES,
  type WorkflowBusinessActionSettingsDto,
  type WorkflowFlowType,
  type WorkflowHandlerSource,
  type WorkflowSeparationPolicy,
} from "./workflows";

export type WorkflowLedgerRequestDto = {
  id: number;
  businessActionKey: string;
  actionLabel: string;
  moduleLabel: string;
  resourceKey: string;
  resourceLabel: string;
  flowType: WorkflowFlowType;
  separationPolicy: WorkflowSeparationPolicy;
  handlerSource: WorkflowHandlerSource;
  handlerCanRevise: boolean;
  requestCanWithdraw: boolean;
  requestCanResubmit: boolean;
  requestCanCancel: boolean;
  requestCanRevise: boolean;
  subjectType: string;
  subjectId: string | null;
  operation: string;
  status: string;
  submitterUserId: number;
  submittedAt: string | null;
  resolvedByUserId: number | null;
  resolvedAt: string | null;
  committedEntityType: string | null;
  committedEntityId: string | null;
  scopeId: string | null;
  latestEventType: string | null;
  latestEventAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowLedgerResponseDto = {
  requests: WorkflowLedgerRequestDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type ListWorkflowLedgerInput = {
  businessActionKey?: string | null;
  allowedBusinessActionKeys?: Iterable<string> | null;
  status?: string | null;
  query?: string | null;
  page?: number | null;
  pageSize?: number | null;
};

type WorkflowLedgerModelRow = {
  id: number;
  businessActionKey: string;
  flowType: string;
  separationPolicy: string;
  handlerSource: string;
  handlerCanRevise: boolean;
  requestCanWithdraw: boolean;
  requestCanResubmit: boolean;
  requestCanCancel: boolean;
  requestCanRevise: boolean;
  subjectType: string;
  subjectId: string | null;
  operation: string;
  status: string;
  resourceKey: string;
  submitterUserId: number;
  submittedAt: Date | null;
  resolvedByUserId: number | null;
  resolvedAt: Date | null;
  committedEntityType: string | null;
  committedEntityId: string | null;
  scopeId: string | null;
  createdAt: Date;
  updatedAt: Date;
  events?: Array<{ eventType: string; createdAt: Date }>;
};

const FLOW_TYPES = new Set<WorkflowFlowType>(WORKFLOW_FLOW_TYPES);
const SEPARATION_POLICIES = new Set<WorkflowSeparationPolicy>(WORKFLOW_SEPARATION_POLICIES);
const HANDLER_SOURCES = new Set<WorkflowHandlerSource>(WORKFLOW_HANDLER_SOURCES);

export async function listWorkflowLedgerRequests(input: ListWorkflowLedgerInput = {}): Promise<WorkflowLedgerResponseDto> {
  const actions = listWorkflowBusinessActions();
  const actionMap = new Map(actions.map((action) => [action.key, action]));
  const visibleActionKeySet = input.allowedBusinessActionKeys
    ? new Set(input.allowedBusinessActionKeys)
    : null;
  const allowedActionKeys = actions
    .filter((action) => !visibleActionKeySet || visibleActionKeySet.has(action.key))
    .map((action) => action.key);
  const requestedActionKey = normalizeNullableText(input.businessActionKey);
  const actionKeys = requestedActionKey
    ? allowedActionKeys.includes(requestedActionKey) ? [requestedActionKey] : []
    : allowedActionKeys;
  const pageSize = clampPageSize(input.pageSize);
  const page = Math.max(0, Number(input.page ?? 0) || 0);
  const status = normalizeNullableText(input.status);
  const query = normalizeNullableText(input.query);

  const where = {
    businessActionKey: { in: actionKeys.length > 0 ? actionKeys : ["__none__"] },
    ...(status && status !== "all" ? { status } : {}),
    ...(query ? {
      OR: [
        { businessActionKey: { contains: query } },
        { resourceKey: { contains: query } },
        { subjectType: { contains: query } },
        { subjectId: { contains: query } },
        { operation: { contains: query } },
        { committedEntityId: { contains: query } },
      ],
    } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.approvalRequest.count({ where }),
    prisma.approvalRequest.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: page * pageSize,
      take: pageSize,
      include: {
        events: {
          orderBy: [{ sequence: "desc" }, { id: "desc" }],
          take: 1,
        },
      },
    }),
  ]);

  return {
    requests: rows.map((row) => serializeWorkflowLedgerRequest(row, actionMap)),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

function serializeWorkflowLedgerRequest(
  row: WorkflowLedgerModelRow,
  actionMap: ReadonlyMap<string, WorkflowBusinessActionSettingsDto>,
): WorkflowLedgerRequestDto {
  const action = actionMap.get(row.businessActionKey);
  const latestEvent = row.events?.[0] ?? null;
  return {
    id: row.id,
    businessActionKey: row.businessActionKey,
    actionLabel: action?.label ?? row.businessActionKey,
    moduleLabel: action?.moduleLabel ?? action?.moduleKey ?? "未注册",
    resourceKey: row.resourceKey,
    resourceLabel: action?.resourceLabel ?? row.resourceKey,
    flowType: normalizeFlowType(row.flowType, "approval"),
    separationPolicy: normalizeSeparationPolicy(row.separationPolicy, "auto_pass_if_authorized"),
    handlerSource: normalizeHandlerSource(row.handlerSource, "permission"),
    handlerCanRevise: row.handlerCanRevise,
    requestCanWithdraw: row.requestCanWithdraw,
    requestCanResubmit: row.requestCanResubmit,
    requestCanCancel: row.requestCanCancel,
    requestCanRevise: row.requestCanRevise,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    operation: row.operation,
    status: row.status,
    submitterUserId: row.submitterUserId,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    resolvedByUserId: row.resolvedByUserId,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    committedEntityType: row.committedEntityType,
    committedEntityId: row.committedEntityId,
    scopeId: row.scopeId,
    latestEventType: latestEvent?.eventType ?? null,
    latestEventAt: latestEvent?.createdAt.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function normalizeNullableText(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  return text || null;
}

function clampPageSize(value: number | null | undefined) {
  const size = Number(value ?? 50);
  if (!Number.isFinite(size)) return 50;
  return Math.max(10, Math.min(100, Math.trunc(size)));
}

function normalizeFlowType(value: string | null | undefined, fallback: WorkflowFlowType) {
  return FLOW_TYPES.has(value as WorkflowFlowType) ? value as WorkflowFlowType : fallback;
}

function normalizeSeparationPolicy(value: string | null | undefined, fallback: WorkflowSeparationPolicy) {
  return SEPARATION_POLICIES.has(value as WorkflowSeparationPolicy) ? value as WorkflowSeparationPolicy : fallback;
}

function normalizeHandlerSource(value: string | null | undefined, fallback: WorkflowHandlerSource) {
  return HANDLER_SOURCES.has(value as WorkflowHandlerSource) ? value as WorkflowHandlerSource : fallback;
}
