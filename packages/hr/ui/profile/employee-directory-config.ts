import type { SurfaceFilterFieldSpec, SurfaceSelectOptionSpec } from "@workspace/core/ui";

export const EMPLOYEE_DIRECTORY_PAGE_SIZE_OPTIONS = [20, 50, 100, 200].map((size) => ({
  value: String(size),
  label: `${size}条/页`,
}));

export const EMPLOYEE_DIRECTORY_FILTER_FIELDS: SurfaceFilterFieldSpec[] = [
  { value: "gender", label: "性别" },
  { value: "education", label: "学历" },
  { value: "positionName", label: "岗位", valueKind: "fk", fkKey: "hr.position", fkReturnField: "name", lifecycleScope: "all", placeholder: "搜索岗位" },
  { value: "directDepartmentName", label: "直属部门", valueKind: "fk", fkKey: "hr.department", fkReturnField: "name", lifecycleScope: "all", placeholder: "搜索部门" },
];

export function employeeDirectoryFilterValueOptions(educations: string[]): Record<string, SurfaceSelectOptionSpec[]> {
  return {
    gender: [
      { value: "男", label: "男" },
      { value: "女", label: "女" },
    ],
    education: educations.map((item) => ({ value: item, label: item })),
  };
}

export const EMPLOYEE_DIRECTORY_DEFAULT_VISIBLE_COLUMNS = [
  "employeeId",
  "name",
  "gender",
  "birthDate",
  "education",
  "positionName",
  "directDepartmentName",
];
