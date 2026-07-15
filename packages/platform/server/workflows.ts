import { prisma } from "./prisma";
import { guardedDelete } from "./delete-guard";
import {
  listWorkflowBusinessActions,
  withWorkflowPolicyStatus,
  type WorkflowBusinessActionSettingsDto,
} from "./workflow-action-settings";
import { serviceError, serviceOk, type ServiceResult } from "./api";
import {
  WORKFLOW_FLOW_TYPES,
  WORKFLOW_HANDLER_SOURCES,
  WORKFLOW_POLICY_MODES,
  WORKFLOW_SEPARATION_POLICIES,
  type WorkflowFlowType,
  type WorkflowHandlerSource,
  type WorkflowPolicyMode,
  type WorkflowPolicyScopeType,
  type WorkflowSeparationPolicy,
} from "./workflow-types";
import {
  normalizeWorkflowNodes,
  parseWorkflowNodes,
  stringifyWorkflowNodes,
  type WorkflowPolicyNodeDefinition,
} from "./workflow-policy-nodes";
import type { WorkflowPolicyDefaults } from "./workflow-policy-defaults";
import { enforceWorkflowPolicyModeForRegistration, workflowDefaultsForRegistration } from "./workflow-contract-defaults";
import {
  listWorkflowCategoryRegistrations,
  type WorkflowCategoryRegistration,
} from "../workflow-category-registry";
import { ensureEditHistoryBaseline, snapshotHistory } from "./history";

export {
  resolveNextWorkflowPolicyForPayload,
  resolveWorkflowPolicyForPayload,
  parseWorkflowNodes,
  stringifyWorkflowNodes,
  type WorkflowNodeApprovalMode,
  type WorkflowNodeAssignee,
  type WorkflowNodeAssigneeFieldKind,
  type WorkflowNodeCondition,
  type WorkflowNodeConditionFieldKind,
  type WorkflowExecutionState,
  type WorkflowPolicyNodeDefinition,
} from "./workflow-policy-nodes";

export { listWorkflowBusinessActions } from "./workflow-action-settings";
export type { WorkflowBusinessActionSettingsDto } from "./workflow-action-settings";
export type { WorkflowPolicyDefaults } from "./workflow-policy-defaults";
export {
  WORKFLOW_FLOW_TYPES,
  WORKFLOW_HANDLER_SOURCES,
  WORKFLOW_POLICY_MODES,
  WORKFLOW_SEPARATION_POLICIES,
};
export type {
  WorkflowFlowType,
  WorkflowHandlerSource,
  WorkflowPolicyMode,
  WorkflowPolicyScopeType,
  WorkflowSeparationPolicy,
};

export type ResolvedWorkflowPolicy = {
  businessActionKey: string;
  resourceKey: string | null;
  scopeType: string;
  scopeId: string;
  mode: WorkflowPolicyMode;
  flowType: WorkflowFlowType;
  separationPolicy: WorkflowSeparationPolicy;
  handlerSource: WorkflowHandlerSource;
  workflowNodes: WorkflowPolicyNodeDefinition[];
  activeWorkflowNodeKey: string | null;
  activeWorkflowNodeKeys: string[];
  workflowJoinState: Record<string, string[]>;
  handlerCanRevise: boolean;
  requestCanWithdraw: boolean;
  requestCanResubmit: boolean;
  requestCanCancel: boolean;
  requestCanRevise: boolean;
  source: "policy" | "defaults";
  policyId: number | null;
  version: number | null;
};

export type WorkflowPolicyRowDto = {
  id: number;
  businessActionKey: string;
  scopeType: string;
  scopeId: string;
  mode: WorkflowPolicyMode;
  flowType: WorkflowFlowType;
  separationPolicy: WorkflowSeparationPolicy;
  handlerSource: WorkflowHandlerSource;
  workflowNodes: WorkflowPolicyNodeDefinition[];
  handlerCanRevise: boolean;
  requestCanWithdraw: boolean;
  requestCanResubmit: boolean;
  requestCanCancel: boolean;
  requestCanRevise: boolean;
  version: number;
  createdByUserId: number | null;
  updatedByUserId: number | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowPolicySettingsDto = {
  businessActions: readonly WorkflowBusinessActionSettingsDto[];
  workflowCategories: readonly WorkflowCategoryRegistration[];
  companyOptions: readonly WorkflowCompanyOptionDto[];
  departmentOptions: readonly WorkflowDepartmentOptionDto[];
  employeeOptions: readonly WorkflowEmployeeOptionDto[];
  positionOptions: readonly WorkflowPositionOptionDto[];
  policies: WorkflowPolicyRowDto[];
  enums: {
    modes: typeof WORKFLOW_POLICY_MODES;
    flowTypes: typeof WORKFLOW_FLOW_TYPES;
    separationPolicies: typeof WORKFLOW_SEPARATION_POLICIES;
    handlerSources: typeof WORKFLOW_HANDLER_SOURCES;
  };
};

export type WorkflowPositionOptionDto = { id: number; code: string; name: string; label: string; description?: string };
export type WorkflowCompanyOptionDto = { code: string; name: string; label: string; description?: string };
export type WorkflowDepartmentOptionDto = { id: number; code: string; name: string; label: string; description?: string };
export type WorkflowEmployeeOptionDto = { id: number; employeeId: string; name: string; label: string; description?: string };

export type WorkflowPolicySettingsAccessInput = { allowedBusinessActionKeys?: Iterable<string> | null };

export type UpsertWorkflowPolicyInput = {
  businessActionKey: string; mode: string; flowType: string; separationPolicy: string; handlerSource?: string | null; workflowNodes?: unknown;
  handlerCanRevise?: boolean | null; requestCanWithdraw?: boolean | null; requestCanResubmit?: boolean | null; requestCanCancel?: boolean | null;
  requestCanRevise?: boolean | null; actorUserId?: number | null;
};

export type DeleteWorkflowPolicyInput =
  | { id: number; actorUserId: number }
  | { businessActionKey: string; actorUserId: number };

const FLOW_TYPES = new Set<WorkflowFlowType>(WORKFLOW_FLOW_TYPES);
const SEPARATION_POLICIES = new Set<WorkflowSeparationPolicy>(WORKFLOW_SEPARATION_POLICIES);
const POLICY_MODES = new Set<WorkflowPolicyMode>(WORKFLOW_POLICY_MODES);
const HANDLER_SOURCES = new Set<WorkflowHandlerSource>(WORKFLOW_HANDLER_SOURCES);

type WorkflowPolicyModelRow = {
  id: number; businessActionKey: string; scopeType: string; scopeId: string; mode: string; flowType: string; separationPolicy: string;
  handlerSource: string; workflowNodesJson: string; handlerCanRevise: boolean; requestCanWithdraw: boolean; requestCanResubmit: boolean;
  requestCanCancel: boolean; requestCanRevise: boolean; version: number; createdByUserId: number | null; updatedByUserId: number | null;
  createdAt: Date; updatedAt: Date;
};

export async function listWorkflowPolicySettings(input: WorkflowPolicySettingsAccessInput = {}): Promise<WorkflowPolicySettingsDto> {
  const [policies, companies, departments, employees, positions] = await Promise.all([
    prisma.workflowPolicy.findMany({
      where: {
        scopeType: "global",
        scopeId: "",
      },
      orderBy: [{ businessActionKey: "asc" }, { scopeType: "asc" }, { scopeId: "asc" }],
    }),
    prisma.company.findMany({
      where: { isActive: true },
      select: { code: true, name: true },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    }),
    prisma.department.findMany({
      where: { isArchived: false },
      select: { id: true, code: true, name: true },
      orderBy: [{ code: "asc" }, { name: "asc" }],
    }),
    prisma.employee.findMany({
      select: { id: true, employeeId: true, name: true },
      orderBy: [{ employeeId: "asc" }],
    }),
    prisma.position.findMany({
      where: { isArchived: false },
      select: { id: true, code: true, name: true },
      orderBy: [{ code: "asc" }, { name: "asc" }],
    }),
  ]);
  const allowedBusinessActionKeys = input.allowedBusinessActionKeys
    ? new Set(input.allowedBusinessActionKeys)
    : null;
  const workflowActions = listWorkflowBusinessActions()
    .filter((action) => action.eligibility === "workflow_optional" || action.eligibility === "workflow_required")
    .filter((action) => action.settingsVisibility !== "runtime_only")
    .filter((action) => !allowedBusinessActionKeys || allowedBusinessActionKeys.has(action.key));
  const workflowActionKeys = new Set(workflowActions.map((action) => action.key));
  return {
    businessActions: workflowActions.map((action) => withWorkflowPolicyStatus(action, policies)),
    workflowCategories: listWorkflowCategoryRegistrations(),
    companyOptions: companies.map(namedCodeWorkflowOption),
    departmentOptions: departments.map(namedCodeWorkflowOption),
    employeeOptions: employees.map(employeeWorkflowOption),
    positionOptions: positions.map(namedCodeWorkflowOption),
    policies: policies
      .filter((policy) => workflowActionKeys.has(policy.businessActionKey))
      .map(serializeWorkflowPolicy),
    enums: {
      modes: WORKFLOW_POLICY_MODES,
      flowTypes: WORKFLOW_FLOW_TYPES,
      separationPolicies: WORKFLOW_SEPARATION_POLICIES,
      handlerSources: WORKFLOW_HANDLER_SOURCES,
    },
  };
}

function namedCodeWorkflowOption<T extends { code: string; name: string }>(option: T) {
  return { ...option, label: option.name, description: option.code };
}
function employeeWorkflowOption<T extends { employeeId: string; name: string }>(option: T) {
  return { ...option, label: option.name, description: option.employeeId };
}
export async function upsertWorkflowPolicy(input: UpsertWorkflowPolicyInput): Promise<ServiceResult<WorkflowPolicyRowDto>> {
  const normalized = normalizeWorkflowPolicyInput(input);
  if (!normalized.ok) return normalized;
  const row = await prisma.$transaction(async (tx) => {
    const key = { businessActionKey: normalized.data.businessActionKey, scopeType: normalized.data.scopeType, scopeId: normalized.data.scopeId };
    const existing = await tx.workflowPolicy.findUnique({ where: { businessActionKey_scopeType_scopeId: key }, select: { id: true } });
    if (existing && input.actorUserId) {
      await ensureEditHistoryBaseline("WorkflowPolicy", existing.id, input.actorUserId, tx);
    }
    const saved = await tx.workflowPolicy.upsert({
      where: { businessActionKey_scopeType_scopeId: key },
      create: {
        businessActionKey: normalized.data.businessActionKey,
        scopeType: normalized.data.scopeType,
        scopeId: normalized.data.scopeId,
        mode: normalized.data.mode,
        flowType: normalized.data.flowType,
        separationPolicy: normalized.data.separationPolicy,
        handlerSource: normalized.data.handlerSource,
        workflowNodesJson: stringifyWorkflowNodes(normalized.data.workflowNodes),
        handlerCanRevise: normalized.data.handlerCanRevise,
        requestCanWithdraw: normalized.data.requestCanWithdraw,
        requestCanResubmit: normalized.data.requestCanResubmit,
        requestCanCancel: normalized.data.requestCanCancel,
        requestCanRevise: normalized.data.requestCanRevise,
        createdByUserId: input.actorUserId ?? null,
        updatedByUserId: input.actorUserId ?? null,
      },
      update: {
        mode: normalized.data.mode,
        flowType: normalized.data.flowType,
        separationPolicy: normalized.data.separationPolicy,
        handlerSource: normalized.data.handlerSource,
        workflowNodesJson: stringifyWorkflowNodes(normalized.data.workflowNodes),
        handlerCanRevise: normalized.data.handlerCanRevise,
        requestCanWithdraw: normalized.data.requestCanWithdraw,
        requestCanResubmit: normalized.data.requestCanResubmit,
        requestCanCancel: normalized.data.requestCanCancel,
        requestCanRevise: normalized.data.requestCanRevise,
        updatedByUserId: input.actorUserId ?? null,
        version: { increment: 1 },
      },
    });
    if (input.actorUserId) await snapshotHistory("WorkflowPolicy", saved.id, input.actorUserId, tx);
    return saved;
  });
  return serviceOk(serializeWorkflowPolicy(row));
}

export async function deleteWorkflowPolicy(input: DeleteWorkflowPolicyInput): Promise<ServiceResult<{ deleted: true }>> {
  const policy = await prisma.workflowPolicy.findFirst({
    where: "id" in input
      ? { id: input.id, scopeType: "global", scopeId: "" }
      : { businessActionKey: normalizeKey(input.businessActionKey), scopeType: "global", scopeId: "" },
    select: { id: true },
  });
  if (!policy) return serviceError("流程策略不存在", 404);
  const result = await guardedDelete({
    entityType: "WorkflowPolicy",
    modelKey: "workflowPolicy",
    id: policy.id,
    userId: input.actorUserId,
    actionLabel: "删除流程策略",
    deleteMode: "hard",
    referencePolicy: "none",
    scopeGuard: ({ record }) => record.scopeType === "global" && record.scopeId === ""
      ? { ok: true }
      : { error: "流程策略不存在", status: 404 },
  });
  if (!result.ok) return serviceError(result.error, result.status || 400);
  return serviceOk({ deleted: true });
}

export async function resolveWorkflowPolicy(input: {
  businessActionKey?: string | null;
  resourceKey?: string | null;
  scopeType?: string | null;
  scopeId?: string | number | null;
  actorUserId?: number | null;
  defaults?: WorkflowPolicyDefaults | null;
}): Promise<ResolvedWorkflowPolicy> {
  const defaults = input.defaults ?? {};
  const businessActionKey = normalizeKey(
    input.businessActionKey ?? defaults.businessActionKey ?? input.resourceKey,
  );
  const scopeId = normalizeScopeId(input.scopeId);
  const scopeType = normalizeScopeType(input.scopeType ?? defaults.scopeType, scopeId);
  const registration = getWorkflowBusinessAction(businessActionKey);
  const effectiveDefaults = workflowDefaultsForRegistration(registration, defaults);
  const fallback = buildFallbackPolicy({
    businessActionKey,
    resourceKey: input.resourceKey ?? null,
    scopeType,
    scopeId,
    defaults: effectiveDefaults,
  });
  if (registration && !isWorkflowConfigurable(registration)) {
    return { ...fallback, mode: "permission_only" };
  }
  const policy = await prisma.workflowPolicy.findFirst({
    where: {
      businessActionKey,
      scopeType: "global",
      scopeId: "",
    },
    orderBy: { version: "desc" },
  });
  if (!policy) return fallback;
  return {
    ...fallback,
    businessActionKey,
    mode: enforceWorkflowPolicyModeForRegistration(registration, normalizePolicyMode(policy.mode, fallback.mode), fallback.mode),
    flowType: normalizeFlowType(policy.flowType, fallback.flowType),
    separationPolicy: normalizeSeparationPolicy(policy.separationPolicy, fallback.separationPolicy),
    handlerSource: normalizeHandlerSource(policy.handlerSource, fallback.handlerSource),
    workflowNodes: parseWorkflowNodes(policy.workflowNodesJson),
    activeWorkflowNodeKey: null,
    activeWorkflowNodeKeys: [],
    workflowJoinState: {},
    handlerCanRevise: policy.handlerCanRevise,
    requestCanWithdraw: policy.requestCanWithdraw,
    requestCanResubmit: policy.requestCanResubmit,
    requestCanCancel: policy.requestCanCancel,
    requestCanRevise: policy.requestCanRevise,
    source: "policy",
    policyId: policy.id,
    version: policy.version,
  };
}

export function inferWorkflowScopeType(scopeId: string | number | null | undefined) {
  return normalizeScopeType(null, normalizeScopeId(scopeId));
}

function normalizeWorkflowPolicyInput(
  input: UpsertWorkflowPolicyInput,
): ServiceResult<{
  businessActionKey: string;
  scopeType: WorkflowPolicyScopeType;
  scopeId: string;
  mode: WorkflowPolicyMode;
  flowType: WorkflowFlowType;
  separationPolicy: WorkflowSeparationPolicy;
  handlerSource: WorkflowHandlerSource;
  workflowNodes: WorkflowPolicyNodeDefinition[];
  handlerCanRevise: boolean;
  requestCanWithdraw: boolean;
  requestCanResubmit: boolean;
  requestCanCancel: boolean;
  requestCanRevise: boolean;
}> {
  const businessActionKey = normalizeKey(input.businessActionKey);
  const registration = getWorkflowBusinessAction(businessActionKey);
  if (!registration) return serviceError("业务行为不存在", 404);
  const handlerSource = normalizeHandlerSource(input.handlerSource, "permission");
  if (!HANDLER_SOURCES.has(handlerSource)) return serviceError("处理人来源无效", 400);
  const mode = normalizePolicyInputMode(input.mode, registration);
  if (!isWorkflowConfigurable(registration) && mode !== "permission_only") return serviceError("该业务行为缺少可配置 ActionContract，不能启用流程", 400);
  const workflowContract = registration.actionContract?.workflow;
  if (mode === "permission_only" && workflowContract?.kind !== "not_applicable" && !workflowContract?.canDisable && isWorkflowConfigurable(registration)) {
    return serviceError("该业务行为不允许关闭流程", 400);
  }
  const flowType = normalizeFlowType(input.flowType, registration.flowType ?? "approval");
  const separationPolicy = normalizePolicyInputSeparationPolicy(
    input.separationPolicy,
    registration.separationPolicy ?? "auto_pass_if_authorized",
  );
  if (!separationPolicy.ok) return separationPolicy;
  if (mode !== "permission_only") {
    const contractCheck = validatePolicyAgainstActionContract(registration, { flowType, separationPolicy: separationPolicy.data, handlerSource });
    if (!contractCheck.ok) return contractCheck;
    const persistenceCheck = validateWorkflowPersistenceContract(registration);
    if (!persistenceCheck.ok) return persistenceCheck;
  }
  const workflowNodes = normalizeWorkflowNodes(input.workflowNodes, handlerSource);
  return serviceOk({
    businessActionKey,
    scopeType: "global",
    scopeId: "",
    mode,
    flowType,
    separationPolicy: separationPolicy.data,
    handlerSource,
    workflowNodes,
    handlerCanRevise: input.handlerCanRevise ?? true,
    requestCanWithdraw: input.requestCanWithdraw ?? true,
    requestCanResubmit: input.requestCanResubmit ?? true,
    requestCanCancel: input.requestCanCancel ?? true,
    requestCanRevise: input.requestCanRevise ?? true,
  });
}

function getWorkflowBusinessAction(key: string) {
  return listWorkflowBusinessActions().find((action) => action.key === key) ?? null;
}

function serializeWorkflowPolicy(row: WorkflowPolicyModelRow): WorkflowPolicyRowDto {
  return {
    id: row.id,
    businessActionKey: row.businessActionKey,
    scopeType: row.scopeType,
    scopeId: row.scopeId,
    mode: normalizePolicyMode(row.mode, "optional"),
    flowType: normalizeFlowType(row.flowType, "approval"),
    separationPolicy: normalizeSeparationPolicy(row.separationPolicy, "auto_pass_if_authorized"),
    handlerSource: normalizeHandlerSource(row.handlerSource, "permission"),
    workflowNodes: parseWorkflowNodes(row.workflowNodesJson),
    handlerCanRevise: row.handlerCanRevise,
    requestCanWithdraw: row.requestCanWithdraw,
    requestCanResubmit: row.requestCanResubmit,
    requestCanCancel: row.requestCanCancel,
    requestCanRevise: row.requestCanRevise,
    version: row.version,
    createdByUserId: row.createdByUserId,
    updatedByUserId: row.updatedByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function buildFallbackPolicy(input: {
  businessActionKey: string;
  resourceKey: string | null;
  scopeType: string;
  scopeId: string;
  defaults: WorkflowPolicyDefaults;
}): ResolvedWorkflowPolicy {
  return {
    businessActionKey: input.businessActionKey,
    resourceKey: input.resourceKey,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    mode: normalizeFallbackPolicyMode(input.defaults.mode),
    flowType: normalizeFlowType(input.defaults.flowType, "approval"),
    separationPolicy: normalizeSeparationPolicy(input.defaults.separationPolicy, "auto_pass_if_authorized"),
    handlerSource: normalizeHandlerSource(input.defaults.handlerSource, "permission"),
    workflowNodes: normalizeWorkflowNodes(input.defaults.workflowNodes, normalizeHandlerSource(input.defaults.handlerSource, "permission")),
    activeWorkflowNodeKey: null,
    activeWorkflowNodeKeys: [],
    workflowJoinState: {},
    handlerCanRevise: input.defaults.handlerCanRevise ?? true,
    requestCanWithdraw: input.defaults.requestCanWithdraw ?? true,
    requestCanResubmit: input.defaults.requestCanResubmit ?? true,
    requestCanCancel: input.defaults.requestCanCancel ?? true,
    requestCanRevise: input.defaults.requestCanRevise ?? true,
    source: "defaults",
    policyId: null,
    version: null,
  };
}

function normalizeKey(value: string | null | undefined) { return String(value ?? "").trim() || "legacy.approval"; }

function normalizeScopeId(value: string | number | null | undefined) { return String(value ?? "").trim(); }

function normalizeScopeType(value: string | null | undefined, scopeId: string) {
  const explicit = String(value ?? "").trim();
  if (explicit) return explicit;
  const delimiterIndex = scopeId.indexOf(":");
  if (delimiterIndex > 0) return scopeId.slice(0, delimiterIndex);
  return scopeId ? "custom" : "global";
}

function normalizePolicyMode(value: string | null | undefined, fallback: WorkflowPolicyMode) { return POLICY_MODES.has(value as WorkflowPolicyMode) ? value as WorkflowPolicyMode : fallback; }

function normalizePolicyInputMode(value: string | null | undefined, registration: WorkflowBusinessActionSettingsDto): WorkflowPolicyMode {
  const fallback = registration.eligibility === "workflow_required" ? "required" : "permission_only";
  const mode = normalizePolicyMode(value, fallback);
  if (mode === "direct") return "permission_only";
  if (mode === "optional") return "required";
  return mode;
}

function isWorkflowConfigurable(registration: WorkflowBusinessActionSettingsDto) {
  const runtimeReady = (registration.workflowReadiness.state === "ready" && registration.workflowReadiness.executionPath === "approval_request")
    || (registration.workflowReadiness.state === "native" && registration.workflowReadiness.executionPath === "native_business_state");
  return runtimeReady && Boolean(registration.actionContract && registration.actionContract.workflow.kind !== "not_applicable");
}

function validatePolicyAgainstActionContract(
  registration: WorkflowBusinessActionSettingsDto,
  policy: Pick<ResolvedWorkflowPolicy, "flowType" | "separationPolicy" | "handlerSource">,
): ServiceResult<true> {
  const workflow = registration.actionContract?.workflow;
  if (!workflow || workflow.kind === "not_applicable") return serviceError("该业务行为缺少可配置 ActionContract，不能启用流程", 400);
  const flowTypes = new Set<WorkflowFlowType>(workflow.nodeKinds
    .filter((kind) => kind === "approval" || kind === "review")
    .map((kind) => kind as WorkflowFlowType));
  if (flowTypes.size > 0 && !flowTypes.has(policy.flowType)) return serviceError("该流程类型不在 ActionContract 允许范围内", 400);
  if (workflow.separationPolicies.length > 0 && !workflow.separationPolicies.includes(policy.separationPolicy)) return serviceError("该职责分离策略不在 ActionContract 允许范围内", 400);
  const handlerSources = new Set(workflow.assigneeKinds.map(contractAssigneeToHandlerSource).filter(Boolean));
  if (handlerSources.size > 0 && !handlerSources.has(policy.handlerSource)) return serviceError("该审批人来源不在 ActionContract 允许范围内", 400);
  return serviceOk(true);
}

function validateWorkflowPersistenceContract(
  registration: WorkflowBusinessActionSettingsDto,
): ServiceResult<true> {
  const workflow = registration.actionContract?.workflow;
  if (!workflow || workflow.kind === "not_applicable") return serviceOk(true);
  const modes = new Set(registration.actionContract?.persistence?.supportedPersistenceModes ?? []);
  if (workflow.kind === "configurable" && !modes.has("workflowDraft")) {
    return serviceError("该流程缺少 workflowDraft 写入能力声明，不能启用通用审批草稿", 400);
  }
  if (workflow.kind === "native" && !modes.has("active") && !modes.has("businessDraft")) {
    return serviceError("该流程缺少原生业务状态写入能力声明，不能启用流程", 400);
  }
  return serviceOk(true);
}

function contractAssigneeToHandlerSource(kind: string): WorkflowHandlerSource | null {
  if (kind === "direct_manager" || kind === "submitter_manager" || kind === "previous_actor_manager") return "direct_manager";
  if (kind === "department_owner") return "department_owner";
  if (kind === "permission_holders") return "permission";
  return null;
}

function normalizeFallbackPolicyMode(value: string | null | undefined) { const mode = normalizePolicyMode(value, "permission_only"); return mode === "optional" ? "permission_only" : mode; }

function normalizeFlowType(value: string | null | undefined, fallback: WorkflowFlowType) { return FLOW_TYPES.has(value as WorkflowFlowType) ? value as WorkflowFlowType : fallback; }

function normalizeSeparationPolicy(value: string | null | undefined, fallback: WorkflowSeparationPolicy) { return SEPARATION_POLICIES.has(value as WorkflowSeparationPolicy) ? value as WorkflowSeparationPolicy : fallback; }

function normalizePolicyInputSeparationPolicy(value: string | null | undefined, fallback: WorkflowSeparationPolicy): ServiceResult<WorkflowSeparationPolicy> {
  if (value == null || value === "") return serviceOk(fallback);
  return SEPARATION_POLICIES.has(value as WorkflowSeparationPolicy)
    ? serviceOk(value as WorkflowSeparationPolicy)
    : serviceError("职责分离只能设置为是或否", 400);
}

function normalizeHandlerSource(value: string | null | undefined, fallback: WorkflowHandlerSource): WorkflowHandlerSource {
  const text = String(value ?? "").trim();
  return HANDLER_SOURCES.has(text as WorkflowHandlerSource) ? text as WorkflowHandlerSource : fallback;
}
