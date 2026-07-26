import { Prisma } from "@workspace/platform/server/prisma";
import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import { validateFkValue } from "@workspace/platform/server/relation-registry";
import { guardPositionArchive } from "../reference-guards";
import { HR_FK_REGISTRY } from "../fk-registry";
import { prisma } from "@workspace/platform/server/prisma";
import { validatePositionInOrganizationScope } from "../position-organization-scope";
import {
  parseOrganizationLifecycleMeta,
  type OrganizationLifecycleMeta,
} from "./organization-effective-version";

export const POSITION_ALLOWED_FIELDS = ["code", "name", "alias", "departmentId", "reportToPositionId", "isArchived", "archivedAt"];

export interface PositionInput {
  code?: string;
  name?: string;
  alias?: string | null;
  departmentId?: number | string | null;
  reportToPositionId?: number | string | null;
  positionDescription?: PositionDescriptionInput | null;
  isArchived?: boolean;
  archivedAt?: Date | string | null;
  lifecycle?: unknown;
}

export interface PositionDescriptionInput {
  positionPurpose?: string | null;
  summary?: string | null;
  headcount?: string | number | null;
  version?: string | null;
  effectiveDate?: string | null;
  sourceFile?: string | null;
  details?: string | null;
}

export interface PositionCreateCommand {
  code: string;
  name: string;
  alias: string | null;
  departmentId: number | null;
  reportToPositionId: number | null;
  positionDescription?: PositionDescriptionCreateCommand | null;
  lifecycle: OrganizationLifecycleMeta;
}

export interface PositionDescriptionCreateCommand {
  positionPurpose: string | null;
  summary: string | null;
  headcount: number | null;
  version: string | null;
  effectiveDate: string | null;
  sourceFile: string;
  details: string | null;
}

export interface PositionUpdateCommand {
  id: number;
  data: Prisma.PositionUncheckedUpdateInput;
  positionDescription?: PositionDescriptionCreateCommand | null;
  lifecycle: OrganizationLifecycleMeta;
}

async function validateDepartment(value: unknown) {
  const validation = await validateFkValue(HR_FK_REGISTRY, {
    fkKey: "hr.position.department",
    value,
    requiredLabel: "所属部门",
  });
  if (!validation.ok) return failCommand(validation.error, validation.status);
  if (!validation.value) return failCommand("直属组织必填");
  return okCommand(validation.value);
}

async function validatePosition(value: unknown, requiredLabel: string) {
  const validation = await validateFkValue(HR_FK_REGISTRY, {
    fkKey: "hr.position",
    value,
    requiredLabel,
  });
  return validation.ok ? okCommand(validation.value) : failCommand(validation.error, validation.status);
}

async function validateReportToPosition(value: unknown, departmentId: number | null, positionId?: number | null) {
  const reportToPosition = await validatePosition(value, "上级岗位");
  if (!reportToPosition.ok) return reportToPosition;
  const reportToScope = await validatePositionInOrganizationScope({
    positionId: reportToPosition.data,
    departmentId,
    label: "上级岗位",
    scopeLabel: "直属组织",
    excludePositionId: positionId,
  });
  return reportToScope.ok ? okCommand(reportToPosition.data) : reportToScope;
}

function trimOptional(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw || null;
}

function normalizeLifecycleMeta(input: unknown) {
  try {
    return okCommand(parseOrganizationLifecycleMeta(input));
  } catch (error) {
    return failCommand(error instanceof Error ? error.message : "岗位生命周期命令无效", 400, "lifecycle");
  }
}

async function validatePositionDescriptionCreate(
  input: PositionDescriptionInput | null | undefined,
): Promise<DomainValidationResult<PositionDescriptionCreateCommand | null>> {
  if (!input) return okCommand(null);
  const headcountText = input.headcount === null || input.headcount === undefined ? "" : String(input.headcount).trim();
  const parsedHeadcount = headcountText ? Number(headcountText) : null;
  if (parsedHeadcount !== null && (!Number.isInteger(parsedHeadcount) || parsedHeadcount <= 0)) return failCommand("编制必须是正整数");
  const details = trimOptional(input.details);
  if (details) {
    try {
      const parsed = JSON.parse(details);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return failCommand("说明书明细 JSON 不是合法对象");
    } catch {
      return failCommand("说明书明细 JSON 不是合法格式");
    }
  }
  return okCommand({
    positionPurpose: trimOptional(input.positionPurpose),
    summary: trimOptional(input.summary),
    headcount: parsedHeadcount,
    version: trimOptional(input.version),
    effectiveDate: trimOptional(input.effectiveDate),
    sourceFile: typeof input.sourceFile === "string" ? input.sourceFile.trim() : "",
    details,
  });
}

async function validateArchive(id: number | undefined, archived: boolean) {
  if (!archived || !id) return okCommand(archived);
  const blockMessage = await guardPositionArchive(id);
  return blockMessage ? failCommand(blockMessage, 409) : okCommand(archived);
}

export async function buildPositionCreateCommand(input: PositionInput): Promise<DomainValidationResult<PositionCreateCommand>> {
  if (!input.code) return failCommand("编码必填");
  if (!input.name) return failCommand("名称必填");
  const department = await validateDepartment(input.departmentId);
  if (!department.ok) return department;
  const reportToPosition = await validateReportToPosition(input.reportToPositionId, department.data);
  if (!reportToPosition.ok) return reportToPosition;
  const descriptionCreate = await validatePositionDescriptionCreate(input.positionDescription);
  if (!descriptionCreate.ok) return descriptionCreate;
  const lifecycle = normalizeLifecycleMeta(input.lifecycle);
  if (!lifecycle.ok) return lifecycle;
  if (lifecycle.data.kind !== "schedule" || lifecycle.data.expectedSequence !== 0) return failCommand("新建岗位必须使用初始 schedule 命令", 409, "lifecycle");
  return okCommand({
    code: input.code,
    name: input.name,
    alias: trimOptional(input.alias),
    departmentId: department.data,
    reportToPositionId: reportToPosition.data,
    positionDescription: descriptionCreate.data,
    lifecycle: lifecycle.data,
  });
}

export async function validatePositionFieldUpdate(field: string, value: unknown, id?: number) {
  if (field === "departmentId") {
    const department = await validateDepartment(value);
    if (!department.ok) return { error: department.issue.message, status: department.issue.status };
    return { field, value: department.data };
  }
  if (field === "reportToPositionId") {
    const position = await prisma.position.findUnique({ where: { id }, select: { departmentId: true } });
    if (!position) return { error: "岗位不存在", status: 404 };
    const reportToPosition = await validateReportToPosition(value, position.departmentId, id);
    if (!reportToPosition.ok) return { error: reportToPosition.issue.message, status: reportToPosition.issue.status };
    return { field, value: reportToPosition.data };
  }
  if (field === "isArchived") {
    const archived = Boolean(value);
    const validation = await validateArchive(id, archived);
    if (!validation.ok) return { error: validation.issue.message, status: validation.issue.status };
    return { field, value: archived };
  }
  return { field, value };
}

export async function buildPositionUpdateCommand(
  id: number,
  body: PositionInput,
): Promise<DomainValidationResult<PositionUpdateCommand>> {
  const data: Prisma.PositionUncheckedUpdateInput = {};
  if (body.code !== undefined) data.code = body.code;
  if (body.name !== undefined) data.name = body.name;
  if (body.alias !== undefined) data.alias = body.alias || null;
  if (body.departmentId !== undefined) {
    const department = await validateDepartment(body.departmentId);
    if (!department.ok) return department;
    data.departmentId = department.data;
  }
  if (body.isArchived !== undefined) {
    const archived = Boolean(body.isArchived);
    const validation = await validateArchive(id, archived);
    if (!validation.ok) return validation;
    data.isArchived = archived;
    data.archivedAt = archived ? new Date() : null;
  }
  const position = await prisma.position.findUnique({
    where: { id },
    select: { departmentId: true },
  });
  if (!position) return failCommand("岗位不存在", 404);
  const effectiveDepartmentId = typeof data.departmentId === "number" ? data.departmentId : position.departmentId;
  if (body.reportToPositionId !== undefined) {
    const reportToPosition = await validateReportToPosition(body.reportToPositionId, effectiveDepartmentId, id);
    if (!reportToPosition.ok) return reportToPosition;
    data.reportToPositionId = reportToPosition.data;
  }
  const descriptionCreate = await validatePositionDescriptionCreate(body.positionDescription);
  if (!descriptionCreate.ok) return descriptionCreate;
  const lifecycle = normalizeLifecycleMeta(body.lifecycle);
  if (!lifecycle.ok) return lifecycle;
  if (Boolean(body.isArchived) && lifecycle.data.kind !== "end-date") return failCommand("归档岗位必须使用 end-date 命令", 409, "lifecycle");
  if (body.isArchived === false && lifecycle.data.kind !== "schedule") return failCommand("恢复岗位必须使用 schedule 命令", 409, "lifecycle");
  return okCommand({ id, data, positionDescription: descriptionCreate.data, lifecycle: lifecycle.data });
}

export async function validatePositionDelete(id: number, actionLabel = "删除岗位") {
  const blockMessage = await guardPositionArchive(id, actionLabel);
  return blockMessage ? failCommand(blockMessage, 409) : okCommand({ id });
}
