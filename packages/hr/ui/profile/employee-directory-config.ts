import type { FieldValueFilterField, SelectFieldOption } from "@workspace/core/ui";
import { HR_EDUCATIONS } from "@workspace/hr/constants";

export const EMPLOYEE_DIRECTORY_PAGE_SIZE_OPTIONS = [20, 50, 100, 200].map((size) => ({
  value: String(size),
  label: `${size}条/页`,
}));

export const EMPLOYEE_DIRECTORY_FILTER_FIELDS: FieldValueFilterField[] = [
  { value: "gender", label: "性别" },
  { value: "education", label: "学历" },
  { value: "positionName", label: "岗位", valueKind: "fk", fkKey: "hr.position", fkReturnField: "name", lifecycleScope: "all", placeholder: "搜索岗位" },
  { value: "directDepartmentName", label: "直属部门", valueKind: "fk", fkKey: "hr.department", fkReturnField: "name", lifecycleScope: "all", placeholder: "搜索部门" },
];

export const EMPLOYEE_DIRECTORY_FILTER_VALUE_OPTIONS: Record<string, SelectFieldOption[]> = {
  gender: [
    { value: "男", label: "男" },
    { value: "女", label: "女" },
  ],
  education: HR_EDUCATIONS.map((item) => ({ value: item, label: item })),
};

export const EMPLOYEE_DIRECTORY_DEFAULT_VISIBLE_COLUMNS = [
  "employeeId",
  "name",
  "gender",
  "birthDate",
  "education",
  "positionName",
  "directDepartmentName",
];
