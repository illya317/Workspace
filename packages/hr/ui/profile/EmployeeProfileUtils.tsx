"use client";

import { ProfileFieldInput } from "./ProfileFormControls";
import type { ContractRow, ProfileField } from "@workspace/hr/types";
import type { ReferenceOption } from "@workspace/core/ui";
import { normalizeValue } from "./EmployeeProfilePersistenceValues";
export {
  persistableEdpRows,
  validateCurrentAssignments,
} from "./EmployeeAssignmentDraftValidation";
export {
  normalizeContractRow,
  normalizeValue,
  valuesEqual,
} from "./EmployeeProfilePersistenceValues";

export type EditableRecord = Record<string, unknown> & { id?: number; isNew?: boolean };
export type RowBase = { id?: number; isNew?: boolean };
export { createFieldRegionSection } from "./EmployeeProfileFieldRegion";
export {
  createEmptyFormSection,
  createFieldGridSection,
  fieldGridItems,
  createGroupedFieldSections,
  profileFieldSpec,
} from "./EmployeeProfileFieldSpecs";

export function toInputDate(value: unknown) {
  if (!value) return null;
  const text = String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : text;
}

export function todayText() {
  return new Date().toISOString().slice(0, 10);
}

export function isCurrentByEndDate(endDate: unknown) {
  const value = normalizeValue(endDate);
  return !value || String(value) >= todayText();
}

export function isCurrentByDateRange(startDate: unknown, endDate: unknown) {
  const today = todayText();
  const start = normalizeValue(startDate);
  const end = normalizeValue(endDate);
  return (!start || String(start) <= today) && (!end || String(end) >= today);
}

export function isBlankNewContract(row: ContractRow) {
  return Boolean(row.isNew)
    && !row.company
    && !row.insuranceStatus
    && !row.legalRelation
    && !row.contractType
    && !row.employmentForm
    && !row.firstContractStartDate
    && !row.firstContractEndDate
    && !row.secondContractStartDate
    && !row.secondContractEndDate
    && !row.thirdContractStartDate
    && !row.thirdContractEndDate
    && !row.permanentContractDate
    && !row.confidentialityDate
    && !row.nonCompeteDate
    && !row.isPrimary
    && !row.isInsuredHere;
}

export function persistableContractRows(rows: ContractRow[]) {
  return rows.filter((row) => !isBlankNewContract(row));
}

export function formatAlias(value: string | null) {
  if (!value) return "";
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)).join("、") : value;
  } catch {
    return value;
  }
}

export function applyDateFields<T extends EditableRecord>(item: T, fields: ProfileField[]): T {
  const next = { ...item } as EditableRecord;
  for (const field of fields) {
    if (field.type === "date") next[field.key] = toInputDate(next[field.key]);
  }
  return next as T;
}

export function fieldGrid(
  fields: ProfileField[],
  record: EditableRecord,
  disabled: boolean,
  onChange: (key: string, value: unknown, option?: ReferenceOption) => void,
  isFieldDisabled?: (field: ProfileField, record: EditableRecord) => boolean,
  gridClassName = "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
) {
  const defaultGrid = gridClassName === "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
  return (
    <div className={`grid gap-3 ${gridClassName}`}>
      {fields.map((field) => {
        const disabledByStatus = record.isActive === true && (field.key === "leaveDate" || field.key === "leaveReason" || field.key === "leaveNote");
        const disabledByRule = isFieldDisabled?.(field, record) ?? false;
        const wide = field.span === "wide";
        return (
          <div
            key={field.key}
            className={wide && defaultGrid ? "sm:col-span-2 lg:col-span-3" : ""}
          >
            <div className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-500">
              <span>{field.label}</span>
              {field.required ? <span className="text-red-500">*</span> : null}
            </div>
            <ProfileFieldInput
              field={field}
              value={field.type === "lunarBirthday" ? record.birthDate : record[field.key]}
              record={record}
              displayValue={field.displayKey ? String(record[field.displayKey] || "") : undefined}
              disabled={disabled || field.readOnly || disabledByStatus || disabledByRule}
              onChange={onChange}
            />
          </div>
        );
      })}
    </div>
  );
}

export function normalizeForDirty(value: unknown): unknown {
  if (value === undefined || value === "") return null;
  if (Array.isArray(value)) return value.map((item) => normalizeForDirty(item));
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !["departmentName", "departmentPath", "positionName", "employeeName", "projectName", "projectType", "isNew"].includes(key))
      .sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entries.map(([key, item]) => [key, normalizeForDirty(item)]));
  }
  return value;
}

export function sameDraft(left: unknown, right: unknown) {
  return JSON.stringify(normalizeForDirty(left)) === JSON.stringify(normalizeForDirty(right));
}

export function pickFields(fields: ProfileField[], keys: string[]) {
  return keys
    .map((key) => fields.find((field) => field.key === key))
    .filter(Boolean) as ProfileField[];
}

export function contractPeriodEndDate(row: ContractRow) {
  if (row.endDate) return row.endDate;
  const periods = [
    { start: row.firstContractStartDate, end: row.firstContractEndDate },
    { start: row.secondContractStartDate, end: row.secondContractEndDate },
    { start: row.thirdContractStartDate, end: row.thirdContractEndDate },
  ];
  for (let i = periods.length - 1; i >= 0; i--) {
    const period = periods[i];
    if (!period.start && !period.end) continue;
    if (period.start && !period.end) return null;
    return period.end;
  }
  return null;
}

export function updateProfileRow<T extends RowBase>(
  rows: T[],
  index: number,
  field: ProfileField,
  value: unknown,
  option?: ReferenceOption,
) {
  return rows.map((row, rowIndex) => {
    if (rowIndex !== index) return row;
    const next = { ...row, [field.key]: value } as EditableRecord;
    if (field.displayKey) next[field.displayKey] = option?.name ?? null;
    if (field.key === "reportingCompanyId") {
      next.reportingCompanyName = option?.name ?? null;
      next.positionId = null;
      next.positionName = null;
      next.positionReportOverrideId = null;
      next.reportTo = null;
      next.reportToPositionId = null;
    }
    if (field.key === "departmentId") {
      next.departmentName = option?.name ?? null;
      next.departmentPath = option?.name ?? null;
      next.positionId = null;
      next.positionName = null;
      next.positionReportOverrideId = null;
      next.reportTo = null;
      next.reportToPositionId = null;
    }
    if (field.key === "positionId") {
      next.departmentId = option?.departmentId ?? null;
      next.departmentPath = option?.departmentPath ?? null;
      next.departmentName = option?.departmentPath ?? null;
      next.positionName = option?.name ?? null;
      next.positionReportOverrideId = null;
      next.reportTo = null;
      next.reportToPositionId = null;
    }
    return next as T;
  });
}
