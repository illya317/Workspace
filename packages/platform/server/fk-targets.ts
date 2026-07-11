import {
  createFkRegistry,
  type FkDefinition,
  type LifecycleScope,
} from "./fk-registry";
import {
  resolveFkCompany,
  resolveFkDepartment,
  resolveFkEmployee,
  resolveFkFinanceAccount,
  resolveFkMeeting,
  resolveFkMeetingActionCandidate,
  resolveFkMeetingDecision,
  resolveFkPosition,
  resolveFkPositionDescription,
  resolveFkProject,
  resolveFkProjectPlanPhase,
  resolveFkUser,
  searchFkCompanies,
  searchFkDepartments,
  searchFkEmployees,
  searchFkFinanceAccounts,
  searchFkMeetings,
  searchFkMeetingActionCandidates,
  searchFkMeetingDecisions,
  searchFkPositionDescriptions,
  searchFkPositions,
  searchFkProjectPlanPhases,
  searchFkProjects,
  searchFkUsers,
} from "./fk-search";

export type FkTargetKind =
  | "company"
  | "department"
  | "employee"
  | "financeAccount"
  | "meeting"
  | "meetingActionCandidate"
  | "meetingDecision"
  | "position"
  | "positionDescription"
  | "positionResponsibilityNode"
  | "project"
  | "projectPlanPhase"
  | "user"
  | "departmentCollaboration"
  | "workItem"
  | "workPlan"
  | "workOkrCycle";

type FkTargetSpec = Pick<FkDefinition, "target" | "search" | "resolve">;

const targetSpecs: Record<FkTargetKind, FkTargetSpec> = {
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
  financeAccount: {
    target: { entity: "FinanceAccount", label: "财务科目" },
    search: ({ keyword }) => searchFkFinanceAccounts(keyword),
    resolve: resolveFkFinanceAccount,
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

export interface FkRegistration
  extends Pick<
    FkDefinition,
    "key" | "scope" | "source" | "nullable" | "updatePolicy" | "targetDeletePolicy" | "targetArchivePolicy" | "permission"
  > {
  target: FkTargetKind;
  targetLabel?: string;
  defaultLifecycleScope?: LifecycleScope;
}

export type FkRegistrationAdapter = Partial<Pick<FkDefinition, "search" | "resolve">>;

export type FkRegistrationAdapters = Record<string, FkRegistrationAdapter>;

export function defineFkRegistration(input: FkRegistration, adapter?: FkRegistrationAdapter): FkDefinition {
  const spec = targetSpecs[input.target];
  return {
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
    search: adapter?.search ?? spec.search,
    resolve: adapter?.resolve ?? spec.resolve,
  };
}

export function defineFkRegistrations(inputs: FkRegistration[], adapters: FkRegistrationAdapters = {}): FkDefinition[] {
  return inputs.map((input) => defineFkRegistration(input, adapters[input.key]));
}

export function createFkRegistryFromRegistrations(inputs: FkRegistration[], adapters: FkRegistrationAdapters = {}) {
  return createFkRegistry(defineFkRegistrations(inputs, adapters));
}
