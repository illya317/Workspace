import "server-only";

import { createHash } from "crypto";
import {
  docsEditorDb,
  type DocsEditorDb,
} from "./db";
import {
  readTemplateContent,
  readTemplateContentHashes,
  writeTemplateContentJson,
} from "./content-store";
import {
  normalizeDocumentTemplatePayload,
} from "./domain/document-template-validation";
import {
  syncGeneratedQcTemplates,
} from "./generated-qc";
import {
  getDepartmentContext,
  getHrDepartmentContext,
  getQcDepartmentContext,
} from "./permissions";
import {
  HR_POSITION_DESCRIPTION_TEMPLATE_PRODUCT_KEY,
  HR_POSITION_DESCRIPTION_TEMPLATE_SOURCE_KIND,
  hrPositionDescriptionOfficialTemplateSource,
} from "./official-templates";

function sameTime(left: Date | null, right: Date | null) {
  return (left?.getTime() ?? null) === (right?.getTime() ?? null);
}

async function ensureSpace(seed: {
  targetType: "department";
  targetId: number;
  title: string;
  description: string;
}, db: DocsEditorDb) {
  const existing = await db.documentTemplateSpace.findFirst({
    where: { targetType: seed.targetType, targetId: seed.targetId, deletedAt: null },
    orderBy: { id: "asc" },
  });
  if (existing) return existing;
  return db.documentTemplateSpace.create({ data: seed });
}

async function ensureDepartmentSpace(departmentId: number, db: DocsEditorDb) {
  const department = await getDepartmentContext(departmentId);
  if (!department) return null;
  return ensureSpace({
    targetType: "department",
    targetId: department.id,
    title: `${department.name}模板空间`,
    description: "部门成员可查看，负责人可管理",
  }, db);
}

async function ensureQcOfficialTemplates(db: DocsEditorDb) {
  const department = await getQcDepartmentContext();
  if (!department) return null;
  const space = await ensureDepartmentSpace(department.id, db);
  if (!space) return null;
  await syncGeneratedQcTemplates({ db, space });
  return space;
}

async function ensureHrPositionDescriptionOfficialTemplate(db: DocsEditorDb) {
  const department = await getHrDepartmentContext();
  if (!department) return null;
  const space = await ensureDepartmentSpace(department.id, db);
  if (!space) return null;
  const source = hrPositionDescriptionOfficialTemplateSource();
  const normalized = normalizeDocumentTemplatePayload(source.document, source.fieldModel);
  if (normalized.ok === false) {
    throw new Error(`HR 官方岗位说明书模板数据无效：${normalized.issue.message}`);
  }
  const existing = await db.documentTemplate.findFirst({
    where: {
      sourceKind: HR_POSITION_DESCRIPTION_TEMPLATE_SOURCE_KIND,
      sourceProductKey: HR_POSITION_DESCRIPTION_TEMPLATE_PRODUCT_KEY,
      deletedAt: null,
    },
    orderBy: { id: "asc" },
  });
  const data = {
    title: source.title,
    type: source.type,
    status: "published",
    ownerUserId: null,
    spaceId: space.id,
    sourceKind: HR_POSITION_DESCRIPTION_TEMPLATE_SOURCE_KIND,
    sourceProductKey: HR_POSITION_DESCRIPTION_TEMPLATE_PRODUCT_KEY,
    sourceStageKeys: source.sourceStageKeys,
    publishedAt: source.publishedAt ? new Date(source.publishedAt) : null,
    publishedByUserId: null,
  };
  const content = {
    documentJson: JSON.stringify(normalized.data.document),
    fieldModelJson: JSON.stringify(normalized.data.fieldModel),
  };
  const sourceDocumentHash = contentHash(content.documentJson);
  const sourceFieldModelHash = contentHash(content.fieldModelJson);
  const sourcePublishedAt = source.publishedAt ? new Date(source.publishedAt) : null;

  if (existing) {
    if (existing.publishedByUserId !== null) {
      if (existing.spaceId !== space.id) {
        await db.documentTemplate.update({ where: { id: existing.id }, data: { spaceId: space.id } });
      }
      return space;
    }
    const metadataCurrent = existing.title === data.title
      && existing.type === data.type
      && existing.status === data.status
      && existing.spaceId === space.id
      && existing.sourceKind === data.sourceKind
      && existing.sourceProductKey === data.sourceProductKey
      && existing.sourceStageKeys === data.sourceStageKeys
      && sameTime(existing.publishedAt, sourcePublishedAt);

    let contentCurrent = false;
    if (metadataCurrent) {
      const runtimeHashes = await readTemplateContentHashes(existing);
      contentCurrent = runtimeHashes !== null
        && runtimeHashes.documentHash === sourceDocumentHash
        && runtimeHashes.fieldModelHash === sourceFieldModelHash;
    }

    if (metadataCurrent && contentCurrent) return space;

    const contentMetadata = await writeTemplateContentJson({
      template: {
        ...existing,
        title: data.title,
        type: data.type,
        status: data.status,
        ownerUserId: data.ownerUserId,
        sourceKind: data.sourceKind,
        sourceProductKey: data.sourceProductKey,
      },
      space,
      ...content,
      mode: "version",
    });
    await db.documentTemplate.update({
      where: { id: existing.id },
      data: {
        ...data,
        ...contentMetadata,
        version: { increment: 1 },
      },
    });
    return space;
  }

  const created = await db.documentTemplate.create({ data });
  const contentMetadata = await writeTemplateContentJson({
    template: created,
    space,
    ...content,
    mode: "version",
  });
  await db.documentTemplate.update({
    where: { id: created.id },
    data: contentMetadata,
  });
  return space;
}

export async function ensureOfficialTemplates(db: DocsEditorDb = docsEditorDb()) {
  const [qcSpace, hrSpace] = await Promise.all([
    ensureQcOfficialTemplates(db),
    ensureHrPositionDescriptionOfficialTemplate(db),
  ]);
  return { qcSpace, hrSpace };
}

export async function getPublishedHrPositionDescriptionOfficialTemplate() {
  const db = docsEditorDb();
  await ensureOfficialTemplates(db);
  const template = await db.documentTemplate.findFirst({
    where: {
      sourceKind: HR_POSITION_DESCRIPTION_TEMPLATE_SOURCE_KIND,
      sourceProductKey: HR_POSITION_DESCRIPTION_TEMPLATE_PRODUCT_KEY,
      status: "published",
      deletedAt: null,
    },
    orderBy: [{ version: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
  });
  if (!template) return null;
  const content = await readTemplateContent(template);
  return {
    id: template.id,
    version: template.version,
    title: template.title,
    document: content.document,
    fieldModel: content.fieldModel,
  };
}

function contentHash(content: string) {
  return createHash("sha256").update(content).digest("hex");
}
