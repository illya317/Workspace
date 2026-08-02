export const EMPLOYMENT_PROFILE_CORRECTION_FIELDS = [
  "officeLocation",
  "personnelType",
  "rank",
  "title",
  "leaveReason",
  "leaveNote",
] as const;

export const EMPLOYMENT_LIFECYCLE_FIELDS = [
  "isActive",
  "joinDate",
  "leaveDate",
] as const;

export const EMPLOYMENT_PERIOD_CHANGE_REQUIRES_LIFECYCLE_ERROR =
  "在职状态和雇佣期间只能通过员工“生命周期”变更";

export const EMPLOYMENT_POSITION_OPTIONAL_TITLES = ["顾问", "董事"] as const;

const EMPLOYMENT_PROFILE_CORRECTION_FIELD_SET = new Set<string>(
  EMPLOYMENT_PROFILE_CORRECTION_FIELDS,
);
const EMPLOYMENT_LIFECYCLE_FIELD_SET = new Set<string>(
  EMPLOYMENT_LIFECYCLE_FIELDS,
);
const EMPLOYMENT_POSITION_OPTIONAL_TITLE_SET = new Set<string>(
  EMPLOYMENT_POSITION_OPTIONAL_TITLES,
);

export function isEmploymentProfileCorrectionField(field: string) {
  return EMPLOYMENT_PROFILE_CORRECTION_FIELD_SET.has(field);
}

export function isEmploymentLifecycleField(field: string) {
  return EMPLOYMENT_LIFECYCLE_FIELD_SET.has(field);
}

export function isEmploymentPositionOptionalTitle(value: unknown) {
  return typeof value === "string" && EMPLOYMENT_POSITION_OPTIONAL_TITLE_SET.has(value.trim());
}
