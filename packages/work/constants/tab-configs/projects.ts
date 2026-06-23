import type { FieldConfig, TabConfig } from "../../types";
import { extractFK, fk } from "./shared";

const projectFields: FieldConfig[] = [
  { key: "name", label: "项目名称", editable: true, required: true },
  { key: "leadingDepartmentId", label: "主导部门", type: "fk", editable: true, required: true },
  { key: "description", label: "说明", editable: true, type: "textarea" },
  { key: "plan", label: "项目规划", editable: true, type: "textarea" },
  { key: "goal", label: "项目目标", editable: true, type: "textarea" },
  { key: "milestones", label: "关键里程碑", editable: true, type: "textarea" },
  { key: "budgetAmount", label: "预算金额", editable: true, type: "number" },
  { key: "budgetNote", label: "预算说明", editable: true, type: "textarea" },
  { key: "riskNote", label: "风险说明", editable: true, type: "textarea" },
  { key: "remark", label: "备注", editable: true, type: "textarea" },
  { key: "endDate", label: "截止时间", editable: true, type: "date" },
];

export const projectConfig: TabConfig = {
  title: "项目",
  apiPath: "/api/modules/work/projects",
  entityType: "Project",
  fields: projectFields,
  fkFields: {
    leadingDepartmentId: fk("department", "leadingDepartmentName", "work.projects.leadingDepartment"),
  },
  canCreate: true,
  canDelete: true,
  listGetter: (d: unknown) => (d as Record<string, unknown>).projects as unknown[],
};

const projectMemberFields: FieldConfig[] = [
  { key: "employeeId", label: "员工", type: "fk", editable: false, required: true },
  { key: "projectId", label: "项目", type: "fk", editable: false, required: true },
  { key: "role", label: "角色", editable: false },
  { key: "startDate", label: "开始日期", editable: false, type: "date" },
  { key: "endDate", label: "结束日期", editable: false, type: "date" },
];

export const employeeProjectConfig: TabConfig = {
  title: "项目人员",
  apiPath: "/api/modules/work/projects/members",
  entityType: "EmployeeProject",
  fields: projectMemberFields,
  fkFields: {
    employeeId: fk("employee", "employeeName", "work.projects.member.employee"),
    projectId: fk("project", "projectName", "work.projects.member.project"),
  },
  canCreate: false,
  canDelete: false,
  listGetter: (d: unknown) => (d as Record<string, unknown>).entries as unknown[],
  buildCreateBody: (form) => {
    const out = extractFK(form, ["projectId"]);
    const emp = form.employeeId as Record<string, unknown>;
    if (emp && typeof emp === "object" && "subtitle" in emp) {
      out.employeeNumber = emp.subtitle;
    } else if (emp && typeof emp === "object" && "name" in emp) {
      out.employeeNumber = emp.name;
    }
    return out;
  },
};
