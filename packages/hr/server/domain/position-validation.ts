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
  isArchived?: boolean;
  archivedAt?: Date | string | null;
}

interface PositionCreateCommand {
  code: string;
  name: string;
  alias?: string | null;
  departmentId: number | null;
  positionDescriptionId: number | null;
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
  return okCommand({
    code: input.code,
    name: input.name,
    alias: input.alias,
    departmentId: department.data,
    positionDescriptionId: description.data,
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
): Promise<DomainValidationResult<Prisma.PositionUncheckedUpdateInput>> {
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
  return okCommand(data);
}

export async function validatePositionDelete(id: number, actionLabel = "删除岗位") {
  const blockMessage = await guardPositionArchive(id, actionLabel);
  return blockMessage ? failCommand(blockMessage, 409) : okCommand({ id });
}
