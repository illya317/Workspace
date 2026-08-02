import type { Prisma } from "@workspace/platform/server/prisma";
import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import { validateFkValue } from "@workspace/platform/server/relation-registry";
import { HR_FK_REGISTRY } from "../fk-registry";
import { getManagerPositionScopeDepartmentIds } from "../department-manager-positions";
import { guardDepartmentArchive } from "../reference-guards";
import {
  findActiveDepartmentByCode,
  findDepartmentIdByCode,
  findDepartmentParentId,
  findDepartmentParentReference,
  findDepartmentUpdateReference,
  findPositionDepartmentReference,
} from "../department-reference-adapter";
import { getTenantProfile } from "@workspace/platform/server/tenant-config";
import { getBusinessCodeConfig } from "@workspace/platform/server/system-config";
import {
  isDepartmentIdentifier,
  type DepartmentCodeRule,
} from "@workspace/platform/business-code-config";
import {
  parseOrganizationLifecycleMeta,
  type OrganizationLifecycleMeta,
} from "./organization-effective-version";

export const DEPARTMENT_ALLOWED_FIELDS = ["code", "name", "alias", "hierarchyKind", "level", "levelLabel", "levelCode", "parentId", "managerPositionId", "isArchived", "archivedAt"];

type DepartmentHierarchyKind = "G" | "M";

export interface DepartmentCreateInput {
  code?: unknown;
  name?: unknown;
  hierarchyKind?: unknown;
  level?: unknown;
  parentId?: unknown;
  managerPositionId?: unknown;
  alias?: unknown;
  descriptions?: unknown;
  lifecycle?: unknown;
}

export interface DepartmentUpdateInput {
  id?: unknown;
  code?: string;
  name?: string;
  alias?: string | null;
  hierarchyKind?: DepartmentHierarchyKind;
  level?: number;
  parentId?: number | string | null;
  managerPositionId?: number | string | null;
  isArchived?: boolean;
  archivedAt?: Date | string | null;
  descriptions?: unknown;
  lifecycle?: unknown;
}

export interface DepartmentUpdateCommand {
  id: number;
  data: Prisma.DepartmentUncheckedUpdateInput;
  descriptions: Array<{ id?: number; sourceFile: string; codeRaw?: string | null; details?: string | null }> | null;
  lifecycle: OrganizationLifecycleMeta;
}

export interface DepartmentCreateCommand {
  code: string;
  name: string;
  alias: string | null;
  hierarchyKind: DepartmentHierarchyKind;
  level: number;
  parentId: number | null;
  managerPositionId: number | null;
  descriptions: DepartmentUpdateCommand["descriptions"];
  lifecycle: OrganizationLifecycleMeta;
}

function departmentPrefix(code: string, rule: DepartmentCodeRule) {
  const prefix = code.slice(0, rule.identifierLength);
  return isDepartmentIdentifier(prefix, rule) ? prefix : "";
}

function departmentNumber(code: string, rule: DepartmentCodeRule) {
  const separator = code.slice(rule.identifierLength, rule.identifierLength + rule.separator.length);
  if (separator !== rule.separator) return "";
  const suffix = code.slice(rule.identifierLength + rule.separator.length);
  return /^\d+$/.test(suffix) ? suffix : "";
}

function departmentIdentifierDescription(rule: DepartmentCodeRule) {
  if (rule.identifierFormat === "uppercaseLetters") return `${rule.identifierLength} 位大写字母`;
  if (rule.identifierFormat === "uppercaseAlphanumeric") return `${rule.identifierLength} 位大写字母或数字`;
  return `${rule.identifierLength} 位非空字符`;
}

function normalizeHierarchyKind(value: unknown): DepartmentHierarchyKind {
  return String(value || "M").trim().toUpperCase() === "G" ? "G" : "M";
}

async function findOperatingCommitteeId() {
  const committeeCode = getTenantProfile().organization.operatingCommittee.departmentCode;
  const committee = await findActiveDepartmentByCode(committeeCode, "G");
  return committee?.id ?? null;
}

async function resolveDepartmentParent(hierarchyKind: DepartmentHierarchyKind, level: number, code: string, parentId: number | null) {
  const codeConfig = await getBusinessCodeConfig();
  const departmentRule = codeConfig.department;
  const levelCode = `${hierarchyKind}${level}`;
  if (hierarchyKind === "G" && !isDepartmentIdentifier(code, departmentRule)) {
    return `${levelCode} 组织编码必须是${departmentIdentifierDescription(departmentRule)}`;
  }
  if (level === 1) {
    if (hierarchyKind === "M") {
      const prefix = departmentPrefix(code, departmentRule);
      const separator = code.slice(
        departmentRule.identifierLength,
        departmentRule.identifierLength + departmentRule.separator.length,
      );
      const suffix = code.slice(departmentRule.identifierLength + departmentRule.separator.length);
      if (!prefix || separator !== departmentRule.separator || suffix !== departmentRule.managementRootSuffix) {
        return `M1 组织编码必须是${departmentIdentifierDescription(departmentRule)}加 ${departmentRule.managementRootSuffix}`;
      }
    }
    if (hierarchyKind === "M") {
      const committeeName = getTenantProfile().organization.operatingCommittee.departmentName;
      const operatingCommitteeId = await findOperatingCommitteeId();
      if (!operatingCommitteeId) return `缺少${committeeName}，无法维护 M1 组织`;
      if (parentId !== null && parentId !== operatingCommitteeId) return `M1 组织上级组织必须是${committeeName}`;
      return { parentId: operatingCommitteeId };
    }
    return { parentId: null };
  }
  if (!parentId || !Number.isInteger(parentId)) return `${levelCode} 组织必须选择上级组织`;
  const parent = await findDepartmentParentReference(parentId);
  if (!parent) return "上级组织不存在";
  if (parent.hierarchyKind !== hierarchyKind) return `${levelCode} 组织只能挂在同一体系的上级组织下`;
  if (parent.level !== level - 1) return `${levelCode} 组织只能挂在 ${hierarchyKind}${level - 1} 组织下`;
  if (hierarchyKind === "G") return { parentId };
  const prefix = departmentPrefix(parent.code, departmentRule);
  if (!prefix || !code.startsWith(prefix)) return "组织编码必须继承上级组织前缀";
  const number = departmentNumber(code, departmentRule);
  if (!number) return `M${level} 编码必须是前缀后接纯数字`;
  if (level === 2) {
    const stem = number.slice(0, -departmentRule.level2Suffix.length);
    if (
      !number.endsWith(departmentRule.level2Suffix)
      || !/^[1-9]\d*$/.test(stem)
      || stem.length > departmentRule.level2SequenceLength
    ) {
      return `M2 编码数字段必须为正整数并以 ${departmentRule.level2Suffix} 结尾`;
    }
  }
  if (level === 3) {
    const parentNumber = departmentNumber(parent.code, departmentRule);
    if (!parentNumber.endsWith(departmentRule.level2Suffix)) return "上级 M2 编码不合法";
    const sequenceLength = departmentRule.level3SequenceLength;
    const tail = number.slice(-sequenceLength);
    if (
      number.length !== parentNumber.length - departmentRule.level2Suffix.length + sequenceLength
      || number.slice(0, -sequenceLength) !== parentNumber.slice(0, -departmentRule.level2Suffix.length)
      || !/^\d+$/.test(tail)
      || Number(tail) < 1
    ) {
      return `M3 编码必须按 ${sequenceLength} 位流水替换 ${parentNumber} 的层级后缀`;
    }
  }
  return { parentId };
}

async function validateNullableFk(fkKey: string, value: unknown, requiredLabel: string) {
  const validation = await validateFkValue(HR_FK_REGISTRY, { fkKey, value, requiredLabel });
  return validation.ok ? okCommand(validation.value) : failCommand(validation.error, validation.status);
}

async function validateManagerPosition(value: unknown, departmentId: number) {
  const managerPosition = await validateNullableFk("hr.department.manager.position", value, "负责人岗位");
  if (!managerPosition.ok || managerPosition.data === null) return managerPosition;
  const position = await findPositionDepartmentReference(managerPosition.data);
  const scopeDepartmentIds = await getManagerPositionScopeDepartmentIds(departmentId);
  if (!position?.departmentId || !scopeDepartmentIds.includes(position.departmentId)) {
    return failCommand("负责人岗位必须属于当前组织及其上下级归属组织", 400);
  }
  return managerPosition;
}

async function hasCyclicParent(id: number, parentId: number | null): Promise<boolean> {
  if (!parentId) return false;
  const visited = new Set<number>();
  let current: number | null = parentId;
  while (current !== null) {
    if (current === id) return true;
    if (visited.has(current)) return false;
    visited.add(current);
    const parent: { parentId: number | null } | null = await findDepartmentParentId(current);
    if (!parent) return false;
    current = parent.parentId;
  }
  return false;
}

function normalizeDescriptionList(descriptions: unknown): DomainValidationResult<DepartmentUpdateCommand["descriptions"]> {
  if (descriptions === undefined || descriptions === null) return okCommand(null);
  if (!Array.isArray(descriptions)) return failCommand("部门说明书格式错误");
  const result: NonNullable<DepartmentUpdateCommand["descriptions"]> = [];
  for (const description of descriptions) {
    const item = description && typeof description === "object" ? (description as Record<string, unknown>) : {};
    let detailsText: string | null = null;
    if (item.details !== undefined && item.details !== null && item.details !== "") {
      try {
        const parsed = typeof item.details === "string" ? JSON.parse(item.details) : item.details;
        detailsText = JSON.stringify(parsed);
      } catch {
        return failCommand("部门说明书 JSON 不是合法格式");
      }
    }
    result.push({
      id: item.id ? Number(item.id) : undefined,
      sourceFile: item.sourceFile ? String(item.sourceFile).trim() : "",
      codeRaw: item.codeRaw ? String(item.codeRaw).trim() : null,
      details: detailsText,
    });
  }
  return okCommand(result);
}

function normalizeLifecycleMeta(input: unknown) {
  try {
    return okCommand(parseOrganizationLifecycleMeta(input));
  } catch (error) {
    return failCommand(error instanceof Error ? error.message : "组织结构生命周期命令无效", 400, "lifecycle");
  }
}

export async function buildDepartmentCreateCommand(
  input: DepartmentCreateInput,
): Promise<DomainValidationResult<DepartmentCreateCommand>> {
  const code = String(input.code || "").trim();
  const name = String(input.name || "").trim();
  const hierarchyKind = normalizeHierarchyKind(input.hierarchyKind);
  const level = Number(input.level || 1);
  const parentId = input.parentId == null || input.parentId === "" ? null : Number(input.parentId);
  const alias = input.alias == null || input.alias === "" ? null : String(input.alias).trim();
  const managerPositionId = input.managerPositionId == null || input.managerPositionId === "" ? null : Number(input.managerPositionId);
  if (managerPositionId !== null && (!Number.isInteger(managerPositionId) || managerPositionId <= 0)) return failCommand("负责人岗位无效", 400);
  if (!name) return failCommand("组织名不能为空");
  if (![1, 2, 3].includes(level)) return failCommand("组织层级不合法");
  if (await findDepartmentIdByCode(code)) return failCommand("组织编码已存在", 409);
  const parent = await resolveDepartmentParent(hierarchyKind, level, code, parentId);
  if (typeof parent === "string") return failCommand(parent);
  const descriptions = normalizeDescriptionList(input.descriptions);
  if (!descriptions.ok) return descriptions;
  const lifecycle = normalizeLifecycleMeta(input.lifecycle);
  if (!lifecycle.ok) return lifecycle;
  if (lifecycle.data.kind !== "schedule" || lifecycle.data.expectedSequence !== 0) return failCommand("新建组织必须使用初始 schedule 命令", 409, "lifecycle");
  return okCommand({ code, name, alias, hierarchyKind, level, parentId: parent.parentId, managerPositionId, descriptions: descriptions.data, lifecycle: lifecycle.data });
}

export async function buildDepartmentFieldUpdateCommand(field: string, value: unknown, id?: number) {
  if (field === "parentId") {
    const parent = await validateNullableFk("hr.department", value, "上级组织");
    return parent.ok ? okCommand({ field, value: parent.data }) : parent;
  }
  if (field === "managerPositionId") {
    if (!id) return failCommand("缺少组织ID");
    const managerPosition = await validateManagerPosition(value, id);
    return managerPosition.ok ? okCommand({ field, value: managerPosition.data }) : managerPosition;
  }
  if (field === "managerEmployeeIds") {
    return failCommand("组织负责人由负责人岗位的当前任职自动派生，请维护负责人岗位或任职记录", 409);
  }
  if (field === "isArchived") {
    const archived = Boolean(value);
    if (archived && id) {
      const blockMessage = await guardDepartmentArchive(id);
      if (blockMessage) return failCommand(blockMessage, 409);
    }
    return okCommand({ field, value: archived });
  }
  return okCommand({ field, value });
}

export async function buildDepartmentUpdateCommand(input: DepartmentUpdateInput): Promise<DomainValidationResult<DepartmentUpdateCommand>> {
  const id = Number(input.id);
  if (!id) return failCommand("缺少id");

  const existing = await findDepartmentUpdateReference(id);
  if (!existing) return failCommand("组织不存在", 404);

  const data: Prisma.DepartmentUncheckedUpdateInput = {};
  if (input.code !== undefined) data.code = input.code;
  if (input.name !== undefined) data.name = input.name;
  if (input.alias !== undefined) data.alias = input.alias || null;
  if (input.hierarchyKind !== undefined) data.hierarchyKind = normalizeHierarchyKind(input.hierarchyKind);
  if (input.level !== undefined) data.level = input.level;

  let parentId: number | null = existing.parentId;
  if (input.parentId !== undefined) {
    const parent = await validateNullableFk("hr.department", input.parentId, "上级组织");
    if (!parent.ok) return parent;
    parentId = parent.data;
  }

  const code = input.code !== undefined ? input.code : existing.code;
  const hierarchyKind = input.hierarchyKind !== undefined ? normalizeHierarchyKind(input.hierarchyKind) : normalizeHierarchyKind(existing.hierarchyKind);
  const level = input.level !== undefined ? Number(input.level) : existing.level;

  if (![1, 2, 3].includes(level)) return failCommand("组织层级不合法");

  if (input.code !== undefined && input.code !== existing.code) {
    const duplicate = await findDepartmentIdByCode(input.code);
    if (duplicate) return failCommand("组织编码已存在", 409);
  }

  const parent = await resolveDepartmentParent(hierarchyKind, level, code, parentId);
  if (typeof parent === "string") return failCommand(parent);
  parentId = parent.parentId;
  data.parentId = parentId;

  if (await hasCyclicParent(id, parentId)) return failCommand("不能将当前组织或其子孙组织设为上级", 409);

  if (input.managerPositionId !== undefined) {
    const managerPosition = await validateManagerPosition(input.managerPositionId, id);
    if (!managerPosition.ok) return managerPosition;
    data.managerPositionId = managerPosition.data;
  }
  if (input.isArchived !== undefined) {
    const archived = Boolean(input.isArchived);
    if (archived) {
      const blockMessage = await guardDepartmentArchive(id);
      if (blockMessage) return failCommand(blockMessage, 409);
    }
    data.isArchived = archived;
    data.archivedAt = archived ? new Date() : null;
  }

  const descriptions = normalizeDescriptionList(input.descriptions);
  if (!descriptions.ok) return descriptions;
  const lifecycle = normalizeLifecycleMeta(input.lifecycle);
  if (!lifecycle.ok) return lifecycle;
  if (Boolean(input.isArchived) && lifecycle.data.kind !== "end-date") return failCommand("归档组织必须使用 end-date 命令", 409, "lifecycle");
  if (input.isArchived === false && lifecycle.data.kind !== "schedule") return failCommand("恢复组织必须使用 schedule 命令", 409, "lifecycle");
  return okCommand({ id, data, descriptions: descriptions.data, lifecycle: lifecycle.data });
}

export async function validateDepartmentDelete(id: number, actionLabel = "删除组织") {
  const blockMessage = await guardDepartmentArchive(id, actionLabel);
  return blockMessage ? failCommand(blockMessage, 409) : okCommand(true);
}
