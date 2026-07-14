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
  persistableContractRows,
  persistableEdpRows,
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
  const changes = collectChangedFields(id, original, draft, fields);
  if (changes.length === 0) return;
  await requestJson(endpoint, {
    method: "PUT",
    body: JSON.stringify({ changes }),
  });
}

function collectChangedFields(
  id: number,
  original: EditableRecord,
  draft: EditableRecord,
  fields: ProfileField[],
) {
  const changes: Array<{ id: number; field: string; value: unknown }> = [];
  for (const field of fields) {
    if (field.readOnly) continue;
    const next = normalizeValue(draft[field.key]);
    const prev = normalizeValue(original[field.key]);
    if (valuesEqual(next, prev)) continue;
    changes.push({ id, field: field.key, value: next });
  }
  return changes;
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

export async function persistEmployments(profile: EmployeeProfile, rows: EmploymentRow[]) {
  const changes: Array<{ id: number; field: string; value: unknown }> = [];
  for (const row of rows) {
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
      continue;
    }
    if (!row.id) continue;
    const original = profile.employments.find((item) => item.id === row.id);
    if (!original) continue;
    changes.push(...collectChangedFields(
      row.id,
      original as unknown as EditableRecord,
      normalizedRow as unknown as EditableRecord,
      employmentFields,
    ));
  }
  if (changes.length === 0) return;
  await requestJson("/api/modules/hr/roster/employments", {
    method: "PUT",
    body: JSON.stringify({ changes }),
  });
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
  const rowsToPersist = persistableContractRows(rows);
  await requestJson(`/api/modules/hr/roster/employee-profiles/${profile.employee.id}/contracts`, {
    method: "PUT",
    body: JSON.stringify({
      rows: rowsToPersist.map((row) => ({
        id: row.id ?? null,
        employmentId: row.employmentId ?? null,
        ...serializeContract(row),
      })),
    }),
  });
}

export async function persistEdps(profile: EmployeeProfile, rows: EdpRow[]) {
  const rowsToPersist = persistableEdpRows(rows);
  const percentCheck = validateCurrentWorkPercent(rowsToPersist);
  if (!percentCheck.ok) throw new Error(percentCheck.message);
  await requestJson(`/api/modules/hr/roster/employee-profiles/${profile.employee.id}/edps`, {
    method: "PUT",
    body: JSON.stringify({ rows: rowsToPersist }),
  });
}
