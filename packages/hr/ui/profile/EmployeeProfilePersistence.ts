import { requestDirectCommandJson, requestJson } from "@workspace/platform/ui/api-client";
import {
  edpFields,
  employeeFields,
  employmentFields,
} from "@workspace/hr/constants";
import type {
  EdpRow,
  EmployeeProfile,
  EmployeeProfileEmployee,
  EmploymentRow,
  ProfileField,
} from "@workspace/hr/types";
import { validateChineseIdNumber } from "@workspace/hr/utils/identity";
import {
  normalizeFieldValue,
  persistableEdpRows,
  valuesEqual,
  type EditableRecord,
} from "./EmployeeProfileUtils";
export { persistEmployeeAgreements as persistContracts } from "./EmployeeAgreementPersistence";

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
    const next = normalizeFieldValue(field, draft[field.key]);
    const prev = normalizeFieldValue(field, original[field.key]);
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
  for (const row of rows) {
    if (row.isNew) {
      await requestDirectCommandJson("/api/modules/hr/roster/employments", {
        method: "POST",
        body: JSON.stringify({
          employeeId: profile.employee.id,
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
    const rowChanges = collectChangedFields(
      row.id,
      original as unknown as EditableRecord,
      row as unknown as EditableRecord,
      employmentFields,
    );
    if (rowChanges.length > 0) {
      await requestDirectCommandJson(`/api/modules/hr/roster/employee-profiles/${profile.employee.id}/periods/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          entityType: "Employment",
          expectedVersion: original.version,
          patch: Object.fromEntries(rowChanges.map((change) => [change.field, change.value])),
        }),
      });
    }
  }
}

export async function persistEdps(profile: EmployeeProfile, rows: EdpRow[]) {
  const rowsToPersist = persistableEdpRows(rows);
  for (const row of rowsToPersist) {
    if (row.isNew || !row.id) {
      await requestDirectCommandJson(`/api/modules/hr/roster/employee-profiles/${profile.employee.id}/assignments`, {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(
          edpFields.map((field) => [field.key, normalizeFieldValue(field, row[field.key as keyof EdpRow])]),
        )),
      });
      continue;
    }
    const original = profile.edps.find((item) => item.id === row.id);
    if (!original) continue;
    const rowChanges = collectChangedFields(
      row.id,
      original as unknown as EditableRecord,
      row as unknown as EditableRecord,
      edpFields,
    );
    if (rowChanges.length === 0) continue;
    await requestDirectCommandJson(`/api/modules/hr/roster/employee-profiles/${profile.employee.id}/periods/${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        entityType: "EDP",
        expectedVersion: original.version,
        patch: Object.fromEntries(rowChanges.map((change) => [change.field, change.value])),
      }),
    });
  }
}
