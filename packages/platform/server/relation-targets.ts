import {
  createRelationCatalog,
  type RelationDefinition,
  type RelationLifecyclePolicies,
  type RelationPhysicalDefinition,
  type RelationSemantics,
  type RelationUsage,
  type SelectorRelationDefinition,
  type LifecycleScope,
  UNCLASSIFIED_RELATION_LIFECYCLE,
} from "./relation-registry";
import {
  resolveFkCompany,
  resolveFkDepartment,
  resolveFkEmployee,
  resolveFkFinanceAccount,
  resolveFkFinanceGroupAccount,
  resolveFkMeeting,
  resolveFkMeetingActionCandidate,
  resolveFkMeetingDecision,
  resolveFkParty,
  resolveFkPosition,
  resolveFkPositionDescription,
  resolveFkProject,
  resolveFkProjectPlanPhase,
  resolveFkUser,
  searchFkCompanies,
  searchFkDepartments,
  searchFkEmployees,
  searchFkFinanceAccounts,
  searchFkFinanceGroupAccounts,
  searchFkMeetings,
  searchFkMeetingActionCandidates,
  searchFkMeetingDecisions,
  searchFkParties,
  searchFkPositionDescriptions,
  searchFkPositions,
  searchFkProjectPlanPhases,
  searchFkProjects,
  searchFkUsers,
} from "./fk-search";

export type RelationTargetKind =
  | "company"
  | "department"
  | "employee"
  | "employeePosition"
  | "employeeProject"
  | "financeAccount"
  | "financeAssetCategory"
  | "financeGroupAccount"
  | "financeVoucherItem"
  | "financeConsolidationEntrySource"
  | "meeting"
  | "meetingActionCandidate"
  | "meetingDecision"
  | "party"
  | "position"
  | "positionDescription"
  | "positionDescriptionRevision"
  | "positionResponsibilityNode"
  | "project"
  | "projectMembershipChange"
  | "projectPlanPhase"
  | "user"
  | "departmentCollaboration"
  | "workItem"
  | "workKpiAssignment"
  | "workPlan"
  | "workOkrCycle";

type RelationTargetSpec = Pick<SelectorRelationDefinition, "target" | "search" | "resolve">;

const targetSpecs: Record<RelationTargetKind, RelationTargetSpec> = {
  company: {
    target: { entity: "Company", label: "公司" },
    search: ({ keyword, lifecycleScope }) => searchFkCompanies(keyword, lifecycleScope),
    resolve: resolveFkCompany,
  },
  department: {
    target: { entity: "Department", label: "部门" },
    search: ({ keyword, lifecycleScope }) => searchFkDepartments(keyword, lifecycleScope),
    resolve: resolveFkDepartment,
  },
  employee: {
    target: { entity: "Employee", label: "员工" },
    search: ({ keyword, lifecycleScope }) => searchFkEmployees(keyword, lifecycleScope),
    resolve: resolveFkEmployee,
  },
  employeePosition: {
    target: { entity: "EDP", label: "员工岗位任职" },
    search: async () => [],
    resolve: async () => null,
  },
  employeeProject: {
    target: { entity: "EmployeeProject", label: "项目成员版本" },
    search: async () => [],
    resolve: async () => null,
  },
  financeAccount: {
    target: { entity: "FinanceAccount", label: "财务科目" },
    search: ({ keyword }) => searchFkFinanceAccounts(keyword),
    resolve: resolveFkFinanceAccount,
  },
  financeAssetCategory: {
    target: { entity: "FinanceAssetCategory", label: "资产分类" },
    search: async () => [],
    resolve: async () => null,
  },
  financeGroupAccount: {
    target: { entity: "FinanceGroupAccount", label: "集团科目" },
    search: ({ keyword }) => searchFkFinanceGroupAccounts(keyword),
    resolve: resolveFkFinanceGroupAccount,
  },
  financeVoucherItem: {
    target: { entity: "FinanceVoucherItem", label: "凭证明细" },
    search: async () => [],
    resolve: async () => null,
  },
  financeConsolidationEntrySource: {
    target: { entity: "FinanceConsolidationEntrySource", label: "抵销业务来源" },
    search: async () => [],
    resolve: async () => null,
  },
  meeting: {
    target: { entity: "Meeting", label: "会议" },
    search: ({ keyword }) => searchFkMeetings(keyword),
    resolve: resolveFkMeeting,
  },
  meetingActionCandidate: {
    target: { entity: "MeetingActionCandidate", label: "会议行动候选" },
    search: ({ keyword }) => searchFkMeetingActionCandidates(keyword),
    resolve: resolveFkMeetingActionCandidate,
  },
  meetingDecision: {
    target: { entity: "MeetingDecision", label: "会议决议" },
    search: ({ keyword }) => searchFkMeetingDecisions(keyword),
    resolve: resolveFkMeetingDecision,
  },
  party: {
    target: { entity: "Party", label: "主体" },
    search: ({ keyword }) => searchFkParties(keyword),
    resolve: resolveFkParty,
  },
  position: {
    target: { entity: "Position", label: "岗位" },
    search: ({ keyword, lifecycleScope }) => searchFkPositions(keyword, lifecycleScope),
    resolve: resolveFkPosition,
  },
  positionDescription: {
    target: { entity: "PositionDescription", label: "岗位说明书" },
    search: ({ keyword }) => searchFkPositionDescriptions(keyword),
    resolve: resolveFkPositionDescription,
  },
  positionDescriptionRevision: {
    target: { entity: "PositionDescriptionRevision", label: "岗位说明书版本" },
    search: async () => [],
    resolve: async () => null,
  },
  positionResponsibilityNode: {
    target: { entity: "PositionResponsibilityNode", label: "岗位职责" },
    search: async () => [],
    resolve: async () => null,
  },
  project: {
    target: { entity: "Project", label: "项目" },
    search: ({ keyword, lifecycleScope }) => searchFkProjects(keyword, lifecycleScope),
    resolve: resolveFkProject,
  },
  projectMembershipChange: {
    target: { entity: "ProjectMembershipChange", label: "项目成员命令" },
    search: async () => [],
    resolve: async () => null,
  },
  projectPlanPhase: {
    target: { entity: "ProjectPlanPhase", label: "项目阶段" },
    search: ({ keyword }) => searchFkProjectPlanPhases(keyword),
    resolve: resolveFkProjectPlanPhase,
  },
  user: {
    target: { entity: "User", label: "账号" },
    search: ({ keyword }) => searchFkUsers(keyword),
    resolve: resolveFkUser,
  },
  departmentCollaboration: {
    target: { entity: "DepartmentCollaboration", label: "部门协作" },
    search: async () => [],
    resolve: async () => null,
  },
  workItem: {
    target: { entity: "WorkItem", label: "工作节点" },
    search: async () => [],
    resolve: async () => null,
  },
  workKpiAssignment: {
    target: { entity: "WorkKpiAssignment", label: "KPI 分配" },
    search: async () => [],
    resolve: async () => null,
  },
  workPlan: {
    target: { entity: "WorkPlan", label: "OKR 计划" },
    search: async () => [],
    resolve: async () => null,
  },
  workOkrCycle: {
    target: { entity: "WorkOkrCycle", label: "OKR 周期" },
    search: async () => [],
    resolve: async () => null,
  },
};

export interface RelationRegistration
  extends Pick<
    SelectorRelationDefinition,
    "key" | "scope" | "source" | "nullable" | "updatePolicy" | "targetDeletePolicy" | "targetArchivePolicy" | "permission"
  > {
  usage?: RelationUsage;
  semantics?: RelationSemantics;
  lifecycle?: Partial<RelationLifecyclePolicies>;
  physical?: RelationPhysicalDefinition | null;
  adapterKey?: string;
  exemptionReason?: string;
  target: RelationTargetKind;
  targetLabel?: string;
  defaultLifecycleScope?: LifecycleScope;
}

export type RelationRegistrationAdapter = Partial<Pick<SelectorRelationDefinition, "search" | "resolve">>;

export type RelationRegistrationAdapters = Record<string, RelationRegistrationAdapter>;

function legacyLifecyclePolicy(policy: "block" | "setNull" | "cascade" | undefined) {
  if (policy === "setNull") return "confirm_unlink" as const;
  if (policy === "cascade") return "confirm_cascade" as const;
  return policy ?? null;
}

export function relationMetadataFromRegistration(input: RelationRegistration): RelationDefinition {
  const spec = targetSpecs[input.target];
  const usage = input.usage ?? "selector";
  const semantics = input.semantics ?? (input.source.entity === "Any" || input.source.valueKind === "semantic" ? "virtual" : "reference");
  const inferredPhysical = semantics === "virtual"
    ? undefined
    : {
        sourceModel: input.source.entity,
        sourceFields: [input.source.field],
        targetModel: spec.target.entity,
        targetFields: ["id"],
      };
  return {
    key: input.key,
    scope: input.scope,
    usage,
    semantics,
    physical: input.physical === null ? undefined : input.physical ?? inferredPhysical,
    lifecycle: {
      ...UNCLASSIFIED_RELATION_LIFECYCLE,
      targetDelete: input.lifecycle?.targetDelete ?? legacyLifecyclePolicy(input.targetDeletePolicy),
      targetArchive: input.lifecycle?.targetArchive ?? legacyLifecyclePolicy(input.targetArchivePolicy),
      targetRestore: input.lifecycle?.targetRestore ?? null,
      sourceRelationChange: input.lifecycle?.sourceRelationChange ?? null,
    },
    adapterKey: input.adapterKey,
    exemptionReason: input.exemptionReason,
  };
}

export function defineRelationRegistration(
  input: RelationRegistration,
  adapter?: RelationRegistrationAdapter,
): SelectorRelationDefinition {
  if (input.usage === "governance") {
    throw new Error(`governance-only relation cannot be materialized as a selector: ${input.key}`);
  }
  const spec = targetSpecs[input.target];
  return {
    ...relationMetadataFromRegistration(input),
    usage: input.usage === "both" ? "both" : "selector",
    key: input.key,
    scope: input.scope,
    source: input.source,
    target: {
      ...spec.target,
      label: input.targetLabel ?? spec.target.label,
    },
    nullable: input.nullable,
    updatePolicy: input.updatePolicy,
    targetDeletePolicy: input.targetDeletePolicy,
    targetArchivePolicy: input.targetArchivePolicy,
    defaultLifecycleScope: input.defaultLifecycleScope ?? "active",
    permission: input.permission,
    adapterKey: input.adapterKey ?? (adapter ? input.key : undefined),
    search: adapter?.search ?? spec.search,
    resolve: adapter?.resolve ?? spec.resolve,
  };
}

export function defineRelationRegistrations(
  inputs: RelationRegistration[],
  adapters: RelationRegistrationAdapters = {},
): SelectorRelationDefinition[] {
  return inputs.map((input) => defineRelationRegistration(input, adapters[input.key]));
}

export function createRelationCatalogFromRegistrations(
  inputs: RelationRegistration[],
  adapters: RelationRegistrationAdapters = {},
) {
  return createRelationCatalog(defineRelationRegistrations(inputs, adapters));
}

export type FkTargetKind = RelationTargetKind;
export type FkRegistration = RelationRegistration;
export type FkRegistrationAdapter = RelationRegistrationAdapter;
export type FkRegistrationAdapters = RelationRegistrationAdapters;
export const defineFkRegistration = defineRelationRegistration;
export const defineFkRegistrations = defineRelationRegistrations;
export const createFkRegistryFromRegistrations = createRelationCatalogFromRegistrations;
