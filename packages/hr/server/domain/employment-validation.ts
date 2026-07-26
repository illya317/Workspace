import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import { getTenantProfile } from "@workspace/platform/server/tenant-config";
import {
  EMPLOYMENT_PERIOD_CHANGE_REQUIRES_LIFECYCLE_ERROR,
  EMPLOYMENT_PROFILE_CORRECTION_FIELDS,
  isEmploymentLifecycleField,
  isEmploymentProfileCorrectionField,
} from "@workspace/hr/constants/employee-temporal-write-policy";
import { validateEmploymentOption } from "../field-validation";
import {
  buildHrPageDraftEnvelopeCommand,
  type HrPageDraftInput,
} from "./page-draft-validation";

export const EMPLOYMENT_ALLOWED_FIELDS = [...EMPLOYMENT_PROFILE_CORRECTION_FIELDS];

export interface EmploymentFieldUpdateCommand {
  field: string;
  value: unknown;
}

export const VIRTUAL_EMPLOYEE_PERSONNEL_TYPE_MANAGED_ERROR =
  "虚拟员工身份只能由 Agent provisioning 管理";

export function validateEmploymentPersonnelTypeTransition(
  currentValue: unknown,
  nextValue: unknown,
): DomainValidationResult<{ value: unknown }> {
  const virtualPersonnelType = getTenantProfile().hr.options.virtualEmployeePersonnelType;
  if (
    currentValue === virtualPersonnelType
    || nextValue === virtualPersonnelType
  ) {
    return failCommand(VIRTUAL_EMPLOYEE_PERSONNEL_TYPE_MANAGED_ERROR);
  }
  return okCommand({ value: nextValue });
}

export async function buildEmploymentFieldUpdateCommand(
  field: string,
  value: unknown,
  _id?: number,
): Promise<DomainValidationResult<EmploymentFieldUpdateCommand>> {
  if (field === "employeeId") return failCommand("雇佣记录员工不可修改");
  if (isEmploymentLifecycleField(field)) {
    return failCommand(EMPLOYMENT_PERIOD_CHANGE_REQUIRES_LIFECYCLE_ERROR, 409, field);
  }
  if (!isEmploymentProfileCorrectionField(field)) {
    return failCommand("字段不支持在雇佣资料中修正", 400, field);
  }
  if (field === "personnelType") {
    const personnelType = validateEmploymentPersonnelTypeTransition(null, value);
    if (!personnelType.ok) return personnelType;
  }
  const optionResult = validateEmploymentOption(field, value);
  if (!optionResult) return failCommand("字段值不在允许范围内");
  return okCommand({ field, value });
}

export async function buildEmploymentPageDraftCommand(input: HrPageDraftInput) {
  const envelope = buildHrPageDraftEnvelopeCommand(input);
  if (!envelope.ok) return envelope;
  const changes = [];
  for (const change of envelope.data.changes) {
    const field = await buildEmploymentFieldUpdateCommand(change.field, change.value, change.id);
    if (!field.ok) return field;
    changes.push({ id: change.id, field: field.data.field, value: field.data.value });
  }
  return okCommand({ userId: envelope.data.userId, changes });
}
