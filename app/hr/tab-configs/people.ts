import type { TabConfig, FieldConfig } from "../types";
import {
  HR_EMPLOYMENT_TITLES,
  HR_ETHNICITIES,
  HR_INSURANCE_STATUSES,
  HR_OFFICE_LOCATIONS,
  HR_PERSONNEL_TYPES,
  HR_RANKS,
} from "@/lib/hr-field-options";
import { extractFK, fk } from "./shared";

const officeLocationOptions = HR_OFFICE_LOCATIONS.map((value) => ({ label: value, value }));
const insuranceStatusOptions = HR_INSURANCE_STATUSES.map((value) => ({ label: value, value }));
const personnelTypeOptions = HR_PERSONNEL_TYPES.map((value) => ({ label: value, value }));
const rankOptions = HR_RANKS.map((value) => ({ label: value, value }));
const edpTitleOptions = HR_EMPLOYMENT_TITLES.map((value) => ({ label: value, value }));
const ethnicityOptions = HR_ETHNICITIES.map((value) => ({ label: value, value }));

const employeeFields: FieldConfig[] = [
  { key: "employeeId", label: "员工编号", editable: false },
  { key: "name", label: "姓名", editable: true, required: true },
  { key: "alias", label: "别名", editable: true },
  { key: "gender", label: "性别", editable: true },
  { key: "birthDate", label: "出生年月", editable: true, type: "date" },
  { key: "ethnicity", label: "民族", editable: true, type: "select", options: ethnicityOptions },
  { key: "hometown", label: "籍贯", editable: true },
  { key: "politics", label: "政治面貌", editable: true },
  { key: "education", label: "学历", editable: true },
  { key: "title", label: "职称", editable: true, type: "professionalTitle", hidden: true },
  { key: "school", label: "毕业院校", editable: true, type: "school" },
  { key: "major", label: "专业", editable: true, type: "major" },
  { key: "phone", label: "电话", editable: true, type: "phone" },
  { key: "workStartDate", label: "参加工作时间", editable: true, type: "date" },
  { key: "idNumber", label: "身份证号", editable: true, type: "chineseId" },
  { key: "otherId", label: "其他证件号", editable: true },
  { key: "userId", label: "关联账号", type: "fk", editable: false },
];

export const employeeConfig: TabConfig = {
  title: "员工信息",
  apiPath: "/api/hr/employees",
  entityType: "Employee",
  fields: employeeFields,
  fkFields: { userId: fk("user", "userName") },
  canCreate: true,
  canDelete: false,
  listGetter: (d: unknown) => (d as Record<string, unknown>).employees as unknown[],
};

const employmentFields: FieldConfig[] = [
  { key: "employeeId", label: "员工", type: "fk", editable: true, required: true },
  { key: "isActive", label: "在职", editable: true, type: "boolean", booleanLabels: { true: "在职", false: "离职" } },
  { key: "currentCompany", label: "当前公司", editable: false },
  { key: "personnelType", label: "人员类型", editable: true, type: "select", options: personnelTypeOptions },
  { key: "rank", label: "职级", editable: true, type: "select", options: rankOptions },
  { key: "title", label: "职务", editable: true, type: "select", options: edpTitleOptions },
  { key: "joinDate", label: "入职日期", editable: true, type: "date" },
  { key: "leaveDate", label: "离职日期", editable: true, type: "date", hidden: true },
  { key: "leaveReason", label: "离职原因", editable: true, hidden: true },
  { key: "officeLocation", label: "办公地点", editable: true, type: "select", options: officeLocationOptions },
];

export const employmentConfig: TabConfig = {
  title: "雇佣关系",
  apiPath: "/api/hr/employments",
  entityType: "Employment",
  fields: employmentFields,
  fkFields: { employeeId: fk("employee", "employeeName") },
  canCreate: true,
  canDelete: false,
  buildCreateBody: (form) => extractFK(form, ["employeeId"]),
  filters: [{ key: "isActive", label: "在职状态", type: "boolean", defaultValue: "true" }],
};

const edpFields: FieldConfig[] = [
  { key: "employeeId", label: "员工", type: "fk", editable: false, required: true },
  { key: "departmentId", label: "部门", type: "fk", editable: false },
  { key: "positionId", label: "岗位", type: "fk", editable: true },
  { key: "isPrimary", label: "主岗", editable: true, type: "boolean" },
  { key: "startDate", label: "开始日期", editable: true, type: "date" },
  { key: "endDate", label: "结束日期", editable: true, type: "date" },
  { key: "reportTo", label: "直接上级", editable: true },
  { key: "workPercent", label: "工作占比", editable: true },
];

export const edpConfig: TabConfig = {
  title: "部门岗位",
  apiPath: "/api/hr/edps",
  entityType: "EDP",
  fields: edpFields,
  fkFields: {
    employeeId: fk("employee", "employeeName"),
    departmentId: fk("department", "departmentName"),
    positionId: fk("position", "positionName"),
  },
  canCreate: true,
  canDelete: true,
  listGetter: (d: unknown) => (d as Record<string, unknown>).positions as unknown[],
  buildCreateBody: (form) => extractFK(form, ["employeeId", "positionId"]),
};

const contractFields: FieldConfig[] = [
  { key: "employeeId", label: "员工编号", type: "fk", editable: false, required: true, displayField: "employeeId" },
  { key: "employeeName", label: "姓名", editable: false, filterEntity: "employee" },
  { key: "company", label: "公司", editable: true, filterEntity: "company" },
  { key: "isPrimary", label: "主合同", type: "boolean", editable: true },
  { key: "insuranceStatus", label: "参保状态", type: "select", editable: true, options: insuranceStatusOptions },
  { key: "legalRelation", label: "法律关系", editable: true },
  { key: "contractType", label: "合同类型", editable: true },
  { key: "employmentForm", label: "用工形式", editable: true },
  { key: "firstContractStartDate", label: "首签开始", editable: true, type: "date" },
  { key: "firstContractEndDate", label: "首签结束", editable: true, type: "date" },
  { key: "secondContractStartDate", label: "续签一开始", editable: true, type: "date" },
  { key: "secondContractEndDate", label: "续签一结束", editable: true, type: "date" },
  { key: "thirdContractStartDate", label: "续签二开始", editable: true, type: "date" },
  { key: "thirdContractEndDate", label: "续签二结束", editable: true, type: "date" },
  { key: "permanentContractDate", label: "无固定期限", editable: true, type: "date" },
  { key: "confidentialityDate", label: "保密协议", editable: true, type: "date" },
  { key: "nonCompeteDate", label: "竞业限制", editable: true, type: "date" },
  { key: "endDate", label: "终止日期", editable: false, type: "date" },
];

export const contractConfig: TabConfig = {
  title: "合同",
  apiPath: "/api/hr/contracts",
  entityType: "contract",
  fields: contractFields,
  canCreate: true,
  canDelete: true,
  fkFields: { employeeId: fk("employee", "employeeName") },
  buildCreateBody: (form) => extractFK(form, ["employeeId"]),
  listGetter: (d: unknown) => (d as Record<string, unknown>).contracts as unknown[],
};
