import { Prisma } from "@workspace/platform/server/prisma";
import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import { validateFkValue } from "@workspace/platform/server/fk-registry";
import { guardPositionArchive } from "../reference-guards";
import { HR_FK_REGISTRY } from "../fk-registry";

export const POSITION_ALLOWED_FIELDS = ["code", "name", "alias", "departmentId", "positionDescriptionId", "isArchived", "archivedAt"];

export interface PositionInput {
  code?: string;
  name?: string;
  alias?: string | null;
  departmentId?: number | string | null;
  positionDescriptionId?: number | string | null;
  positionDescription?: PositionDescriptionInput | null;
  isArchived?: boolean;
  archivedAt?: Date | string | null;
}

export interface PositionDescriptionInput {
  code?: string;
  name?: string;
  departmentName?: string | null;
  reportTo?: string | null;
  positionPurpose?: string | null;
  summary?: string | null;
  headcount?: string | number | null;
  version?: string | null;
  effectiveDate?: string | null;
  sourceFile?: string | null;
  details?: string | null;
}

interface PositionCreateCommand {
  code: string;
  name: string;
  alias?: string | null;
  departmentId: number | null;
  positionDescriptionId: number | null;
  positionDescription?: PositionDescriptionCreateCommand | null;
}

interface PositionDescriptionCreateCommand {
  code: string;
  name: string;
  departmentName: string | null;
  reportTo: string | null;
  positionPurpose: string | null;
  summary: string | null;
  headcount: number | null;
  version: string | null;
  effectiveDate: string | null;
  sourceFile: string;
  details: string | null;
}

interface PositionUpdateCommand {
  data: Prisma.PositionUncheckedUpdateInput;
  positionDescription?: PositionDescriptionCreateCommand | null;
}

async function validateDepartment(value: unknown) {
  const validation = await validateFkValue(HR_FK_REGISTRY, {
    fkKey: "hr.position.department",
    value,
    requiredLabel: "所属部门",
  });
  return validation.ok ? okCommand(validation.value) : failCommand(validation.error, validation.status);
}

async function validatePositionDescription(value: unknown) {
  const validation = await validateFkValue(HR_FK_REGISTRY, {
    fkKey: "hr.positionDescription",
    value,
    requiredLabel: "岗位说明书",
  });
  return validation.ok ? okCommand(validation.value) : failCommand(validation.error, validation.status);
}

function trimOptional(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw || null;
}

function validatePositionDescriptionCreate(input: PositionDescriptionInput | null | undefined, fallback: { code: string; name: string }): DomainValidationResult<PositionDescriptionCreateCommand | null> {
  if (!input) return okCommand(null);
  const code = (input.code || fallback.code).trim();
  const name = (input.name || fallback.name).trim();
  if (!code) return failCommand("说明书编码必填");
  if (!name) return failCommand("说明书名称必填");
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
    code,
    name,
    departmentName: trimOptional(input.departmentName),
    reportTo: trimOptional(input.reportTo),
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
  const description = await validatePositionDescription(input.positionDescriptionId);
  if (!description.ok) return description;
  const descriptionCreate = validatePositionDescriptionCreate(input.positionDescription, { code: input.code, name: input.name });
  if (!descriptionCreate.ok) return descriptionCreate;
  return okCommand({
    code: input.code,
    name: input.name,
    alias: input.alias,
    departmentId: department.data,
    positionDescriptionId: description.data,
    positionDescription: descriptionCreate.data,
  });
}

export async function validatePositionFieldUpdate(field: string, value: unknown, id?: number) {
  if (field === "departmentId") {
    const department = await validateDepartment(value);
    if (!department.ok) return { error: department.issue.message, status: department.issue.status };
    return { field, value: department.data };
  }
  if (field === "positionDescriptionId") {
    const description = await validatePositionDescription(value);
    if (!description.ok) return { error: description.issue.message, status: description.issue.status };
    return { field, value: description.data };
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
  if (body.positionDescriptionId !== undefined) {
    const description = await validatePositionDescription(body.positionDescriptionId);
    if (!description.ok) return description;
    data.positionDescriptionId = description.data;
  }
  if (body.isArchived !== undefined) {
    const archived = Boolean(body.isArchived);
    const validation = await validateArchive(id, archived);
    if (!validation.ok) return validation;
    data.isArchived = archived;
    data.archivedAt = archived ? new Date() : null;
  }
  const descriptionCreate = validatePositionDescriptionCreate(body.positionDescription, {
    code: body.code || "",
    name: body.name || "",
  });
  if (!descriptionCreate.ok) return descriptionCreate;
  return okCommand({ data, positionDescription: descriptionCreate.data });
}

export async function validatePositionDelete(id: number, actionLabel = "删除岗位") {
  const blockMessage = await guardPositionArchive(id, actionLabel);
  return blockMessage ? failCommand(blockMessage, 409) : okCommand({ id });
}
