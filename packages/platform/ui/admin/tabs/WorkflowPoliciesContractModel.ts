import type {
  WorkflowFlowType,
  WorkflowHandlerSource,
  WorkflowSeparationPolicy,
} from "./WorkflowPoliciesLabels";

export interface WorkflowActionContractDto {
  key: string;
  version: number;
  label: string;
  formAdapterKey?: string;
  form?: {
    adapterKey: string;
    payloadVersion: number;
    surfaceKey?: string;
    snapshotPath?: string;
    persistenceMode?: WorkflowPersistenceMode;
    supportedPersistenceModes?: readonly WorkflowPersistenceMode[];
    workflowRole?: string;
    editPolicy?: string;
    supportedModes?: readonly string[];
    notes?: string;
  };
  domainValidatorKeys: string[];
  apiEnvelopeVersion?: number;
  payload: {
    cardinality: string;
    shape: string;
    target: string;
    targetIdKey?: string;
    versionKey?: string;
    notes?: string;
  };
  persistence: {
    strategy: string;
    activeEntity: string;
    draftEntity?: string;
    supportedPersistenceModes?: readonly WorkflowPersistenceMode[];
    defaultMode?: WorkflowPersistenceMode;
    statusField?: string;
    commitMode: string;
    notes?: string;
  } | null;
  workflow: {
    kind: "not_applicable";
    reason: string;
  } | {
    kind: "configurable" | "native";
    defaultExecutionMode: string;
    allowDirectOverride: boolean;
    nodeKinds: readonly string[];
    assigneeKinds: readonly string[];
    approvalModes: readonly string[];
    separationPolicies: readonly string[];
    mutationPolicy: {
      handlerCanRevise: boolean;
      requestCanWithdraw: boolean;
      requestCanRevise: boolean;
      requestCanCancel: boolean;
      requestCanResubmit: boolean;
    };
  };
}

export type WorkflowPersistenceMode = "active" | "workflowDraft" | "businessDraft";

export interface WorkflowActionContractSource {
  actionContract: WorkflowActionContractDto | null;
}

export function contractFlowTypeOptions(action: WorkflowActionContractSource, fallback: readonly WorkflowFlowType[]) {
  const workflow = configurableWorkflow(action);
  const supported = new Set(workflow?.nodeKinds
    .filter((kind) => kind === "approval" || kind === "review")
    .map((kind) => kind as WorkflowFlowType));
  return supported.size === 0 ? fallback : fallback.filter((flowType) => supported.has(flowType));
}

export function contractSeparationOptions(action: WorkflowActionContractSource, fallback: readonly WorkflowSeparationPolicy[]) {
  const supported = new Set((configurableWorkflow(action)?.separationPolicies ?? [])
    .map(normalizeContractSeparation)
    .filter((value): value is WorkflowSeparationPolicy => Boolean(value)));
  return supported.size === 0 ? fallback : fallback.filter((policy) => supported.has(policy));
}

export function contractHandlerSourceOptions(action: WorkflowActionContractSource, fallback: readonly WorkflowHandlerSource[]) {
  const supported = new Set((configurableWorkflow(action)?.assigneeKinds ?? [])
    .map(normalizeContractHandlerSource)
    .filter((value): value is WorkflowHandlerSource => Boolean(value)));
  return supported.size === 0 ? fallback : fallback.filter((source) => supported.has(source));
}

export function contractDefaultFlowType(action: WorkflowActionContractSource): WorkflowFlowType | null {
  const kind = configurableWorkflow(action)?.nodeKinds[0];
  return kind === "approval" || kind === "review" ? kind : null;
}

export function contractDefaultSeparationPolicy(action: WorkflowActionContractSource): WorkflowSeparationPolicy | null {
  return normalizeContractSeparation(configurableWorkflow(action)?.separationPolicies[0]);
}

export function contractDefaultHandlerSource(action: WorkflowActionContractSource): WorkflowHandlerSource | null {
  return normalizeContractHandlerSource(configurableWorkflow(action)?.assigneeKinds[0]);
}

function configurableWorkflow(action: WorkflowActionContractSource) {
  const workflow = action.actionContract?.workflow;
  return workflow?.kind === "configurable" || workflow?.kind === "native" ? workflow : null;
}

export function contractPersistenceSummary(action: WorkflowActionContractSource) {
  const persistence = action.actionContract?.persistence;
  if (!persistence) return "未声明";
  const modes = persistence.supportedPersistenceModes?.length
    ? persistence.supportedPersistenceModes
    : ([persistence.defaultMode].filter(Boolean) as WorkflowPersistenceMode[]);
  const modeText = modes.length > 0 ? modes.map(persistenceModeLabel).join(" / ") : "未声明";
  const draftText = persistence.draftEntity ? `草稿：${persistence.draftEntity}` : null;
  return [modeText, `正式：${persistence.activeEntity}`, draftText].filter(Boolean).join(" · ");
}

function persistenceModeLabel(mode: WorkflowPersistenceMode) {
  if (mode === "workflowDraft") return "审批草稿";
  if (mode === "businessDraft") return "业务草稿";
  return "正式提交";
}

function normalizeContractSeparation(value: string | undefined): WorkflowSeparationPolicy | null {
  return value === "independent_required" || value === "auto_pass_if_authorized" ? value : null;
}

function normalizeContractHandlerSource(value: string | undefined): WorkflowHandlerSource | null {
  if (value === "direct_manager" || value === "submitter_manager" || value === "previous_actor_manager") return "direct_manager";
  if (value === "department_owner") return "department_owner";
  if (value === "permission_holders") return "permission";
  return null;
}
