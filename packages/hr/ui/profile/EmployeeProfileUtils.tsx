"use client";

import type { ContractRow, ProfileField } from "@workspace/hr/types";
import type { ReferenceOption } from "@workspace/core/ui";

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

export function normalizeValue(value: unknown) {
  if (value === undefined || value === "") return null;
  return value;
}

export function valuesEqual(left: unknown, right: unknown) {
  return normalizeValue(left) === normalizeValue(right);
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

export function normalizeForDirty(value: unknown): unknown {
  if (value === undefined || value === "") return null;
  if (Array.isArray(value)) return value.map((item) => normalizeForDirty(item));
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !["departmentName", "departmentPath", "positionName", "employeeName", "projectName", "projectType", "temporalState", "isNew"].includes(key))
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
