import {
  createFkRegistry,
  type FkDefinition,
  type LifecycleScope,
} from "./fk-registry";
import {
  resolveFkCompany,
  resolveFkDepartment,
  resolveFkEmployee,
  resolveFkPosition,
  resolveFkPositionDescription,
  resolveFkProject,
  resolveFkUser,
  searchFkCompanies,
  searchFkDepartments,
  searchFkEmployees,
  searchFkPositionDescriptions,
  searchFkPositions,
  searchFkProjects,
  searchFkUsers,
} from "./fk-search";

export type FkTargetKind =
  | "company"
  | "department"
  | "employee"
  | "position"
  | "positionDescription"
  | "project"
  | "user";

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
  project: {
    target: { entity: "Project", label: "项目" },
    search: ({ keyword, lifecycleScope }) => searchFkProjects(keyword, lifecycleScope),
    resolve: resolveFkProject,
  },
  user: {
    target: { entity: "User", label: "账号" },
    search: ({ keyword }) => searchFkUsers(keyword),
    resolve: resolveFkUser,
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

export function defineFkRegistration(input: FkRegistration): FkDefinition {
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
    search: spec.search,
    resolve: spec.resolve,
  };
}

export function defineFkRegistrations(inputs: FkRegistration[]): FkDefinition[] {
  return inputs.map(defineFkRegistration);
}

export function createFkRegistryFromRegistrations(inputs: FkRegistration[]) {
  return createFkRegistry(defineFkRegistrations(inputs));
}
