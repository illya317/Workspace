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
  buildSaveDraftCommand,
  buildTemplateIdCommand,
  type CopyTemplateInput,
  type ListTemplatesInput,
  type SaveDraftInput,
  type TemplateIdInput,
} from "./domain/document-template-validation";
import {
  getGeneratedQcTemplateMetrics,
  syncGeneratedQcTemplates,
} from "./generated-qc";
import {
  canPublishOfficialQcTemplate,
  docsEditorPermissionKind,
  getAllDepartmentContexts,
  getDepartmentContext,
  getGroupCompanyContext,
  getQcDepartmentContext,
  getUserDepartmentContexts,
  isDocsEditorRoleAtLeast,
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

type DocsEditorTemplateListRow = Omit<DocsEditorTemplateRow, "documentJson" | "fieldModelJson"> & {
  documentJson?: string;
  fieldModelJson?: string;
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
  if (value === "published" || value === "archived") return value;
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

function collectMetrics(template: DocsEditorTemplateListRow): TemplateMetrics {
  if (template.sourceKind === "production.qc.official") {
    const metrics = getGeneratedQcTemplateMetrics(template.sourceProductKey);
    if (metrics) return metrics;
  }
  if (template.documentJson === undefined || template.fieldModelJson === undefined) {
    return { stageCount: jsonArrayLength(template.sourceStageKeys) };
  }
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

type DocsEditorSpaceTargetType = DocsEditorSpaceDto["targetType"];

type SpaceSeed = {
  targetType: DocsEditorSpaceTargetType;
  targetId: number;
  title: string;
  description: string;
};

function toSpaceDto(space: DocsEditorSpaceRow, role: DocsEditorPermissionRole): DocsEditorSpaceDto {
  const targetType = normalizeSpaceTargetType(space.targetType);
  return {
    id: String(space.id),
    kind: targetType,
    targetType,
    targetId: space.targetId,
    title: space.title,
    ...(space.description ? { description: space.description } : {}),
    departmentId: targetType === "department" ? space.targetId : null,
    role,
  };
}

function toListItemDto(
  template: DocsEditorTemplateListRow,
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

async function templateDetailDto(
  template: DocsEditorTemplateRow,
  role: DocsEditorPermissionRole,
): Promise<DocsEditorTemplateDetailDto> {
  return {
    ...toListItemDto(template, role),
    document: parseJson(template.documentJson, {}),
    fieldModel: parseJson(template.fieldModelJson, {}),
  };
}

function normalizeSpaceTargetType(value: string): DocsEditorSpaceTargetType {
  if (value === "personal" || value === "company" || value === "department") return value;
  return "department";
}

async function ensureSpace(seed: SpaceSeed, db: DocsEditorDb = docsEditorDb()) {
  const existing = await db.documentTemplateSpace.findFirst({
    where: { targetType: seed.targetType, targetId: seed.targetId, deletedAt: null },
    orderBy: { id: "asc" },
  });
  if (existing) return existing;
  return db.documentTemplateSpace.create({
    data: {
      targetType: seed.targetType,
      targetId: seed.targetId,
      title: seed.title,
      description: seed.description,
    },
  });
}

async function ensurePersonalSpace(userId: number, db: DocsEditorDb = docsEditorDb()) {
  return ensureSpace({
    targetType: "personal",
    targetId: userId,
    title: "我的模板空间",
    description: "个人草稿和私有模板",
  }, db);
}

async function ensureCompanySpace(db: DocsEditorDb = docsEditorDb()) {
  const company = await getGroupCompanyContext();
  if (!company) return null;
  return ensureSpace({
    targetType: "company",
    targetId: company.id,
    title: `${company.name}模板空间`,
    description: "集团级文档模板空间",
  }, db);
}

async function ensureDepartmentSpace(departmentId: number, db: DocsEditorDb = docsEditorDb()) {
  const department = await getDepartmentContext(departmentId);
  if (!department) return null;
  return ensureSpace({
      targetType: "department",
      targetId: department.id,
      title: `${department.name}模板空间`,
      description: "部门成员可查看，负责人可管理",
  }, db);
}

async function ensureQcOfficialTemplates(db: DocsEditorDb = docsEditorDb()) {
  const department = await getQcDepartmentContext();
  if (!department) return null;
  const space = await ensureDepartmentSpace(department.id, db);
  if (!space) return null;
  await syncGeneratedQcTemplates({ db, space });
  return space;
}

async function listExplicitSpaceSeeds(userId: number): Promise<SpaceSeed[]> {
  const rows = await prisma.documentTemplateSpacePermission.findMany({
    where: { userId, kind: docsEditorPermissionKind() },
    select: { targetType: true, targetId: true },
  });
  const seeds: SpaceSeed[] = [];
  const company = await getGroupCompanyContext();
  const companyId = company?.id ?? null;
  const departmentIds = rows
    .filter((row) => row.targetType === "department")
    .map((row) => row.targetId);
  const departments = departmentIds.length ? await prisma.department.findMany({
    where: { id: { in: departmentIds } },
    select: { id: true, name: true },
  }) : [];
  const departmentNameById = new Map(departments.map((department) => [department.id, department.name]));
  for (const row of rows) {
    const targetType = normalizeSpaceTargetType(row.targetType);
    if (targetType === "personal") continue;
    if (targetType === "company" && companyId === row.targetId && company) {
      seeds.push({
        targetType: "company",
        targetId: company.id,
        title: `${company.name}模板空间`,
        description: "集团级文档模板空间",
      });
    }
    if (targetType === "department" && departmentNameById.has(row.targetId)) {
      seeds.push({
        targetType: "department",
        targetId: row.targetId,
        title: `${departmentNameById.get(row.targetId)}模板空间`,
        description: "部门成员可查看，负责人可管理",
      });
    }
  }
  return seeds;
}

async function listAccessibleSpaces(userId: number) {
  const db = docsEditorDb();
  await ensureQcOfficialTemplates(db);
  const isAdmin = await canPublishOfficialQcTemplate(userId);
  const departments = isAdmin ? await getAllDepartmentContexts() : await getUserDepartmentContexts(userId);
  const personal = await ensurePersonalSpace(userId, db);
  const [companySpace, explicitSeeds] = await Promise.all([
    ensureCompanySpace(db),
    listExplicitSpaceSeeds(userId),
  ]);
  const departmentSpaces = await Promise.all(
    departments.map((department) => ensureDepartmentSpace(department.id, db)),
  );
  const explicitSpaces = await Promise.all(explicitSeeds.map((seed) => ensureSpace(seed, db)));
  const baseSpaces = [
    personal,
    ...(companySpace ? [companySpace] : []),
    ...departmentSpaces.filter((space): space is DocsEditorSpaceRow => Boolean(space)),
    ...explicitSpaces,
  ];
  const uniqueSpaces = new Map<number, DocsEditorSpaceRow>();
  baseSpaces.forEach((space) => uniqueSpaces.set(space.id, space));

  const result: Array<{ space: DocsEditorSpaceRow; role: DocsEditorPermissionRole }> = [];
  for (const space of Array.from(uniqueSpaces.values())) {
    const role = await resolveSpaceRole(userId, space);
    if (role) result.push({ space, role });
  }
  return result;
}

export async function listSpaces(input: { userId: number }): Promise<ServiceResult<DocsEditorSpaceDto[]>> {
  const spaces = await listAccessibleSpaces(input.userId);
  return serviceOk(spaces.map(({ space, role }) => toSpaceDto(space, role)));
}

async function listTemplatesForSpaces(
  input: ListTemplatesInput,
  spaces: Awaited<ReturnType<typeof listAccessibleSpaces>>,
): Promise<ServiceResult<DocsEditorTemplateListItemDto[]>> {
  const command = buildListTemplatesCommand(input);
  if (command.ok === false) return serviceError(command.issue.message, command.issue.status);

  const db = docsEditorDb();
  const roleBySpaceId = new Map(spaces.map(({ space, role }) => [space.id, role]));
  const spaceIds = command.data.spaceId ? [command.data.spaceId] : Array.from(roleBySpaceId.keys());
  const templates = await db.documentTemplate.findMany({
    where: {
      deletedAt: null,
      ...(command.data.status ? { status: command.data.status } : {}),
      ...(command.data.keyword ? { title: { contains: command.data.keyword } } : {}),
      spaceId: { in: spaceIds },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      type: true,
      status: true,
      ownerUserId: true,
      spaceId: true,
      sourceKind: true,
      sourceProductKey: true,
      sourceStageKeys: true,
      version: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
      publishedAt: true,
      publishedByUserId: true,
    },
  }) as DocsEditorTemplateListRow[];
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
    });
    if (role) rows.push(toListItemDto(template, role));
  }
  return serviceOk(rows);
}

export async function listTemplates(input: ListTemplatesInput): Promise<ServiceResult<DocsEditorTemplateListItemDto[]>> {
  const spaces = await listAccessibleSpaces(input.userId);
  return listTemplatesForSpaces(input, spaces);
}

async function getTemplateWithRole(userId: number, templateId: number, db: DocsEditorDb = docsEditorDb()) {
  const template = await db.documentTemplate.findFirst({
    where: { id: templateId, deletedAt: null },
  });
  if (!template) return null;
  const space = await db.documentTemplateSpace.findUnique({ where: { id: template.spaceId } });
  const role = await resolveTemplateRole({ userId, template, space });
  return { template, role };
}

export async function getTemplate(input: TemplateIdInput): Promise<ServiceResult<DocsEditorTemplateDetailDto>> {
  const command = buildTemplateIdCommand(input);
  if (command.ok === false) return serviceError(command.issue.message, command.issue.status);
  const db = docsEditorDb();
  await ensureQcOfficialTemplates(db);
  const current = await getTemplateWithRole(command.data.userId, command.data.templateId, db);
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
  if (command.spaceKind === "company") {
    return ensureCompanySpace(db);
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
    if (current.template.status === "archived") {
      return serviceError("已归档模板不能直接保存", 409);
    }
    const updated = await db.documentTemplate.update({
      where: { id: command.data.templateId },
      data: {
        ...command.data.data,
        status: current.template.status === "published" ? "published" : "draft",
        ...(current.template.status === "published" ? { publishedAt: new Date(), publishedByUserId: command.data.userId } : {}),
        version: { increment: 1 },
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
      sourceKind: null,
      sourceProductKey: null,
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

export async function getEditorBootstrap(input: ListTemplatesInput): Promise<ServiceResult<DocsEditorBootstrapDto>> {
  const spacesWithRoles = await listAccessibleSpaces(input.userId);
  const spaces = spacesWithRoles.map(({ space, role }) => toSpaceDto(space, role));
  const defaultSpaceId = spacesWithRoles[0]?.space.id;
  const templates = await listTemplatesForSpaces({
    ...input,
    spaceId: input.spaceId ?? defaultSpaceId,
  }, spacesWithRoles);
  if (templates.ok === false) return serviceError(templates.error, templates.status);
  return serviceOk({ spaces, templates: templates.data });
}
