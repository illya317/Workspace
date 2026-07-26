import { tenantHrFieldOptions } from "@workspace/hr/constants/field-options";
import type { TenantPublicConfig } from "@workspace/platform/tenant-config";
import type { AdvancedFilterConfig, FieldConfig, FilterConfig, TabConfig } from "../../types";
import { extractFK, fk } from "./shared";

const activeStatusFilter: FilterConfig = { key: "isActive", label: "在职状态", type: "boolean", defaultValue: "true" };
const companyFilter: AdvancedFilterConfig = {
  key: "company",
  label: "公司",
  kind: "fk",
  queryParam: "company",
  entity: "company",
  fkKey: "hr.company",
  returnField: "name",
  placeholder: "搜索公司",
};
const departmentFilter: AdvancedFilterConfig = {
  key: "department",
  label: "部门",
  kind: "fk",
  queryParam: "department",
  entity: "department",
  fkKey: "hr.department",
  returnField: "name",
  placeholder: "搜索部门",
};
const positionFilter: AdvancedFilterConfig = {
  key: "position",
  label: "岗位",
  kind: "fk",
  queryParam: "position",
  entity: "position",
  fkKey: "hr.position",
  returnField: "name",
  placeholder: "搜索岗位",
};

function employeeSubtableFilters() {
  return {
    filters: [activeStatusFilter],
    advancedFilters: [companyFilter, departmentFilter, positionFilter],
  };
}

const employeeFields: FieldConfig[] = [
  { key: "employeeId", label: "员工编号", editable: false, defaultVisible: true },
  { key: "name", label: "姓名", editable: true, required: true, defaultVisible: true },
  { key: "alias", label: "别名", editable: true, type: "tags" },
  { key: "gender", label: "性别", editable: true, defaultVisible: true },
  { key: "birthDate", label: "出生年月", editable: true, type: "date", defaultVisible: true },
  { key: "ethnicity", label: "民族", editable: true, type: "select" },
  { key: "hometown", label: "籍贯", editable: true },
  { key: "politics", label: "政治面貌", editable: true, type: "select", defaultVisible: true },
  { key: "education", label: "学历", editable: true, type: "select", defaultVisible: true },
  { key: "title", label: "职称", editable: true, type: "professionalTitle", hidden: true },
  { key: "school", label: "毕业院校", editable: true, type: "school", defaultVisible: true },
  { key: "major", label: "专业", editable: true, type: "major", defaultVisible: true },
  { key: "phone", label: "电话", editable: true, type: "phone", defaultVisible: true },
  { key: "workStartDate", label: "参加工作时间", editable: true, type: "date", defaultVisible: true },
  { key: "idNumber", label: "身份证号", editable: true, type: "chineseId" },
  { key: "otherId", label: "其他证件号", editable: true },
  { key: "userId", label: "关联账号", type: "fk", editable: false },
];

export const employeeConfig: TabConfig = {
  title: "员工信息",
  apiPath: "/api/modules/hr/roster/employees",
  entityType: "Employee",
  fields: employeeFields,
  fkFields: { userId: fk("user", "userName", "platform.user") },
  ...employeeSubtableFilters(),
  canCreate: false,
  canDelete: false,
  listGetter: (d: unknown) => (d as Record<string, unknown>).employees as unknown[],
};

const employmentFields: FieldConfig[] = [
  { key: "employeeId", label: "员工", type: "fk", editable: false, required: true, defaultVisible: true },
  { key: "isActive", label: "在职", editable: true, type: "boolean", booleanLabels: { true: "在职", false: "离职" }, defaultVisible: true },
  { key: "currentCompany", label: "当前公司", editable: false, defaultVisible: true },
  { key: "personnelType", label: "人员类型", editable: true, type: "select", defaultVisible: true },
  { key: "rank", label: "职级", editable: true, type: "select", defaultVisible: true },
  { key: "title", label: "职务", editable: true, type: "select", defaultVisible: true },
  { key: "joinDate", label: "入职日期", editable: true, type: "date", defaultVisible: true },
  { key: "leaveDate", label: "离职日期", editable: true, type: "date", hidden: true },
  { key: "leaveReason", label: "离职原因", editable: true, type: "select", hidden: true },
  { key: "leaveNote", label: "补充说明", editable: true, type: "textarea", hidden: true },
  { key: "officeLocation", label: "办公地点", editable: true, type: "select", defaultVisible: true },
];

export const employmentConfig: TabConfig = {
  title: "雇佣关系",
  apiPath: "/api/modules/hr/roster/employments",
  entityType: "Employment",
  fields: employmentFields,
  fkFields: {
    employeeId: fk("employee", "employeeName", "hr.employee"),
  },
  canCreate: false,
  canDelete: false,
  buildCreateBody: (form) => extractFK(form, ["employeeId"]),
  ...employeeSubtableFilters(),
};

const edpFields: FieldConfig[] = [
  { key: "employeeId", label: "员工", type: "fk", editable: false, required: true, defaultVisible: true },
  { key: "reportingCompanyId", label: "汇报公司", type: "fk", editable: false, displayField: "reportingCompanyName", defaultVisible: true },
  { key: "departmentId", label: "部门", type: "fk", editable: false, defaultVisible: true },
  { key: "positionId", label: "岗位", type: "fk", editable: false, required: true, defaultVisible: true },
  { key: "isPrimary", label: "主岗", editable: true, type: "boolean", defaultVisible: true },
  { key: "startDate", label: "开始日期", editable: true, type: "date" },
  { key: "endDate", label: "结束日期", editable: true, type: "date" },
  { key: "reportTo", label: "汇报岗位", editable: false, defaultVisible: true },
  { key: "workPercent", label: "工作占比", editable: true, defaultVisible: true },
];

export const edpConfig: TabConfig = {
  title: "部门岗位",
  apiPath: "/api/modules/hr/roster/edps",
  entityType: "EDP",
  fields: edpFields,
  fkFields: {
    employeeId: fk("employee", "employeeName", "hr.employee"),
    reportingCompanyId: fk("company", "reportingCompanyName", "hr.company"),
    departmentId: fk("department", "departmentName", "hr.department"),
    positionId: fk("position", "positionName", "hr.edp.position"),
  },
  canCreate: false,
  canDelete: false,
  listGetter: (d: unknown) => (d as Record<string, unknown>).positions as unknown[],
  buildCreateBody: (form) => extractFK(form, ["employeeId", "positionId"]),
  ...employeeSubtableFilters(),
};

const contractFields: FieldConfig[] = [
  { key: "employeeId", label: "员工编号", type: "fk", editable: false, required: true, displayField: "employeeId", defaultVisible: true },
  { key: "employeeName", label: "姓名", editable: false, filterEntity: "employee", defaultVisible: true },
  { key: "company", label: "公司", editable: true, filterEntity: "company", defaultVisible: true },
  { key: "isPrimary", label: "主合同", type: "boolean", editable: true, defaultVisible: true },
  { key: "insuranceStatus", label: "参保状态", type: "select", editable: true, defaultVisible: true },
  { key: "legalRelation", label: "法律关系", editable: true, type: "select", defaultVisible: true },
  { key: "contractType", label: "合同类型", editable: true, type: "select", defaultVisible: true },
  { key: "employmentForm", label: "用工形式", editable: true, type: "select", defaultVisible: true },
  { key: "firstContractStartDate", label: "首签开始", editable: true, type: "date", defaultVisible: true },
  { key: "firstContractEndDate", label: "首签结束", editable: true, type: "date", defaultVisible: true },
  { key: "secondContractStartDate", label: "续签一开始", editable: true, type: "date" },
  { key: "secondContractEndDate", label: "续签一结束", editable: true, type: "date" },
  { key: "thirdContractStartDate", label: "续签二开始", editable: true, type: "date" },
  { key: "thirdContractEndDate", label: "续签二结束", editable: true, type: "date" },
  { key: "permanentContractDate", label: "无固定期限", editable: true, type: "date" },
  { key: "confidentialityDate", label: "保密协议", editable: true, type: "date" },
  { key: "nonCompeteDate", label: "竞业限制", editable: true, type: "date" },
  { key: "endDate", label: "终止日期", editable: false, type: "date", defaultVisible: true },
];

export const contractConfig: TabConfig = {
  title: "合同",
  apiPath: "/api/modules/hr/roster/contracts",
  entityType: "contract",
  fields: contractFields,
  canCreate: false,
  canDelete: true,
  fkFields: { employeeId: fk("employee", "employeeName", "hr.employee") },
  buildCreateBody: (form) => extractFK(form, ["employeeId"]),
  listGetter: (d: unknown) => (d as Record<string, unknown>).contracts as unknown[],
  ...employeeSubtableFilters(),
};

export function createPeopleTabConfigs(config: TenantPublicConfig) {
  const tenantOptions = tenantHrFieldOptions(config);
  const valuesByField: Record<string, string[]> = {
    ethnicity: tenantOptions.ethnicities,
    politics: tenantOptions.politics,
    education: tenantOptions.educations,
    personnelType: tenantOptions.editablePersonnelTypes,
    rank: tenantOptions.ranks,
    title: tenantOptions.employmentTitles,
    leaveReason: tenantOptions.leaveReasons,
    officeLocation: tenantOptions.officeLocations,
    insuranceStatus: tenantOptions.insuranceStatuses,
    legalRelation: tenantOptions.legalRelations,
    contractType: tenantOptions.contractTypes,
    employmentForm: tenantOptions.employmentForms,
  };
  const resolve = (base: TabConfig): TabConfig => ({
    ...base,
    fields: base.fields.map((field) => {
      const values = valuesByField[field.key];
      return values ? { ...field, options: values.map((value) => ({ label: value, value })) } : field;
    }),
  });
  return {
    employeeConfig: resolve(employeeConfig),
    employmentConfig: resolve(employmentConfig),
    edpConfig: resolve(edpConfig),
    contractConfig: resolve(contractConfig),
  };
}
