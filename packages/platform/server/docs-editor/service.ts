import "server-only";

import {
  serviceError,
  serviceOk,
  type ServiceResult,
} from "../api";
import { assertBusinessActionDirectExecutionAllowed } from "../business-action-executor";
import { ensureEditHistoryBaseline, snapshotHistory } from "../history";
import { prisma } from "../prisma";
import {
  docsEditorDb,
  type DocsEditorDb,
  type DocsEditorTemplateRow,
} from "./db";
import {
  deleteTemplateContentFiles,
  deleteTemplateDraftContentFiles,
  readTemplateEditableContent,
  readTemplateContent,
  readTemplateContentJson,
  stripTemplateContentData,
  writeTemplateContentUpdate,
} from "./content-store";
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
  canArchiveDocsEditorTemplateAction,
  canCreateDocsEditorTemplateAction,
  canDeleteDocsEditorTemplateAction,
  canUpdateDocsEditorTemplateAction,
  docsEditorActionPermissionsForSpace,
} from "./permissions";
import {
  ensureOfficialTemplates,
} from "./official-template-sync";
export {
  getPublishedHrPositionDescriptionOfficialTemplate,
} from "./official-template-sync";
import type {
  DocsEditorBootstrapDto,
  DocsEditorSpaceActionPermissions,
  DocsEditorSpaceDto,
  DocsEditorTemplateDetailDto,
  DocsEditorTemplateListItemDto,
} from "./types";
import {
  listAccessibleSpaces,
  resolveTargetSpace,
  toSpaceDto,
  type DocsEditorAccessibleSpace,
} from "./space-service";
import {
  collectTemplateMetrics,
  type DocsEditorTemplateListRow,
} from "./template-metrics";

const TEMPLATE_SAVE_VERSION_CONFLICT_MESSAGE = "模板已被他人保存，请刷新后再编辑";
export const TEMPLATE_PUBLISH_VERSION_CONFLICT_MESSAGE = "模板已被他人保存或发布，请刷新后再发布";
const TEMPLATE_DELETE_VERSION_CONFLICT_MESSAGE = "模板已被他人保存或发布，请刷新后再删除";
const TEMPLATE_ARCHIVE_VERSION_CONFLICT_MESSAGE = "模板已被他人保存或发布，请刷新后再归档";
const TEMPLATE_DIRECT_WRITE_REQUIRED_MESSAGE = "该行为已配置为必须走流程，请提交发布审核";
export type TemplateMetadataUpdate = Partial<Pick<
  DocsEditorTemplateRow,
  "title" | "type" | "sourceKind" | "sourceProductKey" | "sourceStageKeys"
>>;

function asStatus(value: string) {
  if (value === "published" || value === "archived") return value;
  return "draft";
}

export function nextDraftStorageTemplate(
  template: DocsEditorTemplateRow,
  data: TemplateMetadataUpdate,
  version: number,
): DocsEditorTemplateRow {
  return {
    ...template,
    title: typeof data.title === "string" ? data.title : template.title,
    type: typeof data.type === "string" ? data.type : template.type,
    sourceKind: data.sourceKind === undefined ? template.sourceKind : data.sourceKind ?? null,
    sourceProductKey: data.sourceProductKey === undefined ? template.sourceProductKey : data.sourceProductKey ?? null,
    sourceStageKeys: data.sourceStageKeys === undefined ? template.sourceStageKeys : data.sourceStageKeys ?? null,
    version,
  };
}

function templateReferenceBlockMessage(template: DocsEditorTemplateRow) {
  if (template.sourceKind === "production.qc.official") {
    const name = template.title.replace(/^批检验记录：/, "") || template.sourceProductKey || template.title;
    return `有流程在引用质量控制模板「${name}」，请联系管理员处理`;
  }
  if (template.sourceKind === "hr.position-description.official") {
    return "有流程在引用 HR 岗位说明书模板，请联系管理员处理";
  }
  return null;
}

export async function assertDocsEditorDirectWriteAllowed(input: {
  userId: number;
  space: DocsEditorAccessibleSpace["space"];
  businessActionKey: string;
}) {
  const businessActionKey = input.businessActionKey;
  return assertBusinessActionDirectExecutionAllowed({
    businessActionKey,
    actorUserId: input.userId,
    workflowApplicable: input.space.targetType !== "personal",
    scopeType: input.space.targetType,
    scopeId: input.space.targetId,
    defaults: {
      businessActionKey,
      mode: "optional",
      flowType: "publish",
      separationPolicy: "auto_pass_if_authorized",
      handlerSource: "permission",
    },
    blockedMessage: TEMPLATE_DIRECT_WRITE_REQUIRED_MESSAGE,
  });
}

async function toListItemDto(
  template: DocsEditorTemplateListRow,
  actionPermissions: DocsEditorSpaceActionPermissions,
): Promise<DocsEditorTemplateListItemDto> {
  return {
    id: String(template.id),
    title: template.title,
    type: template.type,
    status: asStatus(template.status),
    spaceId: String(template.spaceId),
    version: template.version,
    updatedAt: template.updatedAt.toISOString(),
    sourceKind: template.sourceKind,
    sourceProductKey: template.sourceProductKey,
    actionPermissions,
    ...(await collectTemplateMetrics(template)),
  };
}

export async function templateDetailDto(
  template: DocsEditorTemplateRow,
  actionPermissions: DocsEditorSpaceActionPermissions,
  space?: DocsEditorAccessibleSpace["space"] | null,
): Promise<DocsEditorTemplateDetailDto> {
  const [content, listItem] = await Promise.all([
    space ? readTemplateEditableContent({ template, space, row: template }) : readTemplateContent(template),
    toListItemDto(template, actionPermissions),
  ]);
  return {
    ...listItem,
    document: content.document,
    fieldModel: content.fieldModel,
  };
}

export async function listSpaces(input: { userId: number }): Promise<ServiceResult<DocsEditorSpaceDto[]>> {
  const spaces = await listAccessibleSpaces(input.userId);
  return serviceOk(await Promise.all(spaces.map(({ space, actionPermissions }) => toSpaceDto(input.userId, space, actionPermissions))));
}

async function listTemplatesForSpaces(
  input: ListTemplatesInput,
  spaces: DocsEditorAccessibleSpace[],
): Promise<ServiceResult<DocsEditorTemplateListItemDto[]>> {
  const command = buildListTemplatesCommand(input);
  if (command.ok === false) return serviceError(command.issue.message, command.issue.status);

  const db = docsEditorDb();
  const actionPermissionsBySpaceId = new Map(spaces.map(({ space, actionPermissions }) => [space.id, actionPermissions]));
  const spaceIds = command.data.spaceId ? [command.data.spaceId] : Array.from(actionPermissionsBySpaceId.keys());
  const templates = await db.documentTemplate.findMany({
    where: {
      deletedAt: null,
      ...(command.data.status ? { status: command.data.status } : {}),
      ...(command.data.keyword ? { title: { contains: command.data.keyword, mode: "insensitive" as const } } : {}),
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
      documentContentRef: true,
      fieldModelContentRef: true,
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
    const space = spaceById.get(template.spaceId) ?? null;
    const actionPermissions = actionPermissionsBySpaceId.get(template.spaceId)
      ?? (space ? await docsEditorActionPermissionsForSpace(command.data.userId, space) : null);
    if (actionPermissions && hasAnyTemplateAction(actionPermissions)) rows.push(await toListItemDto(template, actionPermissions));
  }
  return serviceOk(rows);
}

export async function listTemplates(input: ListTemplatesInput): Promise<ServiceResult<DocsEditorTemplateListItemDto[]>> {
  const spaces = await listAccessibleSpaces(input.userId);
  return listTemplatesForSpaces(input, spaces);
}

export async function getTemplateWithAccess(userId: number, templateId: number, db: DocsEditorDb = docsEditorDb()) {
  const template = await db.documentTemplate.findFirst({
    where: { id: templateId, deletedAt: null },
  });
  if (!template) return null;
  const space = await db.documentTemplateSpace.findUnique({ where: { id: template.spaceId } });
  const actionPermissions = space ? await docsEditorActionPermissionsForSpace(userId, space) : null;
  return { template, actionPermissions, space };
}

export async function getTemplate(input: TemplateIdInput): Promise<ServiceResult<DocsEditorTemplateDetailDto>> {
  const command = buildTemplateIdCommand(input);
  if (command.ok === false) return serviceError(command.issue.message, command.issue.status);
  const db = docsEditorDb();
  await ensureOfficialTemplates(db);
  const current = await getTemplateWithAccess(command.data.userId, command.data.templateId, db);
  if (!current) return serviceError("模板不存在", 404);
  if (!current.actionPermissions || !hasAnyTemplateAction(current.actionPermissions)) return serviceError("无权限", 403);
  return serviceOk(await templateDetailDto(current.template, current.actionPermissions, current.space));
}

export async function saveDraft(input: SaveDraftInput): Promise<ServiceResult<DocsEditorTemplateDetailDto>> {
  const command = buildSaveDraftCommand(input);
  if (command.ok === false) return serviceError(command.issue.message, command.issue.status);

  const db = docsEditorDb();
  if (command.data.templateId) {
    const templateId = command.data.templateId;
    const current = await getTemplateWithAccess(command.data.userId, templateId);
    if (!current) return serviceError("模板不存在", 404);
    const currentSpace = current.space;
    if (!currentSpace) return serviceError("模板空间不存在", 404);
    if (command.data.updateGuard !== "workflow-approved" && !(await canUpdateDocsEditorTemplateAction(command.data.userId, currentSpace))) return serviceError("无权限", 403);
    if (command.data.updateGuard !== "workflow-approved") {
      const workflow = await assertDocsEditorDirectWriteAllowed({
        userId: command.data.userId,
        space: currentSpace,
        businessActionKey: "docs.editor.template.draft.save",
      });
      if (!workflow.ok) return workflow;
    }
    if (current.template.status === "archived") {
      return serviceError("已归档模板不能直接保存", 409);
    }
    const expectedVersion = command.data.expectedVersion;
    if (expectedVersion === undefined) return serviceError("缺少模板版本", 400);
    const updated = await prisma.$transaction(async (tx) => {
      const txDb = docsEditorDb(tx);
      await ensureEditHistoryBaseline("DocumentTemplate", templateId, command.data.userId, tx);
      const metadataUpdate = stripTemplateContentData(command.data.data) as TemplateMetadataUpdate;
      const claimed = await txDb.documentTemplate.updateMany({
        where: { id: templateId, version: expectedVersion, deletedAt: null },
        data: {
          ...metadataUpdate,
          status: current.template.status === "published" ? current.template.status : "draft",
          version: { increment: 1 },
        },
      });
      if (claimed.count === 0) return null;
      const contentUpdate = await writeTemplateContentUpdate({
        template: nextDraftStorageTemplate(current.template, metadataUpdate, expectedVersion + 1),
        space: currentSpace,
        data: command.data.data,
        existing: current.template,
        mode: "draft",
      });
      if (current.template.status !== "published" && Object.keys(contentUpdate).length > 0) {
        await txDb.documentTemplate.update({ where: { id: templateId }, data: contentUpdate });
      }
      await snapshotHistory("DocumentTemplate", templateId, command.data.userId, tx);
      return txDb.documentTemplate.findUnique({ where: { id: templateId } });
    });
    if (!updated) return serviceError(TEMPLATE_SAVE_VERSION_CONFLICT_MESSAGE, 409);
    return serviceOk(await templateDetailDto(updated, await docsEditorActionPermissionsForSpace(command.data.userId, currentSpace), currentSpace));
  }

  const targetSpace = await resolveTargetSpace(command.data, db);
  if (!targetSpace) return serviceError("目标空间不存在", 404);
  if (command.data.updateGuard !== "workflow-approved" && !(await canCreateDocsEditorTemplateAction(command.data.userId, targetSpace))) return serviceError("无权限", 403);
  if (command.data.updateGuard !== "workflow-approved") {
    const workflow = await assertDocsEditorDirectWriteAllowed({
      userId: command.data.userId,
      space: targetSpace,
      businessActionKey: "docs.editor.template.draft.create",
    });
    if (!workflow.ok) return workflow;
  }
  const saved = await prisma.$transaction(async (tx) => {
    const txDb = docsEditorDb(tx);
    const created = await txDb.documentTemplate.create({
      data: {
        title: command.data.data.title || "未命名模板",
        type: command.data.data.type || "document",
        status: "draft",
        ownerUserId: command.data.userId,
        spaceId: targetSpace.id,
        sourceKind: command.data.data.sourceKind ?? null,
        sourceProductKey: command.data.data.sourceProductKey ?? null,
        sourceStageKeys: command.data.data.sourceStageKeys ?? null,
      },
    });
    const createdContentUpdate = await writeTemplateContentUpdate({
      template: created,
      space: targetSpace,
      data: command.data.data,
      existing: created,
      mode: "draft",
    });
    const result = Object.keys(createdContentUpdate).length
      ? await txDb.documentTemplate.update({ where: { id: created.id }, data: createdContentUpdate })
      : created;
    await snapshotHistory("DocumentTemplate", result.id, command.data.userId, tx);
    return result;
  });
  return serviceOk(await templateDetailDto(saved, await docsEditorActionPermissionsForSpace(command.data.userId, targetSpace), targetSpace));
}

export async function copyTemplate(input: CopyTemplateInput): Promise<ServiceResult<DocsEditorTemplateDetailDto>> {
  const command = buildCopyTemplateCommand(input);
  if (command.ok === false) return serviceError(command.issue.message, command.issue.status);
  const source = await getTemplateWithAccess(command.data.userId, command.data.templateId);
  if (!source) return serviceError("模板不存在", 404);
  if (!source.actionPermissions || !hasAnyTemplateAction(source.actionPermissions)) return serviceError("无权限", 403);

  const db = docsEditorDb();
  const targetSpace = await resolveTargetSpace({
    userId: command.data.userId,
    spaceId: command.data.targetSpaceId,
    departmentId: command.data.targetDepartmentId,
  }, db);
  if (!targetSpace) return serviceError("目标空间不存在", 404);
  if (!(await canCreateDocsEditorTemplateAction(command.data.userId, targetSpace))) return serviceError("无权限", 403);
  const sourceContent = await readTemplateContentJson(source.template);

  const saved = await prisma.$transaction(async (tx) => {
    const txDb = docsEditorDb(tx);
    const created = await txDb.documentTemplate.create({
      data: {
        title: command.data.title || `${source.template.title} 副本`,
        type: source.template.type,
        status: "draft",
        ownerUserId: command.data.userId,
        spaceId: targetSpace.id,
        sourceKind: null,
        sourceProductKey: null,
        sourceStageKeys: source.template.sourceStageKeys,
      },
    });
    const createdContentUpdate = await writeTemplateContentUpdate({
      template: created,
      space: targetSpace,
      data: sourceContent,
      existing: created,
      mode: "draft",
    });
    const result = await txDb.documentTemplate.update({ where: { id: created.id }, data: createdContentUpdate });
    await snapshotHistory("DocumentTemplate", result.id, command.data.userId, tx);
    return result;
  });
  return serviceOk(await templateDetailDto(saved, await docsEditorActionPermissionsForSpace(command.data.userId, targetSpace), targetSpace));
}

export async function deleteDraft(input: TemplateIdInput): Promise<ServiceResult<{ id: string }>> {
  const command = buildTemplateIdCommand(input);
  if (command.ok === false) return serviceError(command.issue.message, command.issue.status);
  if (command.data.expectedVersion === undefined) return serviceError("缺少模板版本", 400);
  const current = await getTemplateWithAccess(command.data.userId, command.data.templateId);
  if (!current) return serviceError("模板不存在", 404);
  if (!current.space) return serviceError("模板空间不存在", 404);
  if (!(await canDeleteDocsEditorTemplateAction(command.data.userId, current.space))) return serviceError("无权限", 403);
  const blockMessage = templateReferenceBlockMessage(current.template);
  if (blockMessage) return serviceError(blockMessage, 409);
  if (current.template.status !== "draft") return serviceError("只能删除草稿模板", 409);
  const deleted = await prisma.$transaction(async (tx) => {
    const txDb = docsEditorDb(tx);
    await ensureEditHistoryBaseline("DocumentTemplate", command.data.templateId, command.data.userId, tx);
    const claimed = await txDb.documentTemplate.updateMany({
      where: { id: command.data.templateId, version: command.data.expectedVersion, deletedAt: null },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    if (claimed.count === 0) return false;
    await snapshotHistory("DocumentTemplate", command.data.templateId, command.data.userId, tx);
    return true;
  });
  if (!deleted) return serviceError(TEMPLATE_DELETE_VERSION_CONFLICT_MESSAGE, 409);
  await deleteTemplateContentFiles(current.template);
  await deleteTemplateDraftContentFiles({
    template: current.template,
    space: current.space,
  });
  return serviceOk({ id: String(command.data.templateId) });
}

export async function archiveTemplate(input: TemplateIdInput): Promise<ServiceResult<DocsEditorTemplateDetailDto>> {
  const command = buildTemplateIdCommand(input);
  if (command.ok === false) return serviceError(command.issue.message, command.issue.status);
  if (command.data.expectedVersion === undefined) return serviceError("缺少模板版本", 400);
  const current = await getTemplateWithAccess(command.data.userId, command.data.templateId);
  if (!current) return serviceError("模板不存在", 404);
  if (!current.space) return serviceError("模板空间不存在", 404);
  if (!(await canArchiveDocsEditorTemplateAction(command.data.userId, current.space))) return serviceError("无权限", 403);
  const blockMessage = templateReferenceBlockMessage(current.template);
  if (blockMessage) return serviceError(blockMessage, 409);
  if (current.template.status === "draft") return serviceError("草稿模板请直接删除", 409);
  if (current.template.status === "archived") return serviceError("模板已归档", 409);
  const archived = await prisma.$transaction(async (tx) => {
    const txDb = docsEditorDb(tx);
    await ensureEditHistoryBaseline("DocumentTemplate", command.data.templateId, command.data.userId, tx);
    const claimed = await txDb.documentTemplate.updateMany({
      where: { id: command.data.templateId, version: command.data.expectedVersion, deletedAt: null },
      data: { status: "archived", version: { increment: 1 } },
    });
    if (claimed.count === 0) return null;
    await snapshotHistory("DocumentTemplate", command.data.templateId, command.data.userId, tx);
    return txDb.documentTemplate.findUnique({ where: { id: command.data.templateId } });
  });
  if (!archived) return serviceError(TEMPLATE_ARCHIVE_VERSION_CONFLICT_MESSAGE, 409);
  return serviceOk(await templateDetailDto(archived, await docsEditorActionPermissionsForSpace(command.data.userId, current.space), current.space));
}

export async function getEditorBootstrap(input: ListTemplatesInput): Promise<ServiceResult<DocsEditorBootstrapDto>> {
  const spacesWithRoles = await listAccessibleSpaces(input.userId);
  const spaces = await Promise.all(spacesWithRoles.map(({ space, actionPermissions }) => toSpaceDto(input.userId, space, actionPermissions)));
  const defaultSpaceId = spacesWithRoles[0]?.space.id;
  const templates = await listTemplatesForSpaces({
    ...input,
    spaceId: input.spaceId ?? defaultSpaceId,
  }, spacesWithRoles);
  if (templates.ok === false) return serviceError(templates.error, templates.status);
  return serviceOk({ spaces, templates: templates.data });
}

function hasAnyTemplateAction(actions: DocsEditorSpaceActionPermissions) {
  return actions.canRead
    || actions.canCreate
    || actions.canUpdate
    || actions.canDelete
    || actions.canArchive
    || actions.canSubmit
    || actions.canApprove
    || actions.canPublish
    || actions.canExport
    || actions.canManagePermissions;
}
