"use client";

import {
  getFieldGridCellClassName,
  getFieldGridLabelClassName,
  getFieldGridValueClassName,
} from "@workspace/core/ui";
import { ProfileFieldInput } from "./ProfileFormControls";
import { FieldRegion } from "./EmployeeProfileFieldRegion";
import type { ContractRow, EdpRow, ProfileField } from "@workspace/hr/types";
import type { FkFieldOption } from "@workspace/core/ui";

export type EditableRecord = Record<string, unknown> & { id?: number; isNew?: boolean };
export type RowBase = { id?: number; isNew?: boolean };
export { FieldRegion } from "./EmployeeProfileFieldRegion";

export function toInputDate(value: unknown) {
  if (!value) return null;
  const text = String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : text;
}

export function normalizeValue(value: unknown) {
  if (value === undefined || value === "") return null;
  return value;
}

export function valuesEqual(left: unknown, right: unknown) {
  return normalizeValue(left) === normalizeValue(right);
}

export function todayText() {
  return new Date().toISOString().slice(0, 10);
}

export function isCurrentByEndDate(endDate: unknown) {
  const value = normalizeValue(endDate);
  return !value || String(value) >= todayText();
}

export function parseWorkPercent(value: unknown) {
  const normalized = normalizeValue(value);
  if (normalized === null) return null;
  const text = String(normalized).trim();
  const numberText = text.endsWith("%") ? text.slice(0, -1).trim() : text;
  const parsed = Number(numberText);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return text.endsWith("%") ? parsed / 100 : parsed;
}

export function validateCurrentWorkPercent(rows: EdpRow[]) {
  const currentRows = rows.filter((row) => isCurrentByEndDate(row.endDate));
  if (currentRows.length === 0) return { ok: true, message: "" };
  const values = currentRows.map((row) => parseWorkPercent(row.workPercent));
  if (values.some((value) => value === null || Number.isNaN(value))) {
    return { ok: false, message: "当前岗位工作占比必须填写，且合计必须为 100%。" };
  }
  const total = values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  if (Math.abs(total - 1) > 0.0001) {
    return { ok: false, message: `当前岗位工作占比合计为 ${(total * 100).toFixed(2)}%，必须为 100%。` };
  }
  return { ok: true, message: "" };
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
  onChange: (key: string, value: unknown, option?: FkFieldOption) => void,
  isFieldDisabled?: (field: ProfileField, record: EditableRecord) => boolean,
  gridClassName = "grid-cols-3",
) {
  const defaultGrid = gridClassName === "grid-cols-3";
  return (
    <div className={`grid gap-2 ${gridClassName}`}>
      {fields.map((field) => {
        const disabledByStatus = record.isActive === true && (field.key === "leaveDate" || field.key === "leaveReason" || field.key === "leaveNote");
        const disabledByRule = isFieldDisabled?.(field, record) ?? false;
        const wide = field.span === "wide";
        return (
          <div
            key={field.key}
            className={getFieldGridCellClassName(wide && defaultGrid ? "col-span-3" : "")}
          >
            <div className={getFieldGridLabelClassName()}>
              {field.label}
              {field.required && <span className="ml-0.5 text-red-500">*</span>}
            </div>
            <div className={getFieldGridValueClassName()}>
              <ProfileFieldInput
                field={field}
                value={field.type === "lunarBirthday" ? record.birthDate : record[field.key]}
                displayValue={field.displayKey ? String(record[field.displayKey] || "") : undefined}
                disabled={disabled || field.readOnly || disabledByStatus || disabledByRule}
                onChange={onChange}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function groupedFieldGrid(
  groups: Array<{ title: string; fields: ProfileField[] }>,
  record: EditableRecord,
  disabled: boolean,
  onChange: (key: string, value: unknown, option?: FkFieldOption) => void,
) {
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <FieldRegion key={group.title} title={group.title}>
          {fieldGrid(group.fields, record, disabled, onChange, undefined, "grid-cols-3")}
        </FieldRegion>
      ))}
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

export function normalizeContractRow<T extends ContractRow>(row: T): T {
  const periodEndDates = [row.firstContractEndDate, row.secondContractEndDate, row.thirdContractEndDate].filter(Boolean);
  if (!row.endDate || (!row.permanentContractDate && !periodEndDates.includes(row.endDate))) return row;
  return { ...row, endDate: null };
}

export function updateProfileRow<T extends RowBase>(
  rows: T[],
  index: number,
  field: ProfileField,
  value: unknown,
  option?: FkFieldOption,
) {
  return rows.map((row, rowIndex) => {
    if (rowIndex !== index) return row;
    const next = { ...row, [field.key]: value } as EditableRecord;
    if (field.displayKey) next[field.displayKey] = option?.name ?? null;
    if (field.key === "positionId") {
      next.departmentId = option?.departmentId ?? null;
      next.departmentPath = option?.departmentPath ?? null;
      next.departmentName = option?.departmentPath ?? null;
    }
    return next as T;
  });
}
