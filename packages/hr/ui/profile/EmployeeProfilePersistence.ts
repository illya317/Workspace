import { requestJson } from "@workspace/platform/ui/api-client";
import {
  contractFields,
  employeeFields,
  employmentFields,
} from "@workspace/hr/constants";
import type {
  ContractRow,
  EdpRow,
  EmployeeProfile,
  EmployeeProfileEmployee,
  EmploymentRow,
  ProfileField,
} from "@workspace/hr/types";
import { validateChineseIdNumber } from "@workspace/hr/utils/identity";
import {
  normalizeContractRow,
  normalizeValue,
  validateCurrentWorkPercent,
  valuesEqual,
  type EditableRecord,
} from "./EmployeeProfileUtils";

async function updateChangedFields(
  endpoint: string,
  id: number,
  original: EditableRecord,
  draft: EditableRecord,
  fields: ProfileField[],
) {
  for (const field of fields) {
    if (field.readOnly) continue;
    const next = normalizeValue(draft[field.key]);
    const prev = normalizeValue(original[field.key]);
    if (valuesEqual(next, prev)) continue;
    await requestJson(`${endpoint}/${id}`, {
      method: "PUT",
      body: JSON.stringify({ field: field.key, value: next }),
    });
  }
}

export async function persistBasic(
  profile: EmployeeProfile,
  employeeDraft: EmployeeProfileEmployee,
) {
  const idNumberResult = validateChineseIdNumber(employeeDraft.idNumber);
  if (!idNumberResult.ok) throw new Error(idNumberResult.error);
  await updateChangedFields(
    "/api/modules/hr/roster/employees",
    profile.employee.id,
    profile.employee as unknown as EditableRecord,
    employeeDraft as unknown as EditableRecord,
    employeeFields,
  );
}

export async function persistEmployment(profile: EmployeeProfile, row: EmploymentRow) {
  const normalizedRow = row.isActive ? { ...row, leaveDate: null, leaveReason: null, leaveNote: null } : row;
  if (row.isNew) {
    await requestJson("/api/modules/hr/roster/employments", {
      method: "POST",
      body: JSON.stringify({
        employeeId: profile.employee.id,
        isActive: normalizedRow.isActive,
        joinDate: normalizedRow.joinDate,
        leaveDate: normalizedRow.leaveDate,
        leaveReason: normalizedRow.leaveReason,
        leaveNote: normalizedRow.leaveNote,
        officeLocation: normalizedRow.officeLocation,
        personnelType: normalizedRow.personnelType,
        rank: normalizedRow.rank,
        title: normalizedRow.title,
      }),
    });
    return;
  }

  if (!row.id) return;
  const original = profile.employments.find((item) => item.id === row.id);
  if (!original) return;
  await updateChangedFields(
    "/api/modules/hr/roster/employments",
    row.id,
    original as unknown as EditableRecord,
    normalizedRow as unknown as EditableRecord,
    employmentFields,
  );
}

function serializeContract(row: ContractRow) {
  const normalizedRow = normalizeContractRow(row);
  return Object.fromEntries(
    contractFields.map((field) => [
      field.key,
      normalizeValue(normalizedRow[field.key as keyof ContractRow]),
    ]),
  );
}

export async function persistContracts(profile: EmployeeProfile, rows: ContractRow[]) {
  await requestJson(`/api/modules/hr/roster/employee-profiles/${profile.employee.id}/contracts`, {
    method: "PUT",
    body: JSON.stringify({
      rows: rows.map((row) => ({
        id: row.id ?? null,
        employmentId: row.employmentId ?? null,
        ...serializeContract(row),
      })),
    }),
  });
}

export async function persistEdps(profile: EmployeeProfile, rows: EdpRow[]) {
  const percentCheck = validateCurrentWorkPercent(rows);
  if (!percentCheck.ok) throw new Error(percentCheck.message);
  await requestJson(`/api/modules/hr/roster/employee-profiles/${profile.employee.id}/edps`, {
    method: "PUT",
    body: JSON.stringify({ rows }),
  });
}
