import type { FieldConfig, TabConfig } from "../../types";
import { extractFK, fk } from "./shared";

const departmentFields: FieldConfig[] = [
  { key: "code", label: "编码", editable: true, required: true },
  { key: "name", label: "名称", editable: true, required: true },
  { key: "alias", label: "别名", editable: true, hidden: true },
  { key: "hierarchyKind", label: "体系", editable: true, type: "select", options: [{ value: "M", label: "管理" }, { value: "G", label: "治理" }] },
  { key: "levelCode", label: "层级", editable: false },
  { key: "level", label: "层级数字", editable: true, type: "number", hidden: true },
  { key: "parentId", label: "上级组织", type: "fk", editable: true },
  { key: "managerPositionId", label: "负责人岗位", type: "fk", editable: false },
  { key: "managerName", label: "组织负责人", editable: false },
];

export const departmentConfig: TabConfig = {
  title: "组织",
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
    { key: "department", label: "组织", kind: "text", queryParam: "keyword", placeholder: "输入组织名称或编码" },
  ],
};

const positionFields: FieldConfig[] = [
  { key: "code", label: "编码", editable: true, required: true },
  { key: "name", label: "名称", editable: true, required: true },
  { key: "alias", label: "别名", editable: true, hidden: true },
  { key: "departmentId", label: "所属组织", type: "fk", editable: true, required: true },
];

export const positionConfig: TabConfig = {
  title: "岗位",
  apiPath: "/api/modules/hr/roster/positions",
  entityType: "Position",
  fields: positionFields,
  fkFields: {
    departmentId: fk("department", "departmentName", "hr.position.department"),
  },
  canCreate: true,
  canDelete: true,
  listGetter: (d: unknown) => (d as Record<string, unknown>).positions as unknown[],
  buildCreateBody: (form) => extractFK(form, ["departmentId"]),
  advancedFilters: [
    { key: "position", label: "岗位", kind: "text", queryParam: "keyword", placeholder: "输入岗位名称或编码" },
  ],
};
