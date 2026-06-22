import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import { validateFkValue } from "@workspace/platform/server/fk-registry";
import { prisma } from "@workspace/platform/server/prisma";
import { isValidDateValue, parseWorkPercent } from "../field-validation";
import { validateEdpReportTo } from "../edp-report-to";
import { HR_FK_REGISTRY } from "../fk-registry";
import { validateCurrentTotal } from "./edp-total-validation";

export const EDP_ALLOWED_FIELDS = ["positionId", "isPrimary", "startDate", "endDate", "reportTo", "workPercent"];

export interface EdpCreateInput {
  employeeId: number;
  departmentId?: number | string | null;
  positionId?: number | string | null;
  isPrimary?: boolean | string | null;
  startDate?: string | null;
  endDate?: string | null;
  reportTo?: string | null;
  workPercent?: string | null;
}

export interface NormalizedEdpRow {
  id: number | null;
  employeeId: number;
  departmentId: number | null;
  positionId: number;
  isPrimary: boolean;
  startDate: string | null;
  endDate: string | null;
  reportTo: string | null;
  workPercent: string | null;
}

export interface EdpFieldUpdateCommand {
  field: string;
  value: unknown;
  data: Record<string, unknown>;
}

function nullableString(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : Number.NaN;
}

function booleanValue(value: unknown) {
  return value === true || value === "true" || value === "1";
}

function validateDateValue(value: unknown) {
  return isValidDateValue(value) ? okCommand(nullableString(value)) : failCommand("日期格式无效");
}

function validateWorkPercentValue(value: unknown) {
  const text = nullableString(value);
  const parsed = parseWorkPercent(text);
  if (Number.isNaN(parsed) || (parsed !== null && (parsed < 0 || parsed > 1))) {
    return failCommand("工作占比必须在 0 到 1 之间");
  }
  return okCommand(text);
}

async function validatePositionValue(value: unknown) {
  const validation = await validateFkValue(HR_FK_REGISTRY, {
    fkKey: "hr.edp.position",
    value,
    requiredLabel: "岗位",
  });
  if (!validation.ok) return failCommand(validation.error, validation.status);
  if (!validation.value) return failCommand("该字段不能为空，请先选择有效的岗位。");
  return okCommand(validation.value);
}

async function positionIdFromName(value: unknown) {
  const name = String(value || "").trim();
  if (!name) return null;
  const position = await prisma.position.findFirst({ where: { name }, select: { id: true } });
  return position?.id ?? Number.NaN;
}

async function departmentIdFromPosition(positionId: number) {
  const position = await prisma.position.findUnique({
    where: { id: positionId },
    select: { departmentId: true },
  });
  return position?.departmentId ?? null;
}

async function validateReportTo(positionId: number | null, reportTo: unknown) {
  const validation = await validateEdpReportTo({ positionId, reportTo });
  return validation.ok ? okCommand(validation.value) : failCommand(validation.error);
}

export async function buildEdpCreateCommand(input: EdpCreateInput): Promise<DomainValidationResult<NormalizedEdpRow>> {
  const position = await validatePositionValue(input.positionId ?? null);
  if (!position.ok) return position;

  const startDate = validateDateValue(input.startDate);
  if (!startDate.ok) return startDate;
  const endDate = validateDateValue(input.endDate);
  if (!endDate.ok) return endDate;
  const workPercent = validateWorkPercentValue(input.workPercent);
  if (!workPercent.ok) return workPercent;
  const reportTo = await validateReportTo(position.data, input.reportTo);
  if (!reportTo.ok) return reportTo;

  return okCommand({
    id: null,
    employeeId: input.employeeId,
    departmentId: await departmentIdFromPosition(position.data),
    positionId: position.data,
    isPrimary: booleanValue(input.isPrimary),
    startDate: startDate.data,
    endDate: endDate.data,
    reportTo: reportTo.data,
    workPercent: workPercent.data,
  });
}

export async function buildEdpFieldUpdateCommand(
  field: string,
  value: unknown,
  recordId: number,
): Promise<DomainValidationResult<EdpFieldUpdateCommand>> {
  if (field === "departmentId" || field === "dept1") {
    return failCommand("部门由岗位自动确定，不能手动修改");
  }

  if (field === "position") {
    const positionId = await positionIdFromName(value);
    if (Number.isNaN(positionId)) return failCommand("岗位不存在", 404);
    return buildEdpFieldUpdateCommand("positionId", positionId, recordId);
  }

  if (field === "positionId") {
    const position = await validatePositionValue(value);
    if (!position.ok) return position;
    const departmentId = await departmentIdFromPosition(position.data);
    return okCommand({
      field,
      value: position.data,
      data: { positionId: position.data, departmentId, reportTo: null },
    });
  }

  if (field === "reportTo") {
    const record = await prisma.eDP.findUnique({ where: { id: recordId }, select: { positionId: true } });
    if (!record) return failCommand("岗位记录不存在", 404);
    const reportTo = await validateReportTo(record.positionId, value);
    if (!reportTo.ok) return reportTo;
    return okCommand({ field, value: reportTo.data, data: { reportTo: reportTo.data } });
  }

  if (field === "startDate" || field === "endDate") {
    const date = validateDateValue(value);
    if (!date.ok) return date;
    return okCommand({ field, value: date.data, data: { [field]: date.data } });
  }

  if (field === "workPercent") {
    const workPercent = validateWorkPercentValue(value);
    if (!workPercent.ok) return workPercent;
    return okCommand({ field, value: workPercent.data, data: { workPercent: workPercent.data } });
  }

  if (field === "isPrimary") {
    const next = booleanValue(value);
    return okCommand({ field, value: next, data: { isPrimary: next } });
  }

  return okCommand({ field, value, data: { [field]: value ?? null } });
}

async function normalizeEdpRow(row: Record<string, unknown>, employeeId: number): Promise<DomainValidationResult<NormalizedEdpRow>> {
  const id = nullableNumber(row.id);
  if (Number.isNaN(id)) return failCommand("岗位记录ID无效");

  const position = await validatePositionValue(row.positionId);
  if (!position.ok) return position;
  const startDate = validateDateValue(row.startDate);
  if (!startDate.ok) return startDate;
  const endDate = validateDateValue(row.endDate);
  if (!endDate.ok) return endDate;
  const workPercent = validateWorkPercentValue(row.workPercent);
  if (!workPercent.ok) return workPercent;
  const reportTo = await validateReportTo(position.data, row.reportTo);
  if (!reportTo.ok) return reportTo;

  return okCommand({
    id,
    employeeId,
    departmentId: await departmentIdFromPosition(position.data),
    positionId: position.data,
    isPrimary: booleanValue(row.isPrimary),
    startDate: startDate.data,
    endDate: endDate.data,
    reportTo: reportTo.data,
    workPercent: workPercent.data,
  });
}

export async function buildSaveEmployeeEdpsCommand(
  employeeId: number,
  rows: unknown,
): Promise<DomainValidationResult<{ rows: NormalizedEdpRow[]; deletedIds: number[] }>> {
  if (!Number.isInteger(employeeId) || employeeId <= 0) return failCommand("员工ID无效");
  if (!Array.isArray(rows)) return failCommand("请求体无效");

  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } });
  if (!employee) return failCommand("员工不存在", 404);

  const normalizedRows: NormalizedEdpRow[] = [];
  for (const row of rows) {
    const normalized = await normalizeEdpRow(row as Record<string, unknown>, employeeId);
    if (!normalized.ok) return failCommand(normalized.issue.message, normalized.issue.status);
    normalizedRows.push(normalized.data);
  }

  const existingRows = await prisma.eDP.findMany({ where: { employeeId }, select: { id: true } });
  const existingIds = new Set(existingRows.map((row) => row.id));
  for (const row of normalizedRows) {
    if (row.id !== null && !existingIds.has(row.id)) return failCommand("岗位记录不属于该员工");
  }

  const totalError = validateCurrentTotal(normalizedRows);
  if (totalError) return failCommand(totalError);

  const keptIds = new Set(normalizedRows.map((row) => row.id).filter((id): id is number => id !== null));
  const deletedIds = existingRows.map((row) => row.id).filter((rowId) => !keptIds.has(rowId));
  return okCommand({ rows: normalizedRows, deletedIds });
}
