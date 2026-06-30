import "server-only";

import {
  serviceError,
  serviceOk,
  type ServiceResult,
} from "../api";
import { prisma } from "../prisma";
import {
  docsEditorDb,
  type DocsEditorDb,
  type DocsEditorSpaceRow,
  type DocsEditorTemplateRow,
} from "./db";
import {
  buildCopyTemplateCommand,
  buildListTemplatesCommand,
  buildMarkPublishedCommand,
  buildSaveDraftCommand,
  buildTemplateIdCommand,
  buildUpdatePermissionsCommand,
  type CopyTemplateInput,
  type ListTemplatesInput,
  type MarkPublishedInput,
  type SaveDraftInput,
  type TemplateIdInput,
  type UpdatePermissionsInput,
} from "./domain/document-template-validation";
import {
  canAccessGeneratedQcTemplates,
  copyGeneratedQcTemplate,
  getGeneratedQcTemplate,
  listGeneratedQcTemplates,
} from "./generated-qc";
import {
  GENERATED_QC_SPACE_ID,
  isGeneratedQcTemplateId,
} from "./ids";
import {
  canPublishOfficialQcTemplate,
  getDepartmentContext,
  getUserDepartmentContexts,
  isDocsEditorRoleAtLeast,
  maxDocsEditorRole,
  resolveSpaceRole,
  resolveTemplateRole,
} from "./permissions";
import type {
  DocsEditorBootstrapDto,
  DocsEditorPermissionRole,
  DocsEditorSpaceDto,
  DocsEditorTemplateDetailDto,
  DocsEditorTemplateListItemDto,
} from "./types";

type TemplateMetrics = {
  stageCount?: number;
  fieldCount?: number;
  formulaCount?: number;
  tableCount?: number;
};

function parseJson(value: string | null | undefined, fallback: unknown) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function asStatus(value: string) {
  if (value === "reviewing" || value === "published" || value === "archived") return value;
  return "draft";
}

function jsonArrayLength(value: string | null) {
  const parsed = parseJson(value, []);
  return Array.isArray(parsed) ? parsed.length : 0;
}

function walkJson(value: unknown, visit: (node: Record<string, unknown>) => void) {
  if (Array.isArray(value)) {
    value.forEach((item) => walkJson(item, visit));
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  visit(record);
  Object.values(record).forEach((item) => walkJson(item, visit));
}

function collectMetrics(template: DocsEditorTemplateRow): TemplateMetrics {
  const document = parseJson(template.documentJson, {});
  const fieldModel = parseJson(template.fieldModelJson, {});
  const fieldKeys = new Set<string>();
  let formulaCount = 0;
  let tableCount = 0;

  walkJson(fieldModel, (node) => {
    const fieldKey = node.fieldKey ?? node.key;
    if (typeof fieldKey === "string" && fieldKey.trim()) fieldKeys.add(fieldKey);
    if (node.formula || node.rule || node.advancedFormulaText) formulaCount += 1;
  });
  walkJson(document, (node) => {
    const kind = node.kind ?? node.type ?? node.blockType;
    if (kind === "table") tableCount += 1;
  });

  return {
    stageCount: jsonArrayLength(template.sourceStageKeys),
    fieldCount: fieldKeys.size,
    formulaCount,
    tableCount,
  };
}

function roleOrViewer(role: DocsEditorPermissionRole | null): DocsEditorPermissionRole {
  return role ?? "viewer";
}

function toSpaceDto(space: DocsEditorSpaceRow, role: DocsEditorPermissionRole): DocsEditorSpaceDto {
  return {
    id: String(space.id),
    kind: space.kind === "department" ? "department" : "personal",
    title: space.title,
    ...(space.description ? { description: space.description } : {}),
    departmentId: space.departmentId,
    role,
  };
}

function toListItemDto(
  template: DocsEditorTemplateRow,
  role: DocsEditorPermissionRole,
): DocsEditorTemplateListItemDto {
  return {
    id: String(template.id),
    title: template.title,
    type: template.type,
    status: asStatus(template.status),
    spaceId: String(template.spaceId),
    updatedAt: template.updatedAt.toISOString(),
    sourceKind: template.sourceKind,
    sourceProductKey: template.sourceProductKey,
    role,
    ...collectMetrics(template),
  };
}

async function permissionDtos(templateId: number): Promise<DocsEditorTemplateDetailDto["permissions"]> {
  const db = docsEditorDb();
  const permissions = await db.documentTemplatePermission.findMany({
    where: { templateId },
    orderBy: { id: "asc" },
  });
  const users = await prisma.user.findMany({
    where: { id: { in: permissions.map((item) => item.userId) } },
    select: { id: true, nickname: true, username: true },
  });
  const userNames = new Map(users.map((user) => [user.id, user.nickname || user.username || `用户 ${user.id}`]));
  return permissions.map((permission) => ({
    id: String(permission.id),
    userId: permission.userId,
    userName: userNames.get(permission.userId) || `用户 ${permission.userId}`,
    role: permission.role === "editor" || permission.role === "manager" ? permission.role : "viewer",
  }));
}

async function templateDetailDto(
  template: DocsEditorTemplateRow,
  role: DocsEditorPermissionRole,
): Promise<DocsEditorTemplateDetailDto> {
  return {
    ...toListItemDto(template, role),
    document: parseJson(template.documentJson, {}),
    fieldModel: parseJson(template.fieldModelJson, {}),
    permissions: await permissionDtos(template.id),
  };
}

async function ensurePersonalSpace(userId: number, db: DocsEditorDb = docsEditorDb()) {
  const existing = await db.documentTemplateSpace.findFirst({
    where: { kind: "personal", ownerUserId: userId, deletedAt: null },
    orderBy: { id: "asc" },
  });
  if (existing) return existing;
  return db.documentTemplateSpace.create({
    data: {
      kind: "personal",
      title: "我的模板空间",
      description: "个人草稿和私有模板",
      ownerUserId: userId,
    },
  });
}

async function ensureDepartmentSpace(departmentId: number, db: DocsEditorDb = docsEditorDb()) {
  const department = await getDepartmentContext(departmentId);
  if (!department) return null;
  const existing = await db.documentTemplateSpace.findFirst({
    where: { kind: "department", departmentId, deletedAt: null },
    orderBy: { id: "asc" },
  });
  if (existing) return existing;
  return db.documentTemplateSpace.create({
    data: {
      kind: "department",
      title: `${department.name}模板空间`,
      description: "部门成员可查看，负责人可管理",
      departmentId,
      ownerUserId: department.managerUserId,
    },
  });
}

async function listAccessibleSpaces(userId: number) {
  const db = docsEditorDb();
  const departments = await getUserDepartmentContexts(userId);
  const personal = await ensurePersonalSpace(userId, db);
  const departmentSpaces = await Promise.all(
    departments.map((department) => ensureDepartmentSpace(department.id, db)),
  );
  const baseSpaces = [personal, ...departmentSpaces.filter((space): space is DocsEditorSpaceRow => Boolean(space))];
  const allSpaces = await db.documentTemplateSpace.findMany({
    where: { deletedAt: null },
    orderBy: [{ kind: "asc" }, { id: "asc" }],
  });
  const uniqueSpaces = new Map<number, DocsEditorSpaceRow>();
  [...baseSpaces, ...allSpaces].forEach((space) => uniqueSpaces.set(space.id, space));

  const result: Array<{ space: DocsEditorSpaceRow; role: DocsEditorPermissionRole }> = [];
  for (const space of Array.from(uniqueSpaces.values())) {
    const role = await resolveSpaceRole(userId, space, departments);
    if (role) result.push({ space, role });
  }
  return result;
}

export async function listSpaces(input: { userId: number }): Promise<ServiceResult<DocsEditorSpaceDto[]>> {
  const spaces = await listAccessibleSpaces(input.userId);
  const canAccessQc = await canAccessGeneratedQcTemplates(input.userId);
  return serviceOk([
    ...spaces.map(({ space, role }) => toSpaceDto(space, role)),
    ...(canAccessQc ? [{
      id: GENERATED_QC_SPACE_ID,
      kind: "department" as const,
      title: "QC 官方模板",
      description: "16 个产品全文模板，复制后可在个人或部门空间编辑",
      departmentId: null,
      role: await canPublishOfficialQcTemplate(input.userId) ? "manager" as const : "viewer" as const,
    }] : []),
  ]);
}

export async function listTemplates(input: ListTemplatesInput): Promise<ServiceResult<DocsEditorTemplateListItemDto[]>> {
  if (input.spaceId === GENERATED_QC_SPACE_ID) return listGeneratedQcTemplates(input.userId);
  const command = buildListTemplatesCommand(input);
  if (command.ok === false) return serviceError(command.issue.message, command.issue.status);

  const db = docsEditorDb();
  const spaces = await listAccessibleSpaces(command.data.userId);
  const roleBySpaceId = new Map(spaces.map(({ space, role }) => [space.id, role]));
  const explicitPermissions = await db.documentTemplatePermission.findMany({
    where: { userId: command.data.userId },
  });
  const explicitByTemplateId = new Map(explicitPermissions.map((permission) => [permission.templateId, permission]));
  const templateIds = explicitPermissions.map((permission) => permission.templateId);
  const spaceIds = command.data.spaceId ? [command.data.spaceId] : Array.from(roleBySpaceId.keys());
  const templates = await db.documentTemplate.findMany({
    where: {
      deletedAt: null,
      ...(command.data.status ? { status: command.data.status } : {}),
      ...(command.data.keyword ? { title: { contains: command.data.keyword } } : {}),
      OR: [
        ...(spaceIds.length > 0 ? [{ spaceId: { in: spaceIds } }] : []),
        ...(templateIds.length > 0 ? [{ id: { in: templateIds } }] : []),
      ],
    },
    orderBy: { updatedAt: "desc" },
  });
  const spaceRows = await db.documentTemplateSpace.findMany({
    where: { id: { in: Array.from(new Set(templates.map((template) => template.spaceId))) } },
  });
  const spaceById = new Map(spaceRows.map((space) => [space.id, space]));
  const rows: DocsEditorTemplateListItemDto[] = [];
  for (const template of templates) {
    const role = await resolveTemplateRole({
      userId: command.data.userId,
      template,
      space: spaceById.get(template.spaceId) ?? null,
      explicit: explicitByTemplateId.get(template.id) ?? null,
    });
    if (role) rows.push(toListItemDto(template, role));
  }
  if (!command.data.spaceId && await canAccessGeneratedQcTemplates(command.data.userId)) {
    const generated = await listGeneratedQcTemplates(command.data.userId);
    if (generated.ok === true) rows.push(...generated.data);
  }
  return serviceOk(rows);
}

async function getTemplateWithRole(userId: number, templateId: number) {
  const db = docsEditorDb();
  const template = await db.documentTemplate.findFirst({
    where: { id: templateId, deletedAt: null },
  });
  if (!template) return null;
  const [space, explicit] = await Promise.all([
    db.documentTemplateSpace.findUnique({ where: { id: template.spaceId } }),
    db.documentTemplatePermission.findFirst({ where: { templateId, userId } }),
  ]);
  const role = await resolveTemplateRole({ userId, template, space, explicit });
  return { template, role };
}

export async function getTemplate(input: TemplateIdInput): Promise<ServiceResult<DocsEditorTemplateDetailDto>> {
  if (isGeneratedQcTemplateId(input.templateId)) return getGeneratedQcTemplate(input.userId, String(input.templateId));
  const command = buildTemplateIdCommand(input);
  if (command.ok === false) return serviceError(command.issue.message, command.issue.status);
  const current = await getTemplateWithRole(command.data.userId, command.data.templateId);
  if (!current) return serviceError("模板不存在", 404);
  if (!current.role) return serviceError("无权限", 403);
  return serviceOk(await templateDetailDto(current.template, current.role));
}

async function resolveTargetSpace(command: {
  userId: number;
  spaceId?: number;
  departmentId?: number;
  spaceKind?: string;
}, db: DocsEditorDb) {
  if (command.spaceId) {
    return db.documentTemplateSpace.findFirst({ where: { id: command.spaceId, deletedAt: null } });
  }
  if (command.departmentId || command.spaceKind === "department") {
    if (!command.departmentId) return null;
    return ensureDepartmentSpace(command.departmentId, db);
  }
  return ensurePersonalSpace(command.userId, db);
}

export async function saveDraft(input: SaveDraftInput): Promise<ServiceResult<DocsEditorTemplateDetailDto>> {
  const command = buildSaveDraftCommand(input);
  if (command.ok === false) return serviceError(command.issue.message, command.issue.status);

  const db = docsEditorDb();
  if (command.data.templateId) {
    const current = await getTemplateWithRole(command.data.userId, command.data.templateId);
    if (!current) return serviceError("模板不存在", 404);
    if (!isDocsEditorRoleAtLeast(current.role, "editor")) return serviceError("无权限", 403);
    if (current.template.status === "published" || current.template.status === "archived") {
      return serviceError("已发布或归档模板不能直接保存草稿", 409);
    }
    const updated = await db.documentTemplate.update({
      where: { id: command.data.templateId },
      data: {
        ...command.data.data,
        status: "draft",
        version: { increment: 1 },
        publishRequestedAt: null,
      },
    });
    return serviceOk(await templateDetailDto(updated, roleOrViewer(current.role)));
  }

  const targetSpace = await resolveTargetSpace(command.data, db);
  if (!targetSpace) return serviceError("目标空间不存在", 404);
  const spaceRole = await resolveSpaceRole(command.data.userId, targetSpace);
  if (!isDocsEditorRoleAtLeast(spaceRole, "editor")) return serviceError("无权限", 403);
  const created = await db.documentTemplate.create({
    data: {
      title: command.data.data.title || "未命名模板",
      type: command.data.data.type || "document",
      status: "draft",
      ownerUserId: command.data.userId,
      spaceId: targetSpace.id,
      documentJson: command.data.data.documentJson || "{}",
      fieldModelJson: command.data.data.fieldModelJson || "{}",
      sourceKind: command.data.data.sourceKind ?? null,
      sourceProductKey: command.data.data.sourceProductKey ?? null,
      sourceStageKeys: command.data.data.sourceStageKeys ?? null,
    },
  });
  return serviceOk(await templateDetailDto(created, roleOrViewer(spaceRole)));
}

export async function copyTemplate(input: CopyTemplateInput): Promise<ServiceResult<DocsEditorTemplateDetailDto>> {
  if (isGeneratedQcTemplateId(input.templateId)) {
    return copyGeneratedQcTemplate(input, { resolveTargetSpace, templateDetailDto, roleOrViewer });
  }
  const command = buildCopyTemplateCommand(input);
  if (command.ok === false) return serviceError(command.issue.message, command.issue.status);
  const source = await getTemplateWithRole(command.data.userId, command.data.templateId);
  if (!source) return serviceError("模板不存在", 404);
  if (!isDocsEditorRoleAtLeast(source.role, "viewer")) return serviceError("无权限", 403);

  const db = docsEditorDb();
  const targetSpace = await resolveTargetSpace({
    userId: command.data.userId,
    spaceId: command.data.targetSpaceId,
    departmentId: command.data.targetDepartmentId,
  }, db);
  if (!targetSpace) return serviceError("目标空间不存在", 404);
  const targetRole = await resolveSpaceRole(command.data.userId, targetSpace);
  if (!isDocsEditorRoleAtLeast(targetRole, "editor")) return serviceError("无权限", 403);

  const created = await db.documentTemplate.create({
    data: {
      title: command.data.title || `${source.template.title} 副本`,
      type: source.template.type,
      status: "draft",
      ownerUserId: command.data.userId,
      spaceId: targetSpace.id,
      documentJson: source.template.documentJson,
      fieldModelJson: source.template.fieldModelJson,
      sourceKind: source.template.sourceKind,
      sourceProductKey: source.template.sourceProductKey,
      sourceStageKeys: source.template.sourceStageKeys,
    },
  });
  return serviceOk(await templateDetailDto(created, roleOrViewer(targetRole)));
}

export async function deleteDraft(input: TemplateIdInput): Promise<ServiceResult<{ id: string }>> {
  const command = buildTemplateIdCommand(input);
  if (command.ok === false) return serviceError(command.issue.message, command.issue.status);
  const current = await getTemplateWithRole(command.data.userId, command.data.templateId);
  if (!current) return serviceError("模板不存在", 404);
  if (!isDocsEditorRoleAtLeast(current.role, "editor")) return serviceError("无权限", 403);
  if (current.template.status !== "draft") return serviceError("只能删除草稿模板", 409);
  const db = docsEditorDb();
  await db.documentTemplate.update({
    where: { id: command.data.templateId },
    data: { deletedAt: new Date(), version: { increment: 1 } },
  });
  return serviceOk({ id: String(command.data.templateId) });
}

export async function updatePermissions(input: UpdatePermissionsInput): Promise<ServiceResult<DocsEditorTemplateDetailDto>> {
  const command = buildUpdatePermissionsCommand(input);
  if (command.ok === false) return serviceError(command.issue.message, command.issue.status);
  const current = await getTemplateWithRole(command.data.userId, command.data.templateId);
  if (!current) return serviceError("模板不存在", 404);
  if (!isDocsEditorRoleAtLeast(current.role, "manager")) return serviceError("无权限", 403);

  const userCount = command.data.permissions.length === 0 ? 0 : await prisma.user.count({
    where: { id: { in: command.data.permissions.map((item) => item.userId) } },
  });
  if (userCount !== command.data.permissions.length) return serviceError("授权用户不存在", 400);

  const db = docsEditorDb();
  await db.$transaction(async (tx) => {
    await tx.documentTemplatePermission.deleteMany({ where: { templateId: command.data.templateId } });
    if (command.data.permissions.length > 0) {
      await tx.documentTemplatePermission.createMany({
        data: command.data.permissions.map((item) => ({
          templateId: command.data.templateId,
          userId: item.userId,
          role: item.role,
        })),
      });
    }
    await tx.documentTemplate.update({
      where: { id: command.data.templateId },
      data: { version: { increment: 1 } },
    });
  });
  const refreshed = await getTemplateWithRole(command.data.userId, command.data.templateId);
  if (!refreshed?.role) return serviceError("无权限", 403);
  return serviceOk(await templateDetailDto(refreshed.template, refreshed.role));
}

export async function requestPublish(input: TemplateIdInput): Promise<ServiceResult<DocsEditorTemplateDetailDto>> {
  const command = buildTemplateIdCommand(input);
  if (command.ok === false) return serviceError(command.issue.message, command.issue.status);
  const current = await getTemplateWithRole(command.data.userId, command.data.templateId);
  if (!current) return serviceError("模板不存在", 404);
  if (!isDocsEditorRoleAtLeast(current.role, "editor")) return serviceError("无权限", 403);
  if (current.template.status !== "draft") return serviceError("只有草稿模板可以提交发布", 409);
  const db = docsEditorDb();
  const updated = await db.documentTemplate.update({
    where: { id: command.data.templateId },
    data: {
      status: "reviewing",
      publishRequestedAt: new Date(),
      version: { increment: 1 },
    },
  });
  const role = maxDocsEditorRole(current.role, "editor") ?? "editor";
  return serviceOk(await templateDetailDto(updated, role));
}

function isProductionQcOfficialTemplate(template: DocsEditorTemplateRow, explicitOfficial: boolean) {
  if (explicitOfficial) return true;
  const sourceKind = template.sourceKind || "";
  return (
    sourceKind === "production.qc.official" ||
    sourceKind === "qc.official"
  );
}

export async function markPublished(input: MarkPublishedInput): Promise<ServiceResult<DocsEditorTemplateDetailDto>> {
  const command = buildMarkPublishedCommand(input);
  if (command.ok === false) return serviceError(command.issue.message, command.issue.status);
  const current = await getTemplateWithRole(command.data.userId, command.data.templateId);
  if (!current) return serviceError("模板不存在", 404);
  if (!isDocsEditorRoleAtLeast(current.role, "manager")) return serviceError("无权限", 403);
  if (current.template.status === "archived") return serviceError("归档模板不能发布", 409);
  if (
    isProductionQcOfficialTemplate(current.template, command.data.official) &&
    !(await canPublishOfficialQcTemplate(command.data.userId))
  ) {
    return serviceError("发布 QC 官方模板需要模板编辑器管理权限", 403);
  }
  const db = docsEditorDb();
  const updated = await db.documentTemplate.update({
    where: { id: command.data.templateId },
    data: {
      status: "published",
      publishedAt: new Date(),
      publishedByUserId: command.data.userId,
      version: { increment: 1 },
    },
  });
  return serviceOk(await templateDetailDto(updated, "manager"));
}

export async function getEditorBootstrap(input: ListTemplatesInput): Promise<ServiceResult<DocsEditorBootstrapDto>> {
  const spaces = await listSpaces({ userId: input.userId });
  if (spaces.ok === false) return serviceError(spaces.error, spaces.status);
  const templates = await listTemplates(input);
  if (templates.ok === false) return serviceError(templates.error, templates.status);
  return serviceOk({ spaces: spaces.data, templates: templates.data });
}
