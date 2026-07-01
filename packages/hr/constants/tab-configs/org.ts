import type { FieldConfig, TabConfig } from "../../types";
import { extractFK, fk } from "./shared";

const companyFields: FieldConfig[] = [
  { key: "code", label: "编码", editable: true, required: true },
  { key: "name", label: "简称", editable: true, required: true },
  { key: "fullName", label: "全称", editable: true },
  { key: "registeredCapital", label: "注册资本", editable: true },
  { key: "unifiedCode", label: "统一社会信用代码", editable: true },
  { key: "bankName", label: "开户行", editable: true },
  { key: "registeredAddress", label: "办公地址", editable: true },
  { key: "registeredDate", label: "注册时间", editable: true, type: "date" },
  { key: "legalPerson", label: "法定代表人", editable: true },
  {
    key: "managementGroup",
    label: "管理体系",
    editable: true,
    type: "select",
    options: [
      { label: "常规体系", value: "常规体系" },
      { label: "GMP", value: "GMP" },
    ],
  },
  {
    key: "codePoolCode",
    label: "编码池",
    editable: true,
    type: "select",
    optionsSource: "companies",
  },
  { key: "isActive", label: "启用", editable: true, type: "boolean", booleanLabels: { true: "启用", false: "禁用" } },
  { key: "sortOrder", label: "排序", editable: true, type: "number" },
];

export const companyConfig: TabConfig = {
  title: "公司信息",
  apiPath: "/api/modules/hr/roster/companies",
  entityType: "Company",
  fields: companyFields,
  advancedFilters: [
    { key: "company", label: "公司", kind: "text", queryParam: "keyword", placeholder: "输入公司名称或编码" },
  ],
  canCreate: true,
  canDelete: true,
  listGetter: (d: unknown) => (d as Record<string, unknown>).companies as unknown[],
};

const companyRelationFields: FieldConfig[] = [
  { key: "parentId", label: "持股方", type: "fk", editable: true, required: true },
  { key: "childId", label: "被持股方", type: "fk", editable: true, required: true },
  { key: "shareRatio", label: "持股比例", editable: true, type: "number" },
  { key: "isConsolidated", label: "并表", editable: true, type: "boolean" },
];

export const companyRelationConfig: TabConfig = {
  title: "公司关系",
  apiPath: "/api/modules/hr/roster/company-relations",
  entityType: "CompanyRelation",
  fields: companyRelationFields,
  fkFields: {
    parentId: fk("company", "parentName", "hr.company"),
    childId: fk("company", "childName", "hr.company"),
  },
  canCreate: true,
  canDelete: true,
  listGetter: (d: unknown) => (d as Record<string, unknown>).relations as unknown[],
  buildCreateBody: (form) => extractFK(form, ["parentId", "childId"]),
  advancedFilters: [
    { key: "company", label: "公司", kind: "text", queryParam: "keyword", placeholder: "输入持股方或被持股方" },
  ],
};

const departmentFields: FieldConfig[] = [
  { key: "code", label: "编码", editable: true, required: true },
  { key: "name", label: "名称", editable: true, required: true },
  { key: "alias", label: "别名", editable: true, hidden: true },
  { key: "level", label: "层级", editable: true, type: "number" },
  { key: "parentId", label: "上级部门", type: "fk", editable: true },
  { key: "managerPositionId", label: "负责人岗位", type: "fk", editable: false },
  { key: "managerName", label: "部门负责人", editable: false },
];

export const departmentConfig: TabConfig = {
  title: "部门",
  apiPath: "/api/modules/hr/roster/departments",
  entityType: "Department",
  fields: departmentFields,
  fkFields: {
    parentId: fk("department", "parentName", "hr.department"),
    managerPositionId: fk("position", "managerPositionName", "hr.department.manager.position"),
  },
  canCreate: true,
  canDelete: true,
  listGetter: (d: unknown) => (d as Record<string, unknown>).departments as unknown[],
  buildCreateBody: (form) => extractFK(form, ["parentId", "managerPositionId"]),
  advancedFilters: [
    { key: "department", label: "部门", kind: "text", queryParam: "keyword", placeholder: "输入部门名称或编码" },
  ],
};

const positionFields: FieldConfig[] = [
  { key: "code", label: "编码", editable: true, required: true },
  { key: "name", label: "名称", editable: true, required: true },
  { key: "alias", label: "别名", editable: true, hidden: true },
  { key: "departmentId", label: "所属部门", type: "fk", editable: true, required: true },
  { key: "positionDescriptionId", label: "岗位说明书", type: "fk", editable: true },
];

export const positionConfig: TabConfig = {
  title: "岗位",
  apiPath: "/api/modules/hr/roster/positions",
  entityType: "Position",
  fields: positionFields,
  fkFields: {
    departmentId: fk("department", "departmentName", "hr.position.department"),
    positionDescriptionId: fk("positionDescription", "positionDescriptionName", "hr.positionDescription"),
  },
  canCreate: true,
  canDelete: true,
  listGetter: (d: unknown) => (d as Record<string, unknown>).positions as unknown[],
  buildCreateBody: (form) => extractFK(form, ["departmentId", "positionDescriptionId"]),
  advancedFilters: [
    { key: "position", label: "岗位", kind: "text", queryParam: "keyword", placeholder: "输入岗位名称或编码" },
  ],
};
