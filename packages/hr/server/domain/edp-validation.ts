import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import { validateFkValue } from "@workspace/platform/server/fk-registry";
import { prisma } from "@workspace/platform/server/prisma";
import { validateEdpReportTo } from "../edp-report-to";
import { isValidDateValue, parseWorkPercent } from "../field-validation";
import { HR_FK_REGISTRY } from "../fk-registry";
import { parseContracts } from "../contracts";
import {
  resolveEdpPositionAssignment,
  validateActiveCompanyId,
  validateActiveManagementDepartmentId,
  type EdpPositionAssignment,
} from "./position-report-override-validation";
import { validateCurrentTotal } from "./edp-total-validation";

export const EDP_ALLOWED_FIELDS = [
  "reportingCompanyId",
  "departmentId",
  "positionId",
  "positionReportOverrideId",
  "isPrimary",
  "startDate",
  "endDate",
  "reportTo",
  "workPercent",
];

export interface EdpCreateInput {
  employeeId: number;
  reportingCompanyId?: number | string | null;
  departmentId?: number | string | null;
  positionId?: number | string | null;
  positionReportOverrideId?: number | string | null;
  isPrimary?: boolean | string | null;
  startDate?: string | null;
  endDate?: string | null;
  reportTo?: string | null;
  workPercent?: string | null;
}

export interface NormalizedEdpRow {
  id: number | null;
  employeeId: number;
  reportingCompanyId: number | null;
  departmentId: number | null;
  positionId: number;
  positionReportOverrideId: number | null;
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

async function validateDepartmentValue(value: unknown) {
  const departmentId = nullableNumber(value);
  if (departmentId === null) return okCommand(null);
  if (Number.isNaN(departmentId)) return failCommand("部门无效");
  const validation = await validateActiveManagementDepartmentId(departmentId);
  if (!validation.ok) return failCommand(validation.issue.message, validation.issue.status);
  return okCommand(departmentId);
}

function primaryCompanyName(contractsJson: string | null, fallback: string | null) {
  const contracts = parseContracts(contractsJson);
  const primaryCompany = String(contracts.find((contract) => contract.isPrimary === true && contract.company)?.company ?? "");
  const firstCompany = String(contracts.find((contract) => contract.company)?.company ?? "");
  return primaryCompany || firstCompany || fallback || null;
}

async function findCompanyByNameOrCode(value: string) {
  const text = value.trim();
  if (!text) return null;
  return prisma.company.findFirst({
    where: { OR: [{ code: text }, { name: text }, { fullName: text }] },
    select: { id: true, isActive: true },
  });
}

async function defaultReportingCompanyId(employeeId: number) {
  const employments = await prisma.employment.findMany({
    where: { employeeId },
    select: { contracts: true, currentCompany: true, isActive: true },
    orderBy: [{ isActive: "desc" }, { id: "desc" }],
  });
  for (const employment of employments) {
    const companyName = primaryCompanyName(employment.contracts, employment.currentCompany);
    if (!companyName) continue;
    const company = await findCompanyByNameOrCode(companyName);
    if (company?.isActive) return company.id;
  }
  return null;
}

async function validateReportingCompanyValue(value: unknown, employeeId: number) {
  const raw = nullableString(value);
  if (raw === null) return okCommand(await defaultReportingCompanyId(employeeId));

  const numeric = nullableNumber(raw);
  if (numeric !== null && !Number.isNaN(numeric)) {
    const validation = await validateActiveCompanyId(numeric);
    return validation.ok ? okCommand(validation.data) : failCommand(validation.issue.message, validation.issue.status);
  }

  const company = await findCompanyByNameOrCode(raw);
  if (!company) return failCommand("汇报公司不存在", 404);
  if (!company.isActive) return failCommand("停用公司不能作为汇报公司");
  return okCommand(company.id);
}

async function validatePositionAssignment(
  positionId: number,
  reportingCompanyId?: number | null,
  departmentId?: number | null,
  positionReportOverrideId?: number | null,
): Promise<DomainValidationResult<EdpPositionAssignment>> {
  const validation = await resolveEdpPositionAssignment({
    positionId,
    reportingCompanyId,
    departmentId,
    positionReportOverrideId,
  });
  return validation.ok ? okCommand(validation.data) : failCommand(validation.issue.message, validation.issue.status);
}

async function validateReportTo(
  positionId: number | null,
  reportingCompanyId: number | null,
  departmentId: number | null,
  positionReportOverrideId: number | null,
  reportTo: unknown,
) {
  if (nullableString(reportTo) === null) return failCommand("直接上级必填");
  const validation = await validateEdpReportTo({
    positionId,
    reportingCompanyId,
    departmentId,
    positionReportOverrideId,
    reportTo,
  });
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
  const department = await validateDepartmentValue(input.departmentId ?? null);
  if (!department.ok) return department;
  const reportingCompany = await validateReportingCompanyValue(input.reportingCompanyId ?? null, input.employeeId);
  if (!reportingCompany.ok) return reportingCompany;
  const overrideId = nullableNumber(input.positionReportOverrideId);
  if (Number.isNaN(overrideId)) return failCommand("特殊汇报配置无效");
  const assignment = await validatePositionAssignment(position.data, reportingCompany.data, department.data, overrideId);
  if (!assignment.ok) return assignment;
  const reportTo = await validateReportTo(
    position.data,
    assignment.data.reportingCompanyId,
    assignment.data.departmentId,
    assignment.data.positionReportOverrideId,
    input.reportTo,
  );
  if (!reportTo.ok) return reportTo;

  return okCommand({
    id: null,
    employeeId: input.employeeId,
    reportingCompanyId: assignment.data.reportingCompanyId,
    departmentId: assignment.data.departmentId,
    positionId: position.data,
    positionReportOverrideId: assignment.data.positionReportOverrideId,
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
  if (field === "position") {
    const positionId = await positionIdFromName(value);
    if (Number.isNaN(positionId)) return failCommand("岗位不存在", 404);
    return buildEdpFieldUpdateCommand("positionId", positionId, recordId);
  }
  if (field === "departmentId" || field === "dept1") {
    const department = await validateDepartmentValue(value);
    if (!department.ok) return department;
    const record = await prisma.eDP.findUnique({
      where: { id: recordId },
      select: { employeeId: true, reportingCompanyId: true, positionId: true },
    });
    if (!record) return failCommand("岗位记录不存在", 404);
    if (!department.data) {
      return okCommand({
        field: "departmentId",
        value: null,
        data: { departmentId: null, positionId: null, positionReportOverrideId: null, reportTo: null },
      });
    }
    if (!record.positionId) {
      return okCommand({
        field: "departmentId",
        value: department.data,
        data: { departmentId: department.data, positionReportOverrideId: null, reportTo: null },
      });
    }
    const reportingCompanyId = record.reportingCompanyId ?? await defaultReportingCompanyId(record.employeeId);
    const assignment = await validatePositionAssignment(record.positionId, reportingCompanyId, department.data, null);
    if (!assignment.ok) return assignment;
    return okCommand({
      field: "departmentId",
      value: assignment.data.departmentId,
      data: {
        reportingCompanyId: assignment.data.reportingCompanyId,
        departmentId: assignment.data.departmentId,
        positionReportOverrideId: assignment.data.positionReportOverrideId,
        reportTo: null,
      },
    });
  }

  if (field === "positionId") {
    const position = await validatePositionValue(value);
    if (!position.ok) return position;
    const record = await prisma.eDP.findUnique({
      where: { id: recordId },
      select: { employeeId: true, reportingCompanyId: true, departmentId: true, positionReportOverrideId: true },
    });
    if (!record) return failCommand("岗位记录不存在", 404);
    const reportingCompanyId = record.reportingCompanyId ?? await defaultReportingCompanyId(record.employeeId);
    const assignment = await validatePositionAssignment(position.data, reportingCompanyId, record.departmentId, record.positionReportOverrideId);
    if (!assignment.ok) return assignment;
    return okCommand({
      field,
      value: position.data,
      data: {
        reportingCompanyId: assignment.data.reportingCompanyId,
        positionId: position.data,
        departmentId: assignment.data.departmentId,
        positionReportOverrideId: assignment.data.positionReportOverrideId,
        reportTo: null,
      },
    });
  }

  if (field === "reportingCompanyId") {
    const record = await prisma.eDP.findUnique({
      where: { id: recordId },
      select: { employeeId: true, positionId: true, departmentId: true },
    });
    if (!record) return failCommand("岗位记录不存在", 404);
    const reportingCompany = await validateReportingCompanyValue(value, record.employeeId);
    if (!reportingCompany.ok) return reportingCompany;
    if (!record.positionId) {
      return okCommand({
        field,
        value: reportingCompany.data,
        data: { reportingCompanyId: reportingCompany.data, positionReportOverrideId: null, reportTo: null },
      });
    }
    const assignment = await validatePositionAssignment(record.positionId, reportingCompany.data, record.departmentId, null);
    if (!assignment.ok) return assignment;
    return okCommand({
      field,
      value: assignment.data.reportingCompanyId,
      data: {
        reportingCompanyId: assignment.data.reportingCompanyId,
        departmentId: assignment.data.departmentId,
        positionReportOverrideId: assignment.data.positionReportOverrideId,
        reportTo: null,
      },
    });
  }

  if (field === "positionReportOverrideId") {
    const overrideId = nullableNumber(value);
    if (Number.isNaN(overrideId)) return failCommand("特殊汇报配置无效");
    const record = await prisma.eDP.findUnique({
      where: { id: recordId },
      select: { employeeId: true, reportingCompanyId: true, positionId: true, departmentId: true },
    });
    if (!record) return failCommand("岗位记录不存在", 404);
    if (!record.positionId) return failCommand("请先选择岗位，再选择特殊汇报配置");
    const reportingCompanyId = record.reportingCompanyId ?? await defaultReportingCompanyId(record.employeeId);
    const assignment = await validatePositionAssignment(record.positionId, reportingCompanyId, record.departmentId, overrideId);
    if (!assignment.ok) return assignment;
    return okCommand({
      field,
      value: assignment.data.positionReportOverrideId,
      data: {
        reportingCompanyId: assignment.data.reportingCompanyId,
        departmentId: assignment.data.departmentId,
        positionReportOverrideId: assignment.data.positionReportOverrideId,
        reportTo: null,
      },
    });
  }

  if (field === "reportTo") {
    const record = await prisma.eDP.findUnique({
      where: { id: recordId },
      select: { employeeId: true, positionId: true, reportingCompanyId: true, departmentId: true, positionReportOverrideId: true },
    });
    if (!record) return failCommand("岗位记录不存在", 404);
    const reportingCompanyId = record.reportingCompanyId ?? await defaultReportingCompanyId(record.employeeId);
    const reportTo = await validateReportTo(record.positionId, reportingCompanyId, record.departmentId, record.positionReportOverrideId, value);
    if (!reportTo.ok) return reportTo;
    return okCommand({ field, value: reportTo.data, data: { reportingCompanyId, reportTo: reportTo.data } });
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
  const department = await validateDepartmentValue(row.departmentId ?? null);
  if (!department.ok) return department;
  const reportingCompany = await validateReportingCompanyValue(row.reportingCompanyId ?? null, employeeId);
  if (!reportingCompany.ok) return reportingCompany;
  const overrideId = nullableNumber(row.positionReportOverrideId);
  if (Number.isNaN(overrideId)) return failCommand("特殊汇报配置无效");
  const assignment = await validatePositionAssignment(position.data, reportingCompany.data, department.data, overrideId);
  if (!assignment.ok) return assignment;
  const reportTo = await validateReportTo(
    position.data,
    assignment.data.reportingCompanyId,
    assignment.data.departmentId,
    assignment.data.positionReportOverrideId,
    row.reportTo,
  );
  if (!reportTo.ok) return reportTo;

  return okCommand({
    id,
    employeeId,
    reportingCompanyId: assignment.data.reportingCompanyId,
    departmentId: assignment.data.departmentId,
    positionId: position.data,
    positionReportOverrideId: assignment.data.positionReportOverrideId,
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

export async function validateEdpDeleteCommand(id: unknown): Promise<DomainValidationResult<{ id: number }>> {
  const recordId = Number(id);
  if (!Number.isInteger(recordId) || recordId <= 0) return failCommand("岗位记录ID无效");
  const record = await prisma.eDP.findUnique({ where: { id: recordId }, select: { id: true } });
  if (!record) return failCommand("岗位记录不存在", 404);
  return okCommand({ id: recordId });
}
