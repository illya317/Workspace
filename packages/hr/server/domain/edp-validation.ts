import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import { currentEmploymentDateWhere, validateFkValue } from "@workspace/platform/server/relation-registry";
import { prisma } from "@workspace/platform/server/prisma";
import {
  resolveDefaultEdpReportToPositionId,
  validateEdpReportToPosition,
} from "../edp-report-to";
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
import {
  buildHrPageDraftEnvelopeCommand,
  type HrPageDraftInput,
} from "./page-draft-validation";

export const EDP_ALLOWED_FIELDS = [
  "reportingCompanyId",
  "departmentId",
  "positionId",
  "positionReportOverrideId",
  "isPrimary",
  "startDate",
  "endDate",
  "reportToPositionId",
  "workPercent",
];

const EDP_PAGE_DRAFT_FIELDS = ["isPrimary", "startDate", "endDate", "workPercent"];

export interface EdpCreateInput {
  employeeId: number;
  reportingCompanyId?: number | string | null;
  departmentId?: number | string | null;
  positionId?: number | string | null;
  positionReportOverrideId?: number | string | null;
  isPrimary?: boolean | string | null;
  startDate?: string | null;
  endDate?: string | null;
  reportToPositionId?: number | string | null;
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
  reportToPositionId: number | null;
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
    where: { OR: [{ code: text }, { party: { name: text } }, { party: { fullName: text } }] },
    select: { id: true, isActive: true },
  });
}

async function defaultReportingCompanyId(employeeId: number) {
  const employments = await prisma.employment.findMany({
    where: currentEmploymentDateWhere({ employeeId }),
    select: { contracts: true, currentCompany: true },
    orderBy: { id: "desc" },
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

async function normalizeReportToPosition(
  positionId: number,
  reportingCompanyId: number | null,
  departmentId: number | null,
  positionReportOverrideId: number | null,
  reportToPositionId: unknown,
) {
  if (reportToPositionId !== null && reportToPositionId !== undefined && reportToPositionId !== "") {
    return validateEdpReportToPosition({ positionId, departmentId, reportToPositionId });
  }
  return okCommand(await resolveDefaultEdpReportToPositionId({
    positionId,
    reportingCompanyId,
    departmentId,
    positionReportOverrideId,
  }));
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
  const reportToPosition = await normalizeReportToPosition(
    position.data,
    assignment.data.reportingCompanyId,
    assignment.data.departmentId,
    assignment.data.positionReportOverrideId,
    input.reportToPositionId,
  );
  if (!reportToPosition.ok) return reportToPosition;

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
    reportTo: null,
    reportToPositionId: reportToPosition.data,
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
        data: { departmentId: null, positionId: null, positionReportOverrideId: null, reportTo: null, reportToPositionId: null },
      });
    }
    if (!record.positionId) {
      return okCommand({
        field: "departmentId",
        value: department.data,
        data: { departmentId: department.data, positionReportOverrideId: null, reportTo: null, reportToPositionId: null },
      });
    }
    const reportingCompanyId = record.reportingCompanyId ?? await defaultReportingCompanyId(record.employeeId);
    const assignment = await validatePositionAssignment(record.positionId, reportingCompanyId, department.data, null);
    if (!assignment.ok) return assignment;
    const reportToPositionId = await resolveDefaultEdpReportToPositionId({
      positionId: record.positionId,
      reportingCompanyId: assignment.data.reportingCompanyId,
      departmentId: assignment.data.departmentId,
      positionReportOverrideId: assignment.data.positionReportOverrideId,
    });
    return okCommand({
      field: "departmentId",
      value: assignment.data.departmentId,
      data: {
        reportingCompanyId: assignment.data.reportingCompanyId,
        departmentId: assignment.data.departmentId,
        positionReportOverrideId: assignment.data.positionReportOverrideId,
        reportTo: null,
        reportToPositionId,
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
    const reportToPositionId = await resolveDefaultEdpReportToPositionId({
      positionId: position.data,
      reportingCompanyId: assignment.data.reportingCompanyId,
      departmentId: assignment.data.departmentId,
      positionReportOverrideId: assignment.data.positionReportOverrideId,
    });
    return okCommand({
      field,
      value: position.data,
      data: {
        reportingCompanyId: assignment.data.reportingCompanyId,
        positionId: position.data,
        departmentId: assignment.data.departmentId,
        positionReportOverrideId: assignment.data.positionReportOverrideId,
        reportTo: null,
        reportToPositionId,
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
        data: { reportingCompanyId: reportingCompany.data, positionReportOverrideId: null, reportTo: null, reportToPositionId: null },
      });
    }
    const assignment = await validatePositionAssignment(record.positionId, reportingCompany.data, record.departmentId, null);
    if (!assignment.ok) return assignment;
    const reportToPositionId = await resolveDefaultEdpReportToPositionId({
      positionId: record.positionId,
      reportingCompanyId: assignment.data.reportingCompanyId,
      departmentId: assignment.data.departmentId,
      positionReportOverrideId: assignment.data.positionReportOverrideId,
    });
    return okCommand({
      field,
      value: assignment.data.reportingCompanyId,
      data: {
        reportingCompanyId: assignment.data.reportingCompanyId,
        departmentId: assignment.data.departmentId,
        positionReportOverrideId: assignment.data.positionReportOverrideId,
        reportTo: null,
        reportToPositionId,
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
    const reportToPositionId = await resolveDefaultEdpReportToPositionId({
      positionId: record.positionId,
      reportingCompanyId: assignment.data.reportingCompanyId,
      departmentId: assignment.data.departmentId,
      positionReportOverrideId: assignment.data.positionReportOverrideId,
    });
    return okCommand({
      field,
      value: assignment.data.positionReportOverrideId,
      data: {
        reportingCompanyId: assignment.data.reportingCompanyId,
        departmentId: assignment.data.departmentId,
        positionReportOverrideId: assignment.data.positionReportOverrideId,
        reportTo: null,
        reportToPositionId,
      },
    });
  }

  if (field === "reportToPositionId") {
    const record = await prisma.eDP.findUnique({
      where: { id: recordId },
      select: { positionId: true, departmentId: true },
    });
    if (!record) return failCommand("岗位记录不存在", 404);
    if (!record.positionId) return failCommand("请先选择岗位，再选择汇报岗位");
    const reportToPosition = await validateEdpReportToPosition({
      positionId: record.positionId,
      departmentId: record.departmentId,
      reportToPositionId: value,
    });
    if (!reportToPosition.ok) return reportToPosition;
    return okCommand({
      field,
      value: reportToPosition.data,
      data: { reportTo: null, reportToPositionId: reportToPosition.data },
    });
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

export async function buildEdpPageDraftCommand(input: HrPageDraftInput) {
  const envelope = buildHrPageDraftEnvelopeCommand(input);
  if (!envelope.ok) return envelope;
  const changes: Array<{ id: number; field: string; value: unknown; data: Record<string, unknown> }> = [];
  for (const change of envelope.data.changes) {
    if (!EDP_PAGE_DRAFT_FIELDS.includes(change.field)) return failCommand("字段不支持在批量表中修改", 400, change.field);
    const field = await buildEdpFieldUpdateCommand(change.field, change.value, change.id);
    if (!field.ok) return field;
    changes.push({ id: change.id, field: field.data.field, value: field.data.value, data: field.data.data });
  }

  const ids = Array.from(new Set(changes.map((change) => change.id)));
  const targets = await prisma.eDP.findMany({
    where: { id: { in: ids } },
    select: { id: true, employeeId: true },
  });
  if (targets.length !== ids.length) return failCommand("部分岗位记录不存在，请刷新后重试", 404);
  const employeeIds = Array.from(new Set(targets.map((row) => row.employeeId)));
  const rows = await prisma.eDP.findMany({
    where: { employeeId: { in: employeeIds } },
    select: { id: true, employeeId: true, startDate: true, endDate: true, workPercent: true, isPrimary: true },
  });
  const patches = new Map<number, Record<string, unknown>>();
  for (const change of changes) patches.set(change.id, { ...(patches.get(change.id) ?? {}), ...change.data });
  for (const employeeId of employeeIds) {
    const candidates = rows.filter((row) => row.employeeId === employeeId).map((row) => ({
      id: row.id,
      startDate: Object.prototype.hasOwnProperty.call(patches.get(row.id) ?? {}, "startDate")
        ? patches.get(row.id)!.startDate as string | null
        : row.startDate,
      endDate: Object.prototype.hasOwnProperty.call(patches.get(row.id) ?? {}, "endDate")
        ? patches.get(row.id)!.endDate as string | null
        : row.endDate,
      workPercent: Object.prototype.hasOwnProperty.call(patches.get(row.id) ?? {}, "workPercent")
        ? patches.get(row.id)!.workPercent as string | null
        : row.workPercent,
      isPrimary: Object.prototype.hasOwnProperty.call(patches.get(row.id) ?? {}, "isPrimary")
        ? Boolean(patches.get(row.id)!.isPrimary)
        : row.isPrimary,
    }));
    const error = validateCurrentTotal(candidates);
    if (error) return failCommand(error, 400, "workPercent");
  }
  return okCommand({ userId: envelope.data.userId, changes });
}

export async function normalizeEdpRow(row: Record<string, unknown>, employeeId: number): Promise<DomainValidationResult<NormalizedEdpRow>> {
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
  const reportToPosition = await normalizeReportToPosition(
    position.data,
    assignment.data.reportingCompanyId,
    assignment.data.departmentId,
    assignment.data.positionReportOverrideId,
    row.reportToPositionId,
  );
  if (!reportToPosition.ok) return reportToPosition;

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
    reportTo: null,
    reportToPositionId: reportToPosition.data,
    workPercent: workPercent.data,
  });
}

export async function validateEdpDeleteCommand(id: unknown): Promise<DomainValidationResult<{ id: number }>> {
  const recordId = Number(id);
  if (!Number.isInteger(recordId) || recordId <= 0) return failCommand("岗位记录ID无效");
  const record = await prisma.eDP.findUnique({ where: { id: recordId }, select: { id: true } });
  if (!record) return failCommand("岗位记录不存在", 404);
  return failCommand("任职期间不能直接删除；请通过生命周期变更或结束日期保留期间历史", 409);
}
