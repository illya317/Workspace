import {
  listBusinessActionRegistrations,
  type BusinessActionRegistration,
} from "../business-action-registry";
import { getActionContractMetadata } from "../action-contract-registry";
import type {
  ActionContractMetadata,
  ActionFormContract,
  ActionFormPersistenceMode,
  ActionWorkflowDisabledBehavior,
  ActionWorkflowEntrySemantics,
  ActionWorkflowMutationPolicy,
} from "../action-contract";
import {
  canEnableWorkflowForReadiness,
  type WorkflowIntent,
  type WorkflowProductStatus,
  type WorkflowProductState,
  type WorkflowReadiness,
  workflowReadinessForAction,
} from "../workflow-action-readiness";
import { effectiveModuleDefinitions } from "../effective-module-registry";

export type WorkflowAdaptationState = "adapted" | "not_adapted";

export type WorkflowBusinessActionSettingsDto = BusinessActionRegistration & {
  moduleLabel: string;
  resourceLabel: string;
  workflowIntent: WorkflowIntent;
  workflowReadiness: WorkflowReadiness;
  productStatus: WorkflowProductStatus;
  workflowProductState: WorkflowProductState;
  workflowAdaptationState: WorkflowAdaptationState;
  actionContract: WorkflowActionContractSettingsDto | null;
};

export type WorkflowActionContractSettingsDto = {
  key: string;
  version: number;
  label: string;
  formAdapterKey?: string;
  form?: Pick<ActionFormContract, "adapterKey" | "payloadVersion" | "surfaceKey" | "snapshotPath" | "persistenceMode" | "supportedPersistenceModes" | "workflowRole" | "editPolicy" | "supportedModes" | "notes">;
  domainValidatorKeys: string[];
  apiEnvelopeVersion?: number;
  payload: Pick<ActionContractMetadata["payload"], "cardinality" | "shape" | "target" | "targetIdKey" | "versionKey" | "notes">;
  persistence: Pick<NonNullable<ActionContractMetadata["persistence"]>, "strategy" | "activeEntity" | "draftEntity" | "supportedPersistenceModes" | "defaultMode" | "statusField" | "commitMode" | "notes"> | null;
  workflow: {
    kind: "not_applicable";
    reason: string;
  } | {
    kind: "configurable" | "native";
    defaultExecutionMode: string;
    canDisable: boolean;
    whenDisabled: ActionWorkflowDisabledBehavior;
    entrySemantics: ActionWorkflowEntrySemantics;
    nodeKinds: readonly string[];
    assigneeKinds: readonly string[];
    approvalModes: readonly string[];
    separationPolicies: readonly string[];
    mutationPolicy: ActionWorkflowMutationPolicy;
  };
};

type WorkflowPolicyStatusRow = WorkflowPolicyStatusLike & {
  businessActionKey: string;
  scopeType?: string | null;
  scopeId?: string | null;
};

interface WorkflowPolicyStatusLike {
  mode?: string | null;
}

const BUSINESS_ACTION_DISPLAY_LABELS = buildBusinessActionDisplayLabels();

export function listWorkflowBusinessActions(): WorkflowBusinessActionSettingsDto[] {
  return listBusinessActionRegistrations().map(enrichBusinessActionRegistration);
}

function buildBusinessActionDisplayLabels() {
  const moduleLabels = new Map<string, string>();
  const resourceLabels = new Map<string, string>();
  for (const definition of effectiveModuleDefinitions) {
    const moduleDef = definition.moduleDef;
    if (!moduleDef) continue;
    moduleLabels.set(moduleDef.key, moduleDef.label);
    if (moduleDef.resourceKey) resourceLabels.set(moduleDef.resourceKey, moduleDef.label);
    for (const child of moduleDef.children ?? []) resourceLabels.set(child.resourceKey, child.label);
    for (const resource of definition.resourceDefs ?? []) {
      if (!resourceLabels.has(resource.key)) resourceLabels.set(resource.key, resource.name);
    }
    for (const space of definition.spaceRegistrations ?? []) {
      if (!resourceLabels.has(space.resourceKey)) resourceLabels.set(space.resourceKey, space.label);
    }
  }
  return { moduleLabels, resourceLabels };
}

function enrichBusinessActionRegistration(registration: BusinessActionRegistration): WorkflowBusinessActionSettingsDto {
  const contract = getActionContractMetadata(registration.key);
  const action = {
    ...registration,
    moduleLabel: BUSINESS_ACTION_DISPLAY_LABELS.moduleLabels.get(registration.moduleKey) ?? registration.moduleKey,
    resourceLabel: BUSINESS_ACTION_DISPLAY_LABELS.resourceLabels.get(registration.resourceKey) ?? registration.resourceKey,
  };
  const readiness = workflowReadinessForAction(action);
  const workflowProductState = deriveContractAwareProductState(readiness.workflowProductState, readiness.workflowReadiness, contract);
  return {
    ...action,
    workflowIntent: readiness.workflowIntent,
    workflowReadiness: readiness.workflowReadiness,
    productStatus: readiness.productStatus,
    workflowProductState,
    workflowAdaptationState: deriveWorkflowAdaptationState(readiness.workflowReadiness, contract),
    actionContract: serializeActionContract(contract),
  };
}

export function withWorkflowPolicyStatus<TAction extends WorkflowBusinessActionSettingsDto>(
  action: TAction,
  policies: readonly WorkflowPolicyStatusRow[],
): TAction {
  const policy = policies.find((row) => (
    row.businessActionKey === action.key
    && (row.scopeType ?? "global") === "global"
    && (row.scopeId ?? "") === ""
  )) ?? null;
  const workflowProductState = policy
    ? canEnableWorkflowForReadiness(action.workflowReadiness)
      ? action.actionContract?.workflow.kind !== "not_applicable"
        ? policyModeIsWorkflow(policy.mode) ? "enabled" : "disabled"
        : "config_error"
      : "config_error"
    : action.workflowProductState;
  const productStatus = policy
    ? canEnableWorkflowForReadiness(action.workflowReadiness)
      ? policyModeIsWorkflow(policy.mode) ? "enabled" : "disabled"
      : "not_integrated"
    : action.productStatus;
  return {
    ...action,
    productStatus,
    workflowProductState,
  };
}

function policyModeIsWorkflow(mode: string | null | undefined) {
  return mode === "required" || mode === "optional";
}

function serializeActionContract(contract: ActionContractMetadata | null): WorkflowActionContractSettingsDto | null {
  if (!contract) return null;
  const persistenceModes = resolvePersistenceModes(contract);
  const persistence = contract.persistence;
  return {
    key: contract.key,
    version: contract.version,
    label: contract.label,
    formAdapterKey: contract.form?.adapterKey,
    form: contract.form ? {
      adapterKey: contract.form.adapterKey,
      payloadVersion: contract.form.payloadVersion,
      surfaceKey: contract.form.surfaceKey,
      snapshotPath: contract.form.snapshotPath,
      persistenceMode: contract.form.persistenceMode,
      supportedPersistenceModes: contract.form.supportedPersistenceModes ?? persistenceModes,
      workflowRole: contract.form.workflowRole,
      editPolicy: contract.form.editPolicy,
      supportedModes: contract.form.supportedModes,
      notes: contract.form.notes,
    } : undefined,
    domainValidatorKeys: "bindings" in contract.domain && contract.domain.bindings
      ? contract.domain.bindings.map((binding) => binding.validatorKey).filter((key): key is string => Boolean(key))
      : contract.domain.validatorKey
        ? [contract.domain.validatorKey]
        : [],
    apiEnvelopeVersion: contract.api?.envelopeVersion,
    payload: {
      cardinality: contract.payload.cardinality,
      shape: contract.payload.shape,
      target: contract.payload.target,
      targetIdKey: contract.payload.targetIdKey,
      versionKey: contract.payload.versionKey,
      notes: contract.payload.notes,
    },
    persistence: persistence ? {
      strategy: persistence.strategy,
      activeEntity: persistence.activeEntity,
      draftEntity: persistence.draftEntity,
      supportedPersistenceModes: persistence.supportedPersistenceModes ?? persistenceModes,
      defaultMode: persistence.defaultMode ?? persistenceModes[0],
      statusField: persistence.statusField,
      commitMode: persistence.commitMode,
      notes: persistence.notes,
    } : null,
    workflow: contract.workflow.kind === "not_applicable"
      ? { kind: "not_applicable", reason: contract.workflow.reason }
      : {
          kind: contract.workflow.kind,
          defaultExecutionMode: contract.workflow.defaultExecutionMode,
          canDisable: contract.workflow.canDisable,
          whenDisabled: contract.workflow.whenDisabled,
          entrySemantics: contract.workflow.entrySemantics,
          nodeKinds: contract.workflow.configuration.nodeKinds,
          assigneeKinds: contract.workflow.configuration.assigneeKinds,
          approvalModes: contract.workflow.configuration.approvalModes,
          separationPolicies: contract.workflow.configuration.separationPolicies,
          mutationPolicy: contract.workflow.mutationPolicy,
        },
  };
}

function resolvePersistenceModes(contract: ActionContractMetadata): readonly ActionFormPersistenceMode[] {
  if (contract.persistence?.supportedPersistenceModes?.length) return contract.persistence.supportedPersistenceModes;
  if (contract.form?.supportedPersistenceModes?.length) return contract.form.supportedPersistenceModes;
  if (contract.persistence?.strategy === "approval_payload") return ["workflowDraft"];
  if (contract.persistence?.strategy === "draft_table") return ["businessDraft"];
  if (!contract.persistence) return [];
  return ["active"];
}

function deriveContractAwareProductState(
  state: WorkflowProductState,
  readiness: WorkflowReadiness,
  contract: ActionContractMetadata | null,
): WorkflowProductState {
  if (!canEnableWorkflowForReadiness(readiness)) return state;
  if (!contract || contract.workflow.kind === "not_applicable") return "config_error";
  return state;
}

function deriveWorkflowAdaptationState(
  readiness: WorkflowReadiness,
  contract: ActionContractMetadata | null,
): WorkflowAdaptationState {
  return canEnableWorkflowForReadiness(readiness) && Boolean(contract && contract.workflow.kind !== "not_applicable")
    ? "adapted"
    : "not_adapted";
}
