import "server-only";
import { Prisma, prisma } from "./prisma";
import { serviceError, serviceOk } from "./api";
import { failCommand, okCommand, type DomainValidationResult } from "./domain-validation";
import { currentEmploymentDateWhere, currentOpenEndedDateWhere } from "./relation-registry";
import { snapshotHistory } from "./history";

type GovernanceOrganizationInput = {
  id?: number;
  code?: unknown;
  name?: unknown;
  alias?: unknown;
  parentId?: unknown;
  managerPositionId?: unknown;
  descriptions?: unknown;
};

type GovernanceOrganizationCommand = {
  id?: number;
  code: string;
  name: string;
  alias: string | null;
  parentId: number | null;
  managerPositionId: number | null;
  descriptions: Array<{ id?: number; sourceFile: string; codeRaw?: string | null; details?: string | null }> | null;
};

const employeeSelect = {
  id: true,
  name: true,
  userId: true,
} as const;

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeAliasValue(value: unknown) {
  const items = aliasItems(value);
  return items.length > 0 ? JSON.stringify(items) : null;
}

function displayAliasValue(value: string | null) {
  const items = aliasItems(value);
  return items.length > 0 ? items.join("、") : null;
}

function aliasItems(value: unknown) {
  const text = stringValue(value);
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return uniqueStrings(parsed.map((item) => String(item)));
  } catch {}
  return uniqueStrings(text.split(/[,，、;；\n]+/));
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}

function parseDetails(details: string | null) {
  if (!details) return null;
  try {
    const parsed = JSON.parse(details);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeDescriptionList(descriptions: unknown): DomainValidationResult<GovernanceOrganizationCommand["descriptions"]> {
  if (descriptions === undefined || descriptions === null) return okCommand(null);
  if (!Array.isArray(descriptions)) return failCommand("部门说明书格式错误");
  const result: NonNullable<GovernanceOrganizationCommand["descriptions"]> = [];
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

function managerEmployeeNames(
  managerPosition: {
    edps?: Array<{
      employee: {
        id: number;
        name: string;
        userId: number | null;
      };
    }>;
  } | null | undefined,
) {
  const byEmployee = new Map<number, { employeeId: number; userId: number | null; name: string }>();
  for (const edp of managerPosition?.edps ?? []) {
    const employee = edp.employee;
    byEmployee.set(employee.id, {
      employeeId: employee.id,
      userId: employee.userId,
      name: employee.name || "未命名员工",
    });
  }
  return Array.from(byEmployee.values());
}

function descendantIds(departmentId: number, childrenByParent: Map<number | null, number[]>) {
  const result = new Set<number>();
  function visit(id: number) {
    for (const childId of childrenByParent.get(id) ?? []) {
      if (result.has(childId)) continue;
      result.add(childId);
      visit(childId);
    }
  }
  visit(departmentId);
  return result;
}

function parseGovernanceInput(input: GovernanceOrganizationInput): DomainValidationResult<GovernanceOrganizationCommand> {
  const id = optionalNumber(input.id);
  const code = stringValue(input.code).toUpperCase();
  const name = stringValue(input.name);
  const parentId = optionalNumber(input.parentId);
  const managerPositionId = optionalNumber(input.managerPositionId);
  const descriptions = normalizeDescriptionList(input.descriptions);

  if (input.id !== undefined && !id) return failCommand("缺少组织 id", 400, "id");
  if (!/^[A-Z]{3}$/.test(code)) return failCommand("G 组织编码必须为 3 位大写字母", 400, "code");
  if (!name) return failCommand("组织名称不能为空", 400, "name");
  if (!descriptions.ok) return descriptions;

  return okCommand({
    ...(id ? { id } : {}),
    code,
    name,
    alias: normalizeAliasValue(input.alias),
    parentId,
    managerPositionId,
    descriptions: descriptions.data,
  });
}

export function buildGovernanceOrganizationCreateCommand(
  input: GovernanceOrganizationInput,
): DomainValidationResult<GovernanceOrganizationCommand> {
  return parseGovernanceInput(input);
}

export function buildGovernanceOrganizationUpdateCommand(
  input: GovernanceOrganizationInput,
): DomainValidationResult<GovernanceOrganizationCommand & { id: number }> {
  const parsed = parseGovernanceInput(input);
  if (!parsed.ok) return parsed;
  if (!parsed.data.id) return failCommand("缺少组织 id", 400, "id");
  return okCommand({ ...parsed.data, id: parsed.data.id });
}

async function resolveGovernanceHierarchy(input: {
  id?: number;
  parentId: number | null;
}) {
  if (input.parentId == null) return { level: 1, parentId: null };

  const parent = await prisma.department.findFirst({
    where: { id: input.parentId, hierarchyKind: "G", isArchived: false },
    select: { id: true, level: true },
  });
  if (!parent) return { error: "上级组织必须是现用 G 组织" };
  if (parent.level >= 3) return { error: "G3 组织下不能继续新建下级组织" };

  if (input.id) {
    const departments = await prisma.department.findMany({
      where: { hierarchyKind: "G", isArchived: false },
      select: { id: true, parentId: true },
    });
    const childrenByParent = new Map<number | null, number[]>();
    for (const item of departments) {
      const list = childrenByParent.get(item.parentId) ?? [];
      list.push(item.id);
      childrenByParent.set(item.parentId, list);
    }
    if (descendantIds(input.id, childrenByParent).has(input.parentId)) {
      return { error: "上级组织不能选择自身或下级组织" };
    }
  }

  return { level: Math.min(parent.level + 1, 3), parentId: parent.id };
}

async function validateGovernanceReferences(input: GovernanceOrganizationCommand) {
  const hierarchy = await resolveGovernanceHierarchy({ id: input.id, parentId: input.parentId });
  if ("error" in hierarchy) return { error: hierarchy.error };

  const duplicateCode = await prisma.department.findFirst({
    where: {
      code: input.code,
      NOT: input.id ? { id: input.id } : undefined,
    },
    select: { id: true },
  });
  if (duplicateCode) return { error: "组织编码已存在" };

  if (input.managerPositionId) {
    const position = await prisma.position.findFirst({
      where: {
        id: input.managerPositionId,
        isArchived: false,
        department: { hierarchyKind: "G", isArchived: false },
      },
      select: { id: true },
    });
    if (!position) return { error: "负责人岗位必须来自现用 G 组织岗位" };
  }

  return { hierarchy };
}

function directHeadcount(position: { edps: Array<{ employeeId: number }> }) {
  return new Set(position.edps.map((edp) => edp.employeeId)).size;
}

export async function listGovernanceOrganizations() {
  const departments = await prisma.department.findMany({
    where: { hierarchyKind: "G", isArchived: false },
    include: {
      parent: { select: { id: true, name: true } },
      children: { where: { hierarchyKind: "G" }, select: { id: true, name: true } },
      managerPosition: {
        select: {
          id: true,
          name: true,
          code: true,
          edps: {
            where: currentOpenEndedDateWhere({
              employee: { employments: { some: currentEmploymentDateWhere() } },
            }),
            select: { employee: { select: employeeSelect } },
            orderBy: [{ isPrimary: "desc" }, { id: "asc" }],
          },
        },
      },
      descriptions: {
        select: { id: true, sourceFile: true, codeRaw: true, details: true },
        orderBy: { id: "asc" },
      },
      positions: {
        where: { isArchived: false },
        select: {
          id: true,
          code: true,
          name: true,
          alias: true,
          departmentId: true,
          reportToPosition: { select: { name: true } },
          positionDescriptionId: true,
          positionDescription: { select: { id: true } },
          managedDepartments: { select: { id: true } },
          edps: {
            where: currentOpenEndedDateWhere({
              employee: { employments: { some: currentEmploymentDateWhere() } },
            }),
            select: { employeeId: true },
          },
        },
        orderBy: [{ code: "asc" }, { id: "asc" }],
      },
    },
    orderBy: [{ level: "asc" }, { code: "asc" }, { id: "asc" }],
  });

  const childrenByParent = new Map<number | null, number[]>();
  const byId = new Map(departments.map((department) => [department.id, department]));
  for (const department of departments) {
    const list = childrenByParent.get(department.parentId) ?? [];
    list.push(department.id);
    childrenByParent.set(department.parentId, list);
  }

  const organizations = departments.map((department) => {
    const managers = managerEmployeeNames(department.managerPosition);
    const managerNames = managers.map((manager) => manager.name);
    const subtree = new Set([department.id, ...descendantIds(department.id, childrenByParent)]);
    const subtreeDepartments = Array.from(subtree).map((id) => byId.get(id)).filter((item): item is NonNullable<typeof item> => Boolean(item));
    const directPositions = department.positions.length;
    const totalPositions = subtreeDepartments.reduce((sum, item) => sum + item.positions.length, 0);
    const directHeadcountCount = department.positions.reduce((sum, position) => sum + directHeadcount(position), 0);
    const totalHeadcount = subtreeDepartments.reduce(
      (sum, item) => sum + item.positions.reduce((positionSum, position) => positionSum + directHeadcount(position), 0),
      0,
    );

    return {
      id: department.id,
      code: department.code,
      name: department.name,
      alias: displayAliasValue(department.alias),
      hierarchyKind: "G" as const,
      level: Math.min(Math.max(department.level, 1), 3) as 1 | 2 | 3,
      parentId: department.parentId,
      parentName: department.parent?.name || null,
      managerPositionId: department.managerPositionId,
      managerPositionName: department.managerPosition?.name || null,
      managerEmployeeIds: managers.map((manager) => manager.employeeId),
      managerEmployeeNames: managerNames,
      managerName: managerNames.join("、") || null,
      directPositions,
      totalPositions,
      directHeadcount: directHeadcountCount,
      totalHeadcount,
      children: department.children.map((child) => ({ id: child.id, name: child.name })),
      descriptions: department.descriptions.map((description) => ({
        id: description.id,
        code: department.code,
        name: department.name,
        sourceFile: description.sourceFile,
        codeRaw: description.codeRaw,
        details: parseDetails(description.details),
      })),
    };
  });

  const positions = departments.flatMap((department) => department.positions.map((position) => ({
    id: position.id,
    code: position.code,
    name: position.name,
    alias: displayAliasValue(position.alias),
    departmentId: position.departmentId,
    departmentName: department.name,
    headcount: directHeadcount(position),
    reportTo: position.reportToPosition?.name ?? null,
    positionDescriptionId: position.positionDescriptionId,
    positionDescriptionName: position.positionDescription ? position.name : null,
    positionDescriptionCode: position.positionDescription ? position.code : null,
    managerOfDepartmentIds: position.managedDepartments.map((item) => item.id),
  })));

  return {
    organizations,
    positions,
  };
}

export async function createGovernanceOrganization(input: GovernanceOrganizationCommand, userId: number) {
  const validation = await validateGovernanceReferences(input);
  if ("error" in validation) return serviceError(validation.error || "治理组织校验失败");

  try {
    const record = await prisma.$transaction(async (tx) => {
      const department = await tx.department.create({
        data: {
          code: input.code,
          name: input.name,
          alias: input.alias,
          hierarchyKind: "G",
          level: validation.hierarchy.level,
          parentId: validation.hierarchy.parentId,
          managerPositionId: input.managerPositionId,
          editedBy: userId,
          editedAt: new Date(),
        },
      });
      const descriptionList = input.descriptions && input.descriptions.length > 0
        ? input.descriptions.map((description) => ({ ...description, departmentId: department.id }))
        : [{
            departmentId: department.id,
            sourceFile: "",
            details: "{}",
          }];
      for (const descriptionData of descriptionList) {
        await tx.departmentDescription.create({ data: { ...descriptionData, editedBy: userId, editedAt: new Date() } });
      }
      await snapshotHistory("Department", department.id, userId, tx);
      return department;
    });
    return serviceOk({ success: true, record });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return serviceError("上级组织、负责人岗位或组织负责人不存在");
    }
    throw error;
  }
}

export async function updateGovernanceOrganization(input: GovernanceOrganizationCommand & { id: number }, userId: number) {
  const existing = await prisma.department.findFirst({
    where: { id: input.id, hierarchyKind: "G", isArchived: false },
    select: { id: true },
  });
  if (!existing) return serviceError("G 组织不存在或已归档", 404);

  const validation = await validateGovernanceReferences(input);
  if ("error" in validation) return serviceError(validation.error || "治理组织校验失败");

  try {
    const record = await prisma.$transaction(async (tx) => {
      const department = await tx.department.update({
        where: { id: input.id },
        data: {
          code: input.code,
          name: input.name,
          alias: input.alias,
          hierarchyKind: "G",
          level: validation.hierarchy.level,
          parentId: validation.hierarchy.parentId,
          managerPositionId: input.managerPositionId,
          editedBy: userId,
          editedAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (input.descriptions) {
        for (const descriptionData of input.descriptions) {
          if (descriptionData.id) {
            await tx.departmentDescription.update({
              where: { id: descriptionData.id },
              data: { ...descriptionData, editedBy: userId, editedAt: new Date() },
            });
          } else {
            await tx.departmentDescription.create({
              data: { ...descriptionData, departmentId: input.id, editedBy: userId, editedAt: new Date() },
            });
          }
        }
      }
      await snapshotHistory("Department", input.id, userId, tx);
      return department;
    });
    return serviceOk({ success: true, record });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return serviceError("上级组织、负责人岗位或组织负责人不存在");
    }
    throw error;
  }
}
