import "server-only";

import { serviceError, serviceOk, type ServiceResult } from "../api";
import { ensureEditHistoryBaseline, snapshotHistory } from "../history";
import { prisma } from "../prisma";
import {
  deleteTemplateDraftContentFiles,
  readTemplateContentJson,
  readTemplateDraftContentJson,
  stripTemplateContentData,
  writeTemplateContentJson,
} from "./content-store";
import { docsEditorDb } from "./db";
import {
  buildSaveDraftCommand,
  buildTemplateIdCommand,
  type SaveDraftInput,
  type TemplateIdInput,
} from "./domain/document-template-validation";
import { canPublishDocsEditorTemplateAction, docsEditorActionPermissionsForSpace } from "./permissions";
import {
  assertDocsEditorDirectWriteAllowed,
  getTemplateWithAccess,
  nextDraftStorageTemplate,
  templateDetailDto,
  TEMPLATE_PUBLISH_VERSION_CONFLICT_MESSAGE,
  type TemplateMetadataUpdate,
} from "./service";
import type { DocsEditorTemplateDetailDto } from "./types";

export async function publishDraft(input: TemplateIdInput): Promise<ServiceResult<DocsEditorTemplateDetailDto>> {
  const command = buildTemplateIdCommand(input);
  if (command.ok === false) return serviceError(command.issue.message, command.issue.status);
  if (command.data.expectedVersion === undefined) return serviceError("缺少模板版本", 400);
  const current = await getTemplateWithAccess(command.data.userId, command.data.templateId);
  if (!current) return serviceError("模板不存在", 404);
  if (!current.space) return serviceError("模板空间不存在", 404);
  if (command.data.updateGuard !== "workflow-approved" && !(await canPublishDocsEditorTemplateAction(command.data.userId, current.space))) return serviceError("无权限", 403);
  if (command.data.updateGuard !== "workflow-approved") {
    const workflow = await assertDocsEditorDirectWriteAllowed({
      userId: command.data.userId,
      space: current.space,
      businessActionKey: "docs.editor.template.publish",
    });
    if (!workflow.ok) return workflow;
  }
  if (current.template.status === "archived") return serviceError("已归档模板不能发布", 409);

  const draftContent = await readTemplateDraftContentJson({
    template: current.template,
    space: current.space,
  });
  if (!draftContent && current.template.status !== "draft") return serviceError("没有可发布的草稿", 409);
  const content = draftContent ?? await readTemplateContentJson(current.template);

  const published = await prisma.$transaction(async (tx) => {
    const txDb = docsEditorDb(tx);
    await ensureEditHistoryBaseline("DocumentTemplate", command.data.templateId, command.data.userId, tx);
    const claimed = await txDb.documentTemplate.updateMany({
      where: { id: command.data.templateId, version: command.data.expectedVersion, deletedAt: null },
      data: { version: { increment: 1 } },
    });
    if (claimed.count === 0) return null;
    const contentMetadata = await writeTemplateContentJson({
      template: current.template,
      space: current.space!,
      ...content,
      mode: "version",
    });
    await txDb.documentTemplate.update({
      where: { id: command.data.templateId },
      data: {
        ...contentMetadata,
        status: "published",
        publishedAt: new Date(),
        publishedByUserId: command.data.userId,
      },
    });
    await snapshotHistory("DocumentTemplate", command.data.templateId, command.data.userId, tx);
    return txDb.documentTemplate.findUnique({ where: { id: command.data.templateId } });
  });
  if (!published) return serviceError(TEMPLATE_PUBLISH_VERSION_CONFLICT_MESSAGE, 409);
  await deleteTemplateDraftContentFiles({ template: current.template, space: current.space });
  return serviceOk(await templateDetailDto(published, await docsEditorActionPermissionsForSpace(command.data.userId, current.space), current.space));
}

export async function publishTemplateSnapshot(input: SaveDraftInput & {
  templateId: number | string;
  version: number | string | null;
}): Promise<ServiceResult<DocsEditorTemplateDetailDto>> {
  const command = buildSaveDraftCommand(input);
  if (command.ok === false) return serviceError(command.issue.message, command.issue.status);
  const templateId = command.data.templateId;
  const expectedVersion = command.data.expectedVersion;
  const documentJson = command.data.data.documentJson;
  const fieldModelJson = command.data.data.fieldModelJson;
  if (!templateId) return serviceError("模板 ID 无效", 400);
  if (expectedVersion === undefined) return serviceError("缺少模板版本", 400);
  if (documentJson === undefined || fieldModelJson === undefined) {
    return serviceError("发布流程缺少模板内容快照", 400);
  }

  const current = await getTemplateWithAccess(command.data.userId, templateId);
  if (!current) return serviceError("模板不存在", 404);
  if (!current.space) return serviceError("模板空间不存在", 404);
  if (command.data.updateGuard !== "workflow-approved" && !(await canPublishDocsEditorTemplateAction(command.data.userId, current.space))) return serviceError("无权限", 403);
  if (command.data.updateGuard !== "workflow-approved") {
    const workflow = await assertDocsEditorDirectWriteAllowed({
      userId: command.data.userId,
      space: current.space,
      businessActionKey: "docs.editor.template.publish",
    });
    if (!workflow.ok) return workflow;
  }
  if (current.template.status === "archived") return serviceError("已归档模板不能发布", 409);

  const metadataUpdate = stripTemplateContentData(command.data.data) as TemplateMetadataUpdate;
  const storageTemplate = nextDraftStorageTemplate(current.template, metadataUpdate, expectedVersion);
  const published = await prisma.$transaction(async (tx) => {
    const txDb = docsEditorDb(tx);
    await ensureEditHistoryBaseline("DocumentTemplate", templateId, command.data.userId, tx);
    const claimed = await txDb.documentTemplate.updateMany({
      where: { id: templateId, version: expectedVersion, deletedAt: null },
      data: {
        ...metadataUpdate,
        version: { increment: 1 },
      },
    });
    if (claimed.count === 0) return null;
    const contentMetadata = await writeTemplateContentJson({
      template: storageTemplate,
      space: current.space!,
      documentJson,
      fieldModelJson,
      mode: "version",
    });
    await txDb.documentTemplate.update({
      where: { id: templateId },
      data: {
        ...contentMetadata,
        status: "published",
        publishedAt: new Date(),
        publishedByUserId: command.data.userId,
      },
    });
    await snapshotHistory("DocumentTemplate", templateId, command.data.userId, tx);
    return txDb.documentTemplate.findUnique({ where: { id: templateId } });
  });
  if (!published) return serviceError(TEMPLATE_PUBLISH_VERSION_CONFLICT_MESSAGE, 409);
  await deleteTemplateDraftContentFiles({ template: current.template, space: current.space });
  return serviceOk(await templateDetailDto(published, await docsEditorActionPermissionsForSpace(command.data.userId, current.space), current.space));
}
