import {
  createFkRegistryFromRegistrations,
  defineFkRegistrations,
  type FkRegistration,
} from "@workspace/platform/server/fk-targets";

const HR_FK_REGISTRATIONS: FkRegistration[] = [
  {
    key: "hr.department",
    source: { entity: "Any", field: "departmentId" },
    target: "department",
    nullable: true,
  },
  {
    key: "hr.position",
    source: { entity: "Any", field: "positionId" },
    target: "position",
    nullable: true,
  },
  {
    key: "hr.employee",
    source: { entity: "Any", field: "employeeId" },
    target: "employee",
    nullable: true,
  },
  {
    key: "hr.company",
    source: { entity: "Contract", field: "company" },
    target: "company",
    nullable: true,
  },
  {
    key: "platform.user",
    source: { entity: "Any", field: "userId" },
    target: "user",
    nullable: true,
  },
  {
    key: "hr.positionDescription",
    source: { entity: "Position", field: "positionDescriptionId" },
    target: "positionDescription",
    nullable: true,
  },
  {
    key: "work.plan",
    source: { entity: "EmployeeProject", field: "projectId" },
    target: "project",
    nullable: true,
  },
  {
    key: "hr.edp.position",
    source: { entity: "EDP", field: "positionId" },
    target: "position",
    nullable: false,
  },
  {
    key: "hr.edp.reportTo",
    source: { entity: "EDP", field: "reportTo" },
    target: "employee",
    targetLabel: "直接上级",
    nullable: true,
  },
  {
    key: "hr.employeeProject.project",
    source: { entity: "EmployeeProject", field: "projectId" },
    target: "project",
    targetLabel: "项目",
    nullable: false,
  },
  {
    key: "hr.position.department",
    source: { entity: "Position", field: "departmentId" },
    target: "department",
    targetLabel: "所属部门",
    nullable: false,
  },
];

export const HR_FK_DEFINITIONS = defineFkRegistrations(HR_FK_REGISTRATIONS);
export const HR_FK_REGISTRY = createFkRegistryFromRegistrations(HR_FK_REGISTRATIONS);
