export type ActionContractKind =
  | "write"
  | "lifecycle"
  | "exchange"
  | "governance"
  | "workflow";

export type ActionExecutionMode = "direct" | "workflow" | "native";
export type ActionWorkflowReadiness = "ready" | "native" | "partial" | "not_ready" | "not_applicable";
export type ActionWorkflowExecutionPath = "approval_request" | "native_business_state";
export type ActionWorkflowDisabledBehavior = "direct_write" | "unavailable";
export type ActionWorkflowEntrySemantics = "form_finalization" | "explicit_submission" | "domain_transition";
export type ActionWorkflowHandlerSource = "permission" | "direct_manager" | "department_owner";
export type ActionWorkflowSeparationPolicy = "independent_required" | "auto_pass_if_authorized";
export type ActionWorkflowApprovalMode = "any_one" | "all";
export type ActionWorkflowNodeKind = "approval" | "review" | "notification" | "automation";
export type ActionWorkflowAssigneeKind =
  | "permission_holders"
  | "direct_manager"
  | "department_owner"
  | "submitter_manager"
  | "previous_actor_manager"
  | "position"
  | "employee"
  | "role"
  | "user_group"
  | "users";
export type ActionWorkflowStatus =
  | "draft"
  | "submitted"
  | "committing"
  | "withdrawn"
  | "rejected"
  | "approved"
  | "cancelled"
  | "failed";
export type ActionWorkflowTransition = "submit" | "withdraw" | "cancel" | "resubmit" | "approve" | "reject";
export type ActionPayloadCardinality = "single" | "batch";
export type ActionPayloadShape = "full_record" | "field_patch" | "change_set";
export type ActionPayloadTarget = "new_record" | "existing_record" | "mixed";
export type ActionPayloadAtomicity = "all_or_nothing" | "best_effort";
export type ActionPayloadBatchGrouping = "action" | "scope" | "handler" | "resource" | "field";
export type ActionPersistenceStrategy = "active_table_state" | "approval_payload" | "draft_table" | "file_state";
export type ActionPersistenceCommitMode = "activate" | "copy_to_active" | "apply_patch" | "native_transition";
export type ActionLifecycleOperation = "archive" | "restore" | "activate" | "delete" | "approve" | "submit" | "close" | "cast" | "custom";
export type ActionLifecycleReferencePolicy = "none" | "guarded" | "domain";
export type ActionLifecycleAuditPolicy = "history" | "event" | "none";
export type ActionGovernanceSubject = "organization" | "relationship" | "classification" | "configuration" | "policy";
export type ActionGovernanceScope = "record" | "resource" | "organization" | "system";
export type ActionExchangeTransport = "json" | "file" | "stream" | "generated" | "scan";
export type ActionExchangeResult = "records" | "batch" | "file" | "stream" | "data";

export interface ActionPayloadBatchContract {
  itemKey: string;
  groupBy?: readonly ActionPayloadBatchGrouping[];
  atomicity: ActionPayloadAtomicity;
  partialFailurePolicy?: "reject_all" | "commit_valid_items";
}

export interface ActionPayloadChangeFieldContract {
  field: string;
  label?: string;
  required?: boolean;
}

export interface ActionPayloadContract {
  cardinality: ActionPayloadCardinality;
  shape: ActionPayloadShape;
  target: ActionPayloadTarget;
  targetIdKey?: string;
  versionKey?: string;
  changeFields?: readonly ActionPayloadChangeFieldContract[];
  batch?: ActionPayloadBatchContract;
  notes?: string;
}

export interface ActionPersistenceContract {
  strategy: ActionPersistenceStrategy;
  activeEntity: string;
  draftEntity?: string;
  supportedPersistenceModes?: readonly ActionFormPersistenceMode[];
  defaultMode?: ActionFormPersistenceMode;
  statusField?: string;
  activeStatusValues?: readonly string[];
  pendingStatusValues?: readonly string[];
  commitMode: ActionPersistenceCommitMode;
  notes?: string;
}

export interface ActionLifecycleContract {
  operation: ActionLifecycleOperation;
  targetIdKey: string;
  versionKey?: string;
  fromStatuses?: readonly string[];
  toStatus?: string;
  deleteMode?: "soft" | "hard";
  referencePolicy: ActionLifecycleReferencePolicy;
  auditPolicy: ActionLifecycleAuditPolicy;
  notes?: string;
}

export interface ActionGovernanceContract {
  subject: ActionGovernanceSubject;
  scope: ActionGovernanceScope;
  auditPolicy: ActionLifecycleAuditPolicy;
  notes?: string;
}

export interface ActionImportExchangeContract {
  direction: "import";
  transport: ActionExchangeTransport;
  result: Extract<ActionExchangeResult, "records" | "batch" | "data">;
  atomicity: ActionPayloadAtomicity;
  partialFailurePolicy?: "reject_all" | "commit_valid_items";
  notes?: string;
}

export interface ActionExportExchangeContract {
  direction: "export";
  transport: ActionExchangeTransport;
  result: Extract<ActionExchangeResult, "file" | "stream" | "data">;
  contentTypes?: readonly string[];
  notes?: string;
}

export type ActionContractResult<TData = unknown> =
  | { ok: true; data: TData }
  | { ok: false; error: string; status?: number; field?: string };

export type ActionContractValidator<TInput, TNormalized, TContext = unknown> = (
  input: TInput,
  context: TContext,
) => ActionContractResult<TNormalized> | Promise<ActionContractResult<TNormalized>>;

export type ActionContractCommit<TNormalized, TResult, TContext = unknown> = (
  input: TNormalized,
  context: TContext,
) => ActionContractResult<TResult> | Promise<ActionContractResult<TResult>>;

export interface ActionResourceContract {
  resourceKey: string;
  moduleKey?: string;
  scopeTypes?: readonly string[];
  directPermissionAction?: string;
  submitPermissionAction?: string;
  processPermissionAction?: string;
}

export interface ActionPayloadChange<TValue = unknown> {
  field: string;
  before?: TValue;
  after: TValue;
}

export interface ActionPayloadChangeSetItem<TValue = unknown> {
  targetId: string | number;
  version?: number | null;
  changes: readonly ActionPayloadChange<TValue>[];
}

export type ActionFormPersistenceMode = "active" | "workflowDraft" | "businessDraft";
export type ActionFormWorkflowRole = "none" | "submitter" | "processor" | "observer";
export type ActionFormEditPolicy = "editable" | "readonly" | "workflowConfigured";

export interface ActionFormContract {
  adapterKey: string;
  payloadVersion: number;
  surfaceKey?: string;
  snapshotPath?: string;
  persistenceMode?: ActionFormPersistenceMode;
  supportedPersistenceModes?: readonly ActionFormPersistenceMode[];
  workflowRole?: ActionFormWorkflowRole;
  editPolicy?: ActionFormEditPolicy;
  supportedModes?: readonly ActionExecutionMode[];
  notes?: string;
}

export interface ActionMutationDomainContract<TInput = unknown, TNormalized = TInput, TResult = unknown, TContext = unknown> {
  validate: ActionContractValidator<TInput, TNormalized, TContext>;
  commit: ActionContractCommit<TNormalized, TResult, TContext>;
  normalizeForStorage?: (input: TNormalized, context: TContext) => unknown;
}

export interface ActionProducerDomainContract<TInput = unknown, TNormalized = TInput, TResult = unknown, TContext = unknown> {
  validate?: ActionContractValidator<TInput, TNormalized, TContext>;
  execute: ActionContractCommit<TNormalized, TResult, TContext>;
}

export interface ActionMutationDomainBindingReference {
  validatorKey: string;
  commitKey: string;
  normalizeForStorageKey?: string;
}

export type ActionMutationDomainReferenceContract = (ActionMutationDomainBindingReference & {
  bindings?: never;
  notes?: string;
}) | {
  bindings: readonly [ActionMutationDomainBindingReference, ...ActionMutationDomainBindingReference[]];
  notes?: string;
};

export interface ActionProducerDomainBindingReference {
  validatorKey?: string;
  executeKey: string;
}

export type ActionProducerDomainReferenceContract = (ActionProducerDomainBindingReference & {
  bindings?: never;
  notes?: string;
}) | {
  bindings: readonly [ActionProducerDomainBindingReference, ...ActionProducerDomainBindingReference[]];
  notes?: string;
};

export type ActionDomainContract<TInput = unknown, TNormalized = TInput, TResult = unknown, TContext = unknown> =
  | ActionMutationDomainContract<TInput, TNormalized, TResult, TContext>
  | ActionProducerDomainContract<TInput, TNormalized, TResult, TContext>;

export type ActionDomainReferenceContract = ActionMutationDomainReferenceContract | ActionProducerDomainReferenceContract;

export interface ActionApiContract {
  commandRoute?: string;
  directRoutes?: readonly string[];
  workflowRoutes?: readonly string[];
  envelopeVersion: number;
}

export interface ActionWorkflowMutationPolicy {
  handlerCanRevise: boolean;
  requestCanWithdraw: boolean;
  requestCanRevise: boolean;
  requestCanCancel: boolean;
  requestCanResubmit: boolean;
}

export interface ActionWorkflowRoutingContract {
  handlerSource: ActionWorkflowHandlerSource;
  separationPolicy: ActionWorkflowSeparationPolicy;
  approvalMode: ActionWorkflowApprovalMode;
}

export interface ActionWorkflowAssigneeRuleContract {
  kind: ActionWorkflowAssigneeKind;
  resourceKey?: string;
  action?: string;
  roleKey?: string;
  groupKey?: string;
  userIds?: readonly number[];
}

export interface ActionWorkflowNodeContract {
  key: string;
  label: string;
  kind: ActionWorkflowNodeKind;
  assignee: ActionWorkflowAssigneeRuleContract;
  approvalMode: ActionWorkflowApprovalMode;
  separationPolicy: ActionWorkflowSeparationPolicy;
  bypassable: boolean;
}

export interface ActionWorkflowDefinitionContract {
  version: 1;
  nodes: readonly ActionWorkflowNodeContract[];
  notes?: string;
}

export interface ActionWorkflowConfigurationContract {
  nodeKinds: readonly ActionWorkflowNodeKind[];
  assigneeKinds: readonly ActionWorkflowAssigneeKind[];
  approvalModes: readonly ActionWorkflowApprovalMode[];
  separationPolicies: readonly ActionWorkflowSeparationPolicy[];
  allowNodeAddRemove: boolean;
  allowBypassConditions: boolean;
  maxNodes?: number;
}

export interface ActionWorkflowNotApplicableContract {
  kind: "not_applicable";
  reason: string;
}

interface ActionWorkflowCapableContract<TNormalized = unknown, TResult = unknown, TContext = unknown> {
  canDisable: boolean;
  whenDisabled: ActionWorkflowDisabledBehavior;
  entrySemantics: ActionWorkflowEntrySemantics;
  statuses: readonly ActionWorkflowStatus[];
  transitions: readonly ActionWorkflowTransition[];
  mutationPolicy: ActionWorkflowMutationPolicy;
  routing: ActionWorkflowRoutingContract;
  defaultDefinition: ActionWorkflowDefinitionContract;
  configuration: ActionWorkflowConfigurationContract;
  validateOn: readonly ("draft" | "submit" | "commit")[];
  commit?: ActionContractCommit<TNormalized, TResult, TContext>;
  notes?: string;
}

export interface ActionWorkflowConfigurableContract<TNormalized = unknown, TResult = unknown, TContext = unknown>
  extends ActionWorkflowCapableContract<TNormalized, TResult, TContext> {
  kind: "configurable";
  defaultExecutionMode: "direct" | "workflow";
}

export interface ActionWorkflowNativeContract<TNormalized = unknown, TResult = unknown, TContext = unknown>
  extends ActionWorkflowCapableContract<TNormalized, TResult, TContext> {
  kind: "native";
  defaultExecutionMode: "native";
}

export type ActionWorkflowContract<TNormalized = unknown, TResult = unknown, TContext = unknown> =
  | ActionWorkflowNotApplicableContract
  | ActionWorkflowConfigurableContract<TNormalized, TResult, TContext>
  | ActionWorkflowNativeContract<TNormalized, TResult, TContext>;

export function isActionWorkflowCapable<TNormalized, TResult, TContext>(
  workflow: ActionWorkflowContract<TNormalized, TResult, TContext>,
): workflow is ActionWorkflowConfigurableContract<TNormalized, TResult, TContext> | ActionWorkflowNativeContract<TNormalized, TResult, TContext> {
  return workflow.kind !== "not_applicable";
}

export function actionWorkflowReadiness(workflow: ActionWorkflowContract): Extract<ActionWorkflowReadiness, "ready" | "native" | "not_applicable"> {
  if (workflow.kind === "configurable") return "ready";
  if (workflow.kind === "native") return "native";
  return "not_applicable";
}

export function actionWorkflowExecutionPath(workflow: ActionWorkflowContract): ActionWorkflowExecutionPath | undefined {
  if (workflow.kind === "configurable") return "approval_request";
  if (workflow.kind === "native") return "native_business_state";
  return undefined;
}

export interface ActionDisplayContract<TPayload = unknown, TResult = unknown> {
  title: (input: TPayload) => string;
  summary?: (input: TPayload) => string;
  href?: (input: { payload?: TPayload; result?: TResult; requestId?: number | string | null }) => string;
}

interface ActionContractBase<
  TInput = unknown,
  TNormalized = TInput,
  TResult = unknown,
  TContext = unknown,
> {
  key: string;
  version: 1;
  label: string;
  targetKind?: string;
  resource: ActionResourceContract;
  payload: ActionPayloadContract;
  form?: ActionFormContract;
  api: ActionApiContract;
  workflow: ActionWorkflowContract<TNormalized, TResult, TContext>;
  display: ActionDisplayContract<TNormalized, TResult>;
  notes?: string;
}

export interface ActionWriteContract<TInput = unknown, TNormalized = TInput, TResult = unknown, TContext = unknown>
  extends ActionContractBase<TInput, TNormalized, TResult, TContext> {
  kind: "write";
  persistence: ActionPersistenceContract;
  domain: ActionMutationDomainContract<TInput, TNormalized, TResult, TContext>;
}

export interface ActionLifecycleActionContract<TInput = unknown, TNormalized = TInput, TResult = unknown, TContext = unknown>
  extends ActionContractBase<TInput, TNormalized, TResult, TContext> {
  kind: "lifecycle";
  lifecycle: ActionLifecycleContract;
  persistence: ActionPersistenceContract;
  domain: ActionMutationDomainContract<TInput, TNormalized, TResult, TContext>;
}

export interface ActionGovernanceActionContract<TInput = unknown, TNormalized = TInput, TResult = unknown, TContext = unknown>
  extends ActionContractBase<TInput, TNormalized, TResult, TContext> {
  kind: "governance";
  governance: ActionGovernanceContract;
  persistence: ActionPersistenceContract;
  domain: ActionMutationDomainContract<TInput, TNormalized, TResult, TContext>;
}

export interface ActionWorkflowActionContract<TInput = unknown, TNormalized = TInput, TResult = unknown, TContext = unknown>
  extends ActionContractBase<TInput, TNormalized, TResult, TContext> {
  kind: "workflow";
  persistence: ActionPersistenceContract;
  domain: ActionMutationDomainContract<TInput, TNormalized, TResult, TContext>;
}

export interface ActionImportContract<TInput = unknown, TNormalized = TInput, TResult = unknown, TContext = unknown>
  extends ActionContractBase<TInput, TNormalized, TResult, TContext> {
  kind: "exchange";
  exchange: ActionImportExchangeContract;
  persistence: ActionPersistenceContract;
  domain: ActionMutationDomainContract<TInput, TNormalized, TResult, TContext>;
}

export interface ActionExportContract<TInput = unknown, TNormalized = TInput, TResult = unknown, TContext = unknown>
  extends ActionContractBase<TInput, TNormalized, TResult, TContext> {
  kind: "exchange";
  exchange: ActionExportExchangeContract;
  persistence?: never;
  domain: ActionProducerDomainContract<TInput, TNormalized, TResult, TContext>;
}

export type ActionContract<
  TInput = unknown,
  TNormalized = TInput,
  TResult = unknown,
  TContext = unknown,
> =
  | ActionWriteContract<TInput, TNormalized, TResult, TContext>
  | ActionLifecycleActionContract<TInput, TNormalized, TResult, TContext>
  | ActionGovernanceActionContract<TInput, TNormalized, TResult, TContext>
  | ActionWorkflowActionContract<TInput, TNormalized, TResult, TContext>
  | ActionImportContract<TInput, TNormalized, TResult, TContext>
  | ActionExportContract<TInput, TNormalized, TResult, TContext>;

type ActionContractMetadataVariant<TContract> = TContract extends ActionExportContract<unknown, unknown, unknown, unknown>
  ? Omit<TContract, "domain" | "display"> & {
      domain: ActionProducerDomainReferenceContract;
      display: {
        titleTemplate: string;
        summaryTemplate?: string;
        hrefPattern?: string;
      };
    }
  : TContract extends ActionContract<unknown, unknown, unknown, unknown>
    ? Omit<TContract, "domain" | "display"> & {
      domain: ActionMutationDomainReferenceContract;
      display: {
        titleTemplate: string;
        summaryTemplate?: string;
        hrefPattern?: string;
      };
    }
    : never;

export type ActionContractMetadata = ActionContractMetadataVariant<ActionContract<unknown, unknown, unknown, unknown>>;

export function defineActionContract<
  TInput,
  TNormalized = TInput,
  TResult = unknown,
  TContext = unknown,
>(contract: ActionContract<TInput, TNormalized, TResult, TContext>) {
  return contract;
}

export function defineActionContracts<
  const TContracts extends readonly ActionContract<unknown, unknown, unknown, unknown>[],
>(contracts: TContracts) {
  return contracts;
}

export function defineActionContractMetadata<const TContract extends ActionContractMetadata>(contract: TContract) {
  return contract;
}

export function defineActionContractMetadataList<const TContracts extends readonly ActionContractMetadata[]>(
  contracts: TContracts,
) {
  return contracts;
}

export function getActionContractByKey<
  TContract extends ActionContract<unknown, unknown, unknown, unknown>,
>(contracts: readonly TContract[], key: string) {
  return contracts.find((contract) => contract.key === key) ?? null;
}
