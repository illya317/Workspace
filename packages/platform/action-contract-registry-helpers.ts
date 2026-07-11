import type {
  ActionContractMetadata,
  ActionMutationDomainReferenceContract,
} from "./action-contract";
import { getBusinessActionRegistration } from "./business-action-registry";

type DerivedActionFacts = Pick<
  ActionContractMetadata,
  "key" | "version" | "label" | "targetKind" | "resource" | "api" | "workflow" | "display"
>;

export function registeredActionFacts(key: string): DerivedActionFacts {
  const registration = getBusinessActionRegistration(key);
  if (!registration) throw new Error(`Unknown BusinessAction registration: ${key}`);
  const routes = (registration.apiRoutes ?? []).map((route) => `${route.method} ${route.path}`);
  return {
    key: registration.key,
    version: 1,
    label: registration.label,
    targetKind: registration.targetKind,
    resource: {
      resourceKey: registration.resourceKey,
      moduleKey: registration.moduleKey,
      scopeTypes: registration.scopeTypes,
      directPermissionAction: registration.directPermissionAction,
      submitPermissionAction: registration.submitPermissionAction,
      processPermissionAction: registration.processPermissionAction,
    },
    api: {
      commandRoute: routes[0],
      directRoutes: routes,
      envelopeVersion: 1,
    },
    workflow: {
      kind: "not_applicable",
      reason: "当前注册为 permission_only；如需接入流程，必须迁移为共享 typed command adapter 后再修改该声明。",
    },
    display: {
      titleTemplate: registration.label,
      hrefPattern: registration.originHrefPattern,
    },
  };
}

export function registeredWrite(input: {
  key: string;
  activeEntity: string;
  domain: ActionMutationDomainReferenceContract;
  shape?: "full_record" | "field_patch" | "change_set";
  target?: "new_record" | "existing_record" | "mixed";
  targetIdKey?: string;
  commitMode?: "activate" | "copy_to_active" | "apply_patch" | "native_transition";
  strategy?: "active_table_state" | "draft_table" | "file_state";
}): ActionContractMetadata {
  return {
    ...registeredActionFacts(input.key),
    kind: "write",
    payload: { cardinality: "single", shape: input.shape ?? "field_patch", target: input.target ?? "existing_record", targetIdKey: input.targetIdKey },
    persistence: { strategy: input.strategy ?? "active_table_state", activeEntity: input.activeEntity, supportedPersistenceModes: ["active"], defaultMode: "active", commitMode: input.commitMode ?? "apply_patch" },
    domain: input.domain,
  };
}

export function registeredLifecycle(input: {
  key: string;
  activeEntity: string;
  domain: ActionMutationDomainReferenceContract;
  operation: "archive" | "restore" | "activate" | "delete" | "approve" | "submit" | "close" | "cast" | "custom";
  targetIdKey?: string;
  versionKey?: string;
  deleteMode?: "soft" | "hard";
  referencePolicy?: "none" | "guarded" | "domain";
  auditPolicy?: "history" | "event" | "none";
  strategy?: "active_table_state" | "draft_table" | "file_state";
}): ActionContractMetadata {
  const targetIdKey = input.targetIdKey ?? "id";
  return {
    ...registeredActionFacts(input.key),
    kind: "lifecycle",
    payload: { cardinality: "single", shape: "field_patch", target: "existing_record", targetIdKey, versionKey: input.versionKey },
    lifecycle: { operation: input.operation, targetIdKey, versionKey: input.versionKey, deleteMode: input.deleteMode, referencePolicy: input.referencePolicy ?? "domain", auditPolicy: input.auditPolicy ?? "history" },
    persistence: { strategy: input.strategy ?? "active_table_state", activeEntity: input.activeEntity, supportedPersistenceModes: ["active"], defaultMode: "active", commitMode: "native_transition" },
    domain: input.domain,
  };
}

export function registeredGovernance(input: {
  key: string;
  activeEntity: string;
  domain: ActionMutationDomainReferenceContract;
  subject: "organization" | "relationship" | "classification" | "configuration" | "policy";
  scope?: "record" | "resource" | "organization" | "system";
  auditPolicy?: "history" | "event" | "none";
}): ActionContractMetadata {
  return {
    ...registeredActionFacts(input.key),
    kind: "governance",
    payload: { cardinality: "single", shape: "field_patch", target: "mixed", targetIdKey: "id" },
    governance: { subject: input.subject, scope: input.scope ?? "resource", auditPolicy: input.auditPolicy ?? "history" },
    persistence: { strategy: "active_table_state", activeEntity: input.activeEntity, supportedPersistenceModes: ["active"], defaultMode: "active", commitMode: "native_transition" },
    domain: input.domain,
  };
}

export function registeredImport(input: {
  key: string;
  activeEntity: string;
  domain: ActionMutationDomainReferenceContract;
  transport: "json" | "file" | "stream" | "generated" | "scan";
  result?: "records" | "batch" | "data";
  atomicity?: "all_or_nothing" | "best_effort";
}): ActionContractMetadata {
  return {
    ...registeredActionFacts(input.key),
    kind: "exchange",
    payload: { cardinality: "batch", shape: "full_record", target: "mixed", batch: { itemKey: "items", atomicity: input.atomicity ?? "all_or_nothing" } },
    exchange: { direction: "import", transport: input.transport, result: input.result ?? "records", atomicity: input.atomicity ?? "all_or_nothing", partialFailurePolicy: input.atomicity === "best_effort" ? "commit_valid_items" : "reject_all" },
    persistence: { strategy: "active_table_state", activeEntity: input.activeEntity, supportedPersistenceModes: ["active"], defaultMode: "active", commitMode: "native_transition" },
    domain: input.domain,
  };
}
