import type { RelationRegistration } from "./server/relation-targets";

export const HR_RELATION_REGISTRATIONS = [
  { key: "hr.department", scope: "hr", source: { entity: "Any", field: "departmentId" }, target: "department", nullable: true, permission: { resourceKey: "hr.roster", action: "read" } },
  { key: "hr.department.parent", scope: "hr", source: { entity: "Department", field: "parentId" }, target: "department", targetLabel: "上级部门", nullable: true, permission: { resourceKey: "hr.roster", action: "read" } },
  { key: "hr.department.manager.position", scope: "hr", source: { entity: "Department", field: "managerPositionId" }, target: "position", targetLabel: "负责人岗位", nullable: true, permission: { resourceKey: "hr.roster", action: "read" } },
  { key: "hr.department.manager.employee", scope: "hr", source: { entity: "DepartmentManagerEmployee", field: "employeeId" }, target: "employee", targetLabel: "部门负责人", nullable: false, permission: { resourceKey: "hr.roster", action: "read" } },
  { key: "hr.position", scope: "hr", source: { entity: "Any", field: "positionId" }, target: "position", nullable: true, permission: { resourceKey: "hr.roster", action: "read" } },
  { key: "hr.position.inDepartment", scope: "hr", source: { entity: "PositionReportOverride", field: "reportToPositionId" }, target: "position", targetLabel: "上级岗位", nullable: true, permission: { resourceKey: "hr.roster", action: "read" } },
  { key: "hr.position.description", scope: "hr", source: { entity: "Position", field: "positionDescriptionId" }, target: "positionDescription", targetLabel: "岗位说明书", nullable: true, permission: { resourceKey: "hr.roster", action: "read" } },
  { key: "hr.employee", scope: "hr", source: { entity: "Any", field: "employeeId" }, target: "employee", nullable: true, permission: { resourceKey: "hr.roster", action: "read" } },
  { key: "hr.company", scope: "hr", source: { entity: "Contract", field: "company" }, target: "company", nullable: true, permission: { resourceKey: "hr.roster", action: "read" } },
  { key: "platform.user", scope: "hr", source: { entity: "Any", field: "userId" }, target: "user", nullable: true, permission: { resourceKey: "hr.roster", action: "read" } },
  { key: "hr.edp.position", scope: "hr", source: { entity: "EDP", field: "positionId" }, target: "position", nullable: false, permission: { resourceKey: "hr.roster", action: "read" } },
  { key: "hr.edp.reportToPosition", scope: "hr", source: { entity: "EDP", field: "reportToPositionId" }, target: "position", targetLabel: "汇报岗位", nullable: true, permission: { resourceKey: "hr.roster", action: "read" } },
  { key: "hr.position.department", scope: "hr", source: { entity: "Position", field: "departmentId" }, target: "department", targetLabel: "所属部门", nullable: false, permission: { resourceKey: "hr.roster", action: "read" } },
] satisfies RelationRegistration[];
