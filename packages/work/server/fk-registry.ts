import {
  createFkRegistryFromRegistrations,
  defineFkRegistrations,
  type FkRegistration,
} from "@workspace/platform/server/fk-targets";

const WORK_FK_REGISTRATIONS: FkRegistration[] = [
  {
    key: "work.plan.parent",
    source: { entity: "Project", field: "parentId" },
    target: "project",
    targetLabel: "上级计划",
    nullable: true,
  },
  {
    key: "work.plan.leadingDepartment",
    source: { entity: "Project", field: "leadingDepartmentId" },
    target: "department",
    targetLabel: "主导部门",
    nullable: false,
  },
  {
    key: "work.plan.member.employee",
    source: { entity: "EmployeeProject", field: "employeeId" },
    target: "employee",
    nullable: false,
  },
  {
    key: "work.plan.member.project",
    source: { entity: "EmployeeProject", field: "projectId" },
    target: "project",
    nullable: false,
  },
];

export const WORK_FK_DEFINITIONS = defineFkRegistrations(WORK_FK_REGISTRATIONS);
export const WORK_FK_REGISTRY = createFkRegistryFromRegistrations(WORK_FK_REGISTRATIONS);
