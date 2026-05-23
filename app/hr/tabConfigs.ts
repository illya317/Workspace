import type { TabConfig, FieldConfig, FKFieldConfig } from "./types";

function extractFK(form: Record<string, unknown>, keys: string[]) {
  const out: Record<string, unknown> = { ...form };
  for (const k of keys) {
    const v = form[k];
    if (v && typeof v === "object" && v !== null && "id" in v) {
      out[k] = (v as any).id;
    }
  }
  return out;
}

const fk = (entity: string, displayField: string): FKFieldConfig => ({ entity, displayField });

// ─── 5-1 员工信息 ──────────────────────────────────────────
const employeeFields: FieldConfig[] = [
  { key: "employeeId", label: "员工编号", editable: true },
  { key: "name", label: "姓名", editable: true },
  { key: "alias", label: "别名", editable: true },
  { key: "gender", label: "性别", editable: true },
  { key: "birthDate", label: "出生年月", editable: true, type: "date" },
  { key: "ethnicity", label: "民族", editable: true },
  { key: "hometown", label: "籍贯", editable: true },
  { key: "politics", label: "政治面貌", editable: true },
  { key: "education", label: "学历", editable: true },
  { key: "title", label: "职称", editable: true },
  { key: "school", label: "毕业院校", editable: true },
  { key: "major", label: "专业", editable: true },
  { key: "phone", label: "电话", editable: true },
  { key: "workStartDate", label: "参加工作时间", editable: true, type: "date" },
  { key: "idNumber", label: "身份证号", editable: true },
  { key: "otherId", label: "其他证件号", editable: true },
];

export const employeeConfig: TabConfig = {
  title: "员工信息",
  apiPath: "/api/hr/employees",
  entityType: "employee",
  fields: employeeFields,
  canCreate: false, // Employee 由导入或专门流程创建，暂不开放前台新建
  canDelete: false,
  listGetter: (d) => d.employees,
};

// ─── 5-2 雇佣关系 ──────────────────────────────────────────
const employmentFields: FieldConfig[] = [
  { key: "employeeId", label: "员工", type: "fk", editable: true },
  { key: "status", label: "状态", editable: true },
  { key: "currentCompany", label: "当前公司", editable: true },
  { key: "joinDate", label: "入职日期", editable: true, type: "date" },
  { key: "leaveDate", label: "离职日期", editable: true, type: "date" },
  { key: "leaveReason", label: "离职原因", editable: true },
  { key: "officeLocation", label: "办公地点", editable: true },
  { key: "attendanceType", label: "考勤类型", editable: true },
  { key: "contracts", label: "合同记录", editable: true, type: "textarea" },
];

export const employmentConfig: TabConfig = {
  title: "雇佣关系",
  apiPath: "/api/hr/employments",
  entityType: "employment",
  fields: employmentFields,
  fkFields: {
    employeeId: fk("employee", "employeeName"),
  },
  canCreate: true,
  canDelete: true,
  buildCreateBody: (form) => extractFK(form, ["employeeId"]),
};

// ─── 5-3 公司信息 ──────────────────────────────────────────
const companyFields: FieldConfig[] = [
  { key: "code", label: "编码", editable: true },
  { key: "name", label: "简称", editable: true },
  { key: "fullName", label: "全称", editable: true },
  { key: "registeredCapital", label: "注册资本", editable: true },
  { key: "unifiedCode", label: "统一社会信用代码", editable: true },
  { key: "bankName", label: "开户行", editable: true },
  { key: "registeredAddress", label: "办公地址", editable: true },
  { key: "registeredDate", label: "注册时间", editable: true, type: "date" },
  { key: "legalPerson", label: "法定代表人", editable: true },
  { key: "queryGroup", label: "查询分组", editable: true, type: "number" },
  { key: "sortOrder", label: "排序", editable: true, type: "number" },
];

export const companyConfig: TabConfig = {
  title: "公司信息",
  apiPath: "/api/hr/companies",
  entityType: "code_company",
  fields: companyFields,
  canCreate: true,
  canDelete: true,
  listGetter: (d) => d.companies,
};

// ─── 5-4 公司关系 ──────────────────────────────────────────
const companyRelationFields: FieldConfig[] = [
  { key: "parentId", label: "持股方", type: "fk", editable: true },
  { key: "childId", label: "被持股方", type: "fk", editable: true },
  { key: "shareRatio", label: "持股比例", editable: true, type: "number" },
  { key: "isConsolidated", label: "是否并表", editable: true, type: "boolean" },
];

export const companyRelationConfig: TabConfig = {
  title: "公司关系",
  apiPath: "/api/hr/company-relations",
  entityType: "company_relation",
  fields: companyRelationFields,
  fkFields: {
    parentId: fk("company", "parentName"),
    childId: fk("company", "childName"),
  },
  canCreate: true,
  canDelete: true,
  listGetter: (d) => d.relations,
  buildCreateBody: (form) => extractFK(form, ["parentId", "childId"]),
};

// ─── 5-5 部门 ──────────────────────────────────────────────
const departmentFields: FieldConfig[] = [
  { key: "code", label: "编码", editable: true },
  { key: "name", label: "名称", editable: true },
  { key: "alias", label: "别名", editable: true },
  { key: "level", label: "层级", editable: true, type: "number" },
  { key: "levelLabel", label: "层级标签", editable: true },
  { key: "parentId", label: "上级部门", type: "fk", editable: true },
  { key: "managerUserId", label: "负责人", type: "fk", editable: true },
];

export const departmentConfig: TabConfig = {
  title: "部门",
  apiPath: "/api/hr/departments",
  entityType: "code_department",
  fields: departmentFields,
  fkFields: {
    parentId: fk("department", "parentName"),
    managerUserId: fk("user", "managerName"),
  },
  canCreate: true,
  canDelete: true,
  listGetter: (d) => d.departments,
  buildCreateBody: (form) => extractFK(form, ["parentId", "managerUserId"]),
};

// ─── 5-6 岗位 ──────────────────────────────────────────────
const positionFields: FieldConfig[] = [
  { key: "code", label: "编码", editable: true },
  { key: "name", label: "名称", editable: true },
  { key: "alias", label: "别名", editable: true },
  { key: "departmentId", label: "所属部门", type: "fk", editable: true },
  { key: "positionDescriptionId", label: "岗位说明书", type: "fk", editable: true },
];

export const positionConfig: TabConfig = {
  title: "岗位",
  apiPath: "/api/hr/positions",
  entityType: "code_position",
  fields: positionFields,
  fkFields: {
    departmentId: fk("department", "departmentName"),
    positionDescriptionId: fk("positionDescription", "positionDescriptionName"),
  },
  canCreate: true,
  canDelete: true,
  listGetter: (d) => d.positions,
  buildCreateBody: (form) => extractFK(form, ["departmentId", "positionDescriptionId"]),
};

// ─── 5-7 EDP ───────────────────────────────────────────────
const edpFields: FieldConfig[] = [
  { key: "employeeId", label: "员工", type: "fk", editable: false },
  { key: "departmentId", label: "部门", type: "fk", editable: true },
  { key: "positionId", label: "岗位", type: "fk", editable: true },
  { key: "isPrimary", label: "主岗", editable: true, type: "boolean" },
  { key: "startDate", label: "开始日期", editable: true, type: "date" },
  { key: "endDate", label: "结束日期", editable: true, type: "date" },
  { key: "personnelType", label: "人员类型", editable: true },
  { key: "rank", label: "职级", editable: true },
  { key: "title", label: "职称", editable: true },
  { key: "reportTo", label: "直接上级", editable: true },
  { key: "reportTo2", label: "第二汇报线", editable: true },
  { key: "workPercent", label: "工作占比", editable: true },
  { key: "isResearch", label: "是否研发", editable: true },
];

export const edpConfig: TabConfig = {
  title: "EDP",
  apiPath: "/api/hr/edps",
  entityType: "employee_position",
  fields: edpFields,
  fkFields: {
    employeeId: fk("employee", "employeeName"),
    departmentId: fk("department", "departmentName"),
    positionId: fk("position", "positionName"),
  },
  canCreate: true,
  canDelete: true,
  listGetter: (d) => d.positions,
  buildCreateBody: (form) => extractFK(form, ["employeeId", "departmentId", "positionId"]),
};

// ─── 5-8 项目 ──────────────────────────────────────────────
const projectFields: FieldConfig[] = [
  { key: "name", label: "项目名称", editable: true },
  { key: "type", label: "类型", editable: true },
  { key: "description", label: "说明", editable: true, type: "textarea" },
  { key: "endDate", label: "截止时间", editable: true, type: "date" },
];

export const projectConfig: TabConfig = {
  title: "项目",
  apiPath: "/api/hr/projects",
  entityType: "project",
  fields: projectFields,
  canCreate: true,
  canDelete: true,
  listGetter: (d) => d.projects,
};

// ─── 5-9 项目员工 ──────────────────────────────────────────
const employeeProjectFields: FieldConfig[] = [
  { key: "employeeId", label: "员工", type: "fk", editable: true },
  { key: "projectId", label: "项目", type: "fk", editable: true },
  { key: "role", label: "角色", editable: true },
  { key: "startDate", label: "开始日期", editable: true, type: "date" },
  { key: "endDate", label: "结束日期", editable: true, type: "date" },
];

export const employeeProjectConfig: TabConfig = {
  title: "项目员工",
  apiPath: "/api/hr/employee-projects",
  entityType: "employee_project",
  fields: employeeProjectFields,
  fkFields: {
    employeeId: fk("employee", "employeeName"),
    projectId: fk("project", "projectName"),
  },
  canCreate: true,
  canDelete: true,
  listGetter: (d) => d.entries,
  buildCreateBody: (form) => {
    // EmployeeProject API POST 期望 employeeId 为字符串 employeeId（工号），projectId 为数字
    const out = extractFK(form, ["projectId"]);
    const emp = form.employeeId as any;
    if (emp && typeof emp === "object" && "subtitle" in emp) {
      out.employeeId = emp.subtitle; // subtitle 是 employeeId（工号）
    } else if (emp && typeof emp === "object" && "name" in emp) {
      out.employeeId = emp.name;
    }
    return out;
  },
};
