import { requestJson } from "@workspace/platform/ui/api-client";
import {
  employeeFields,
  employmentFields,
} from "@workspace/hr/constants";
import type {
  EmployeeProfile,
  EmployeeProfileEmployee,
  EmploymentRow,
  ProfileField,
} from "@workspace/hr/types";
import { validateChineseIdNumber } from "@workspace/hr/utils/identity";
import {
  normalizeValue,
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
    if (!row.id) {
      await requestJson("/api/modules/hr/roster/employments", {
        method: "POST",
        body: JSON.stringify({
          employeeId: profile.employee.id,
          isActive: row.isActive,
          joinDate: row.joinDate,
          leaveDate: row.leaveDate,
          leaveReason: row.leaveReason,
          leaveNote: row.leaveNote,
          officeLocation: row.officeLocation,
          personnelType: row.personnelType,
          rank: row.rank,
          title: row.title,
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
      row as unknown as EditableRecord,
      employmentFields,
    ));
  }
  if (changes.length === 0) return;
  await requestJson("/api/modules/hr/roster/employments", {
    method: "PUT",
    body: JSON.stringify({ changes }),
  });
}
