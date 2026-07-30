import type { PermissionRegistryActionKey } from "./action-registry";

export type RelationTargetKind =
  | "company" | "department" | "employee" | "employeePosition" | "employeeProject"
  | "financeAccount" | "financeAssetCategory" | "financeGroupAccount" | "financeVoucherItem"
  | "financeConsolidationEntrySource" | "meeting" | "meetingActionCandidate" | "meetingDecision"
  | "party" | "position" | "positionDescription" | "positionDescriptionRevision"
  | "positionResponsibilityNode" | "project" | "projectMembershipChange" | "projectPlanPhase"
  | "user" | "departmentCollaboration" | "workItem" | "workKpiAssignment" | "workPlan" | "workOkrCycle";

export type RelationPolicyPreset = "block" | "confirm_unlink" | "confirm_cascade" | "confirm_unlink_or_cascade" | "auto_cascade_owned" | "retain" | "exempt_with_reason";
export type RelationLifecycleField = "targetDelete" | "targetArchive" | "targetRestore" | "sourceRelationChange";
export type BusinessRequiredPolicy = "required" | "optional";

export interface RelationRegistrationContract {
  key: string;
  scope: string;
  source: { entity: string; field: string; valueKind?: "id" | "semantic" };
  target: RelationTargetKind;
  targetLabel?: string;
  /** Read-only physical nullability fact. It must never be changed by Settings. */
  nullable: boolean;
  /** Business-write baseline; defaults to the physical-safe required/optional value when omitted. */
  businessRequired?: BusinessRequiredPolicy;
  /** Explicit Settings choices for this relation key. Omitted means code-owned. */
  configurableBusinessRequired?: BusinessRequiredPolicy[];
  usage?: "selector" | "governance" | "both";
  semantics?: "owned_child" | "hierarchy" | "reference" | "snapshot" | "virtual";
  lifecycle?: Partial<Record<"targetDelete" | "targetArchive" | "targetRestore" | "sourceRelationChange", RelationPolicyPreset | null>>;
  /**
   * Explicit runtime choices exposed by Settings. Omitted fields remain code-owned.
   * Registrations sharing an adapterKey form one atomic policy group.
   */
  configurableLifecycle?: Partial<Record<RelationLifecycleField, RelationPolicyPreset[]>>;
  physical?: { sourceModel: string; sourceFields: string[]; targetModel: string; targetFields: string[] } | null;
  adapterKey?: string;
  exemptionReason?: string;
  updatePolicy?: "allowed" | "readonly";
  targetDeletePolicy?: "block" | "setNull" | "cascade";
  targetArchivePolicy?: "block" | "setNull" | "cascade";
  defaultLifecycleScope?: "active" | "all" | "archived";
  permission: { resourceKey: string; action: PermissionRegistryActionKey };
}
