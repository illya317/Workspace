import type { ProfileField } from "./types";
import {
  HR_CONTRACT_TYPES,
  HR_EMPLOYMENT_TITLES,
  HR_EDUCATIONS,
  HR_EMPLOYMENT_FORMS,
  HR_ETHNICITIES,
  HR_INSURANCE_STATUSES,
  HR_LEGAL_RELATIONS,
  HR_OFFICE_LOCATIONS,
  HR_PERSONNEL_TYPES,
  HR_POLITICS,
  HR_RANKS,
} from "@/lib/hr-field-options";

export const employeeFields: ProfileField[] = [
  { key: "employeeId", label: "员工编号", required: true, readOnly: true },
  { key: "name", label: "姓名", required: true },
  { key: "alias", label: "别名", type: "tags" },
  { key: "gender", label: "性别", type: "boolean", booleanLabels: { true: "男", false: "女", unset: "未设置" } },
  { key: "birthDate", label: "出生年月", type: "date" },
  { key: "lunarBirthday", label: "农历生日", type: "lunarBirthday", readOnly: true },
  { key: "ethnicity", label: "民族", type: "select", options: HR_ETHNICITIES },
  { key: "hometown", label: "籍贯" },
  { key: "politics", label: "政治面貌", type: "select", options: HR_POLITICS },
  { key: "education", label: "学历", type: "select", options: HR_EDUCATIONS },
  { key: "title", label: "职称", type: "professionalTitle" },
  { key: "school", label: "毕业院校", type: "school" },
  { key: "major", label: "专业", type: "major" },
  { key: "phone", label: "电话", type: "phone" },
  { key: "workStartDate", label: "参加工作时间", type: "date" },
  { key: "idNumber", label: "身份证号", type: "chineseId" },
  { key: "otherId", label: "其他证件号" },
  { key: "userId", label: "关联账号", type: "fk", entity: "user", displayKey: "userName", readOnly: true },
];

export const employmentFields: ProfileField[] = [
  { key: "isActive", label: "在职", type: "boolean", booleanLabels: { true: "在职", false: "离职", unset: "未设置" } },
  { key: "currentCompany", label: "当前公司", readOnly: true },
  { key: "personnelType", label: "人员类型", type: "select", options: HR_PERSONNEL_TYPES },
  { key: "rank", label: "职级", type: "select", options: HR_RANKS },
  { key: "title", label: "职务", type: "select", options: HR_EMPLOYMENT_TITLES },
  { key: "joinDate", label: "入职日期", type: "date" },
  { key: "officeLocation", label: "办公地点", type: "select", options: HR_OFFICE_LOCATIONS },
  { key: "leaveDate", label: "离职日期", type: "date" },
  { key: "leaveReason", label: "离职原因" },
];

export const contractFields: ProfileField[] = [
  { key: "company", label: "公司", type: "fk", entity: "company", valueFrom: "name" },
  { key: "isPrimary", label: "主合同", type: "boolean" },
  { key: "insuranceStatus", label: "参保状态", type: "select", options: HR_INSURANCE_STATUSES },
  { key: "legalRelation", label: "法律关系", type: "select", options: HR_LEGAL_RELATIONS },
  { key: "contractType", label: "合同类型", type: "select", options: HR_CONTRACT_TYPES },
  { key: "employmentForm", label: "用工形式", type: "select", options: HR_EMPLOYMENT_FORMS },
  { key: "firstContractStartDate", label: "首签开始", type: "date" },
  { key: "firstContractEndDate", label: "首签结束", type: "date" },
  { key: "secondContractStartDate", label: "续签一开始", type: "date" },
  { key: "secondContractEndDate", label: "续签一结束", type: "date" },
  { key: "thirdContractStartDate", label: "续签二开始", type: "date" },
  { key: "thirdContractEndDate", label: "续签二结束", type: "date" },
  { key: "permanentContractDate", label: "无固定期限", type: "date" },
  { key: "confidentialityDate", label: "保密协议", type: "date" },
  { key: "nonCompeteDate", label: "竞业限制", type: "date" },
  { key: "endDate", label: "终止日期", type: "date", readOnly: true },
];

export const edpFields: ProfileField[] = [
  { key: "departmentId", label: "部门", type: "fk", entity: "department", displayKey: "departmentPath", readOnly: true },
  { key: "positionId", label: "岗位", type: "fk", entity: "position", displayKey: "positionName" },
  { key: "isPrimary", label: "主岗", type: "boolean" },
  { key: "startDate", label: "开始日期", type: "date" },
  { key: "endDate", label: "结束日期", type: "date" },
  { key: "workPercent", label: "工作占比", type: "percent" },
  { key: "reportTo", label: "直接上级", type: "fk", entity: "employee", valueFrom: "name", activeOnly: true },
];

export const employeeProjectFields: ProfileField[] = [
  { key: "projectId", label: "项目", type: "fk", entity: "project", displayKey: "projectName", required: true },
  { key: "role", label: "角色" },
  { key: "startDate", label: "开始日期", type: "date" },
  { key: "endDate", label: "结束日期", type: "date" },
];
