import { tenantHrFieldOptions } from "@workspace/hr/constants/field-options";
import { tenantHrSchoolOptions } from "@workspace/hr/constants/school-options";
import type { TenantPublicConfig } from "@workspace/platform/tenant-config";
import type { ProfileField } from "../types/profile";
import { STANDARD_EMPLOYMENT_AGREEMENT_TYPES } from "./social-insurance";

export const employeeFields: ProfileField[] = [
  { key: "employeeId", label: "员工编号", required: true },
  { key: "name", label: "姓名", required: true },
  { key: "alias", label: "别名", type: "tags" },
  { key: "gender", label: "性别", type: "boolean", booleanLabels: { true: "男", false: "女", unset: "未设置" } },
  { key: "birthDate", label: "出生年月", type: "date" },
  { key: "lunarBirthday", label: "农历生日", type: "lunarBirthday", readOnly: true },
  { key: "ethnicity", label: "民族", type: "select" },
  { key: "hometown", label: "籍贯" },
  { key: "politics", label: "政治面貌", type: "select" },
  { key: "education", label: "学历", type: "select" },
  { key: "title", label: "职称", type: "professionalTitle" },
  { key: "school", label: "毕业院校", type: "school" },
  { key: "major", label: "专业", type: "major" },
  { key: "phone", label: "电话", type: "phone" },
  { key: "workStartDate", label: "参加工作时间", type: "date" },
  { key: "idNumber", label: "身份证号", type: "chineseId" },
  { key: "otherId", label: "其他证件号" },
  { key: "userId", label: "关联账号", type: "fk", entity: "user", fkKey: "platform.user", displayKey: "userName" },
];

export const employmentFields: ProfileField[] = [
  { key: "isActive", label: "在职", type: "boolean", booleanLabels: { true: "在职", false: "离职", unset: "未设置" }, readOnly: true },
  { key: "currentCompany", label: "当前公司", readOnly: true },
  { key: "personnelType", label: "人员类型", type: "select" },
  { key: "rank", label: "职级", type: "select" },
  { key: "title", label: "职务", type: "select" },
  { key: "joinDate", label: "入职日期", type: "date", readOnly: true },
  { key: "officeLocation", label: "办公地点", type: "select" },
  { key: "leaveDate", label: "离职日期", type: "date", readOnly: true },
  { key: "leaveReason", label: "离职原因", type: "select" },
  { key: "leaveNote", label: "补充说明", type: "textarea", span: "wide" },
];

export const contractFields: ProfileField[] = [
  { key: "company", label: "用工主体", type: "fk", entity: "company", fkKey: "hr.company", valueFrom: "name" },
  { key: "legalRelation", label: "法律关系", type: "select" },
  { key: "contractType", label: "协议类型", type: "select" },
  { key: "employmentForm", label: "用工形式", type: "select" },
  { key: "firstContractStartDate", label: "首签开始", type: "date" },
  { key: "firstContractEndDate", label: "首签到期", type: "date" },
  { key: "secondContractStartDate", label: "续签一开始", type: "date" },
  { key: "secondContractEndDate", label: "续签一到期", type: "date" },
  { key: "thirdContractStartDate", label: "续签二开始", type: "date" },
  { key: "thirdContractEndDate", label: "续签二到期", type: "date" },
  { key: "permanentContractDate", label: "无固定期限", type: "date" },
  { key: "expiryDate", label: "到期日期", type: "date", readOnly: true },
  { key: "endDate", label: "结束日期", type: "date", readOnly: true },
];

export const edpFields: ProfileField[] = [
  { key: "reportingCompanyId", label: "汇报公司", type: "fk", entity: "company", fkKey: "hr.company", displayKey: "reportingCompanyName", required: true },
  { key: "departmentId", label: "部门", type: "fk", entity: "department", fkKey: "hr.department", displayKey: "departmentPath", required: true },
  { key: "positionId", label: "岗位", type: "fk", entity: "position", fkKey: "hr.edp.position", displayKey: "positionName", required: true },
  { key: "isPrimary", label: "主岗", type: "boolean" },
  { key: "startDate", label: "开始日期", type: "date" },
  { key: "endDate", label: "结束日期", type: "date" },
  { key: "allocationWeight", label: "岗位投入权重", type: "number", required: true },
  { key: "reportToPositionId", label: "汇报岗位", type: "fk", entity: "position", fkKey: "hr.edp.reportToPosition", displayKey: "reportTo", activeOnly: true },
];

export function withTenantProfileFieldOptions(fields: ProfileField[], config: TenantPublicConfig): ProfileField[] {
  const options = tenantHrFieldOptions(config);
  const schoolNames = tenantHrSchoolOptions(config.hrCatalogs).map((school) => school.value);
  return fields.map((field) => {
    const values = field.type === "professionalTitle" ? options.professionalTitles
      : field.type === "school" ? schoolNames
      : field.key === "ethnicity" ? options.ethnicities
      : field.key === "politics" ? options.politics
      : field.key === "education" ? options.educations
      : field.key === "personnelType" ? options.editablePersonnelTypes
      : field.key === "rank" ? options.ranks
      : field.key === "title" ? options.employmentTitles
      : field.key === "officeLocation" ? options.officeLocations
      : field.key === "leaveReason" ? options.leaveReasons
      : field.key === "insuranceStatus" ? options.insuranceStatuses
      : field.key === "legalRelation" ? options.legalRelations
      : field.key === "contractType" ? [...new Set([...options.contractTypes, ...STANDARD_EMPLOYMENT_AGREEMENT_TYPES])]
      : field.key === "employmentForm" ? options.employmentForms
      : field.options;
    return {
      ...field,
      ...(values ? { options: [...values] } : {}),
      ...(field.key === "ethnicity" ? { commonOptions: [...options.commonEthnicities] } : {}),
    };
  });
}
