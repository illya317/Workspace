import "server-only";

import path from "path";
import { readdir, readFile } from "fs/promises";
import {
  serviceError,
  serviceOk,
  type ServiceResult,
} from "../api";
import { authorize } from "../auth/authorize";
import {
  docsEditorDb,
  type DocsEditorDb,
  type DocsEditorSpaceRow,
  type DocsEditorTemplateRow,
} from "./db";
import type { CopyTemplateInput } from "./domain/document-template-validation";
import {
  canPublishOfficialQcTemplate,
  isDocsEditorRoleAtLeast,
  resolveSpaceRole,
} from "./permissions";
import type {
  DocsEditorPermissionRole,
  DocsEditorTemplateDetailDto,
  DocsEditorTemplateListItemDto,
} from "./types";
import {
  GENERATED_QC_SPACE_ID,
  GENERATED_QC_TEMPLATE_PREFIX,
  numberFromString,
} from "./ids";

type GeneratedQcPayload = {
  productKey: string;
  productName: string;
  generatedAt?: string;
  document: unknown;
  fieldModel: unknown;
  audit?: {
    stages?: number;
    fields?: number;
    formulas?: number;
    tables?: number;
  };
};

export type GeneratedQcCopyContext = {
  resolveTargetSpace: (command: {
    userId: number;
    spaceId?: number;
    departmentId?: number;
    spaceKind?: string;
  }, db: DocsEditorDb) => Promise<DocsEditorSpaceRow | null>;
  templateDetailDto: (
    template: DocsEditorTemplateRow,
    role: DocsEditorPermissionRole,
  ) => Promise<DocsEditorTemplateDetailDto>;
  roleOrViewer: (role: DocsEditorPermissionRole | null) => DocsEditorPermissionRole;
};

export async function canAccessGeneratedQcTemplates(userId: number) {
  return authorize({ user: userId, resourceKey: "production.qcTemplates", action: "access" });
}

export async function listGeneratedQcTemplates(userId: number): Promise<ServiceResult<DocsEditorTemplateListItemDto[]>> {
  if (!(await canAccessGeneratedQcTemplates(userId))) return serviceError("无 QC 模版权限", 403);
  const role: DocsEditorPermissionRole = await canPublishOfficialQcTemplate(userId) ? "manager" : "viewer";
  const files = (await readdir(generatedQcProductsRoot()).catch(() => [])).filter((file) => file.endsWith(".json")).sort();
  const rows: DocsEditorTemplateListItemDto[] = [];
  for (const file of files) {
    const payload = await readGeneratedQcPayload(path.join(generatedQcProductsRoot(), file));
    if (payload) rows.push(generatedQcListItem(payload, role));
  }
  return serviceOk(rows);
}

export async function getGeneratedQcTemplate(userId: number, templateId: string): Promise<ServiceResult<DocsEditorTemplateDetailDto>> {
  if (!(await canAccessGeneratedQcTemplates(userId))) return serviceError("无 QC 模版权限", 403);
  const productKey = templateId.slice(GENERATED_QC_TEMPLATE_PREFIX.length);
  const payload = await readGeneratedQcPayload(path.join(generatedQcProductsRoot(), `${productKey}.json`));
  if (!payload) return serviceError("生成模板不存在", 404);
  const role: DocsEditorPermissionRole = await canPublishOfficialQcTemplate(userId) ? "manager" : "viewer";
  return serviceOk({
    ...generatedQcListItem(payload, role),
    document: payload.document,
    fieldModel: payload.fieldModel,
    permissions: [],
  });
}

export async function copyGeneratedQcTemplate(
  input: CopyTemplateInput,
  context: GeneratedQcCopyContext,
): Promise<ServiceResult<DocsEditorTemplateDetailDto>> {
  const detail = await getGeneratedQcTemplate(input.userId, String(input.templateId));
  if (detail.ok === false) return detail;
  const db = docsEditorDb();
  const targetSpace = await context.resolveTargetSpace({
    userId: input.userId,
    spaceId: numberFromString(input.targetSpaceId),
    departmentId: numberFromString(input.targetDepartmentId),
  }, db);
  if (!targetSpace) return serviceError("目标空间不存在", 404);
  const targetRole = await resolveSpaceRole(input.userId, targetSpace);
  if (!isDocsEditorRoleAtLeast(targetRole, "editor")) return serviceError("无权限", 403);

  const created = await db.documentTemplate.create({
    data: {
      title: input.title || detail.data.title,
      type: detail.data.type,
      status: "draft",
      ownerUserId: input.userId,
      spaceId: targetSpace.id,
      documentJson: JSON.stringify(detail.data.document),
      fieldModelJson: JSON.stringify(detail.data.fieldModel),
      sourceKind: detail.data.sourceKind,
      sourceProductKey: detail.data.sourceProductKey,
      sourceStageKeys: JSON.stringify(["intermediate", "packaging", "finished"]),
    },
  });
  return serviceOk(await context.templateDetailDto(created, context.roleOrViewer(targetRole)));
}

function generatedQcListItem(payload: GeneratedQcPayload, role: DocsEditorPermissionRole): DocsEditorTemplateListItemDto {
  const audit = payload.audit ?? {};
  return {
    id: `${GENERATED_QC_TEMPLATE_PREFIX}${payload.productKey}`,
    title: `批检验记录：${payload.productName}`,
    type: "qc",
    status: "published",
    spaceId: GENERATED_QC_SPACE_ID,
    updatedAt: payload.generatedAt ?? "",
    sourceKind: "production.qc.official",
    sourceProductKey: payload.productKey,
    stageCount: Number(audit.stages ?? 3),
    fieldCount: Number(audit.fields ?? generatedFieldCount(payload.fieldModel)),
    formulaCount: Number(audit.formulas ?? generatedFormulaCount(payload.fieldModel)),
    tableCount: Number(audit.tables ?? generatedTableCount(payload.document)),
    role,
  };
}

function generatedQcProductsRoot() {
  return path.resolve(process.cwd(), "generated", "docs-editor", "qc", "products");
}

async function readGeneratedQcPayload(filePath: string): Promise<GeneratedQcPayload | null> {
  const raw = await readFile(filePath, "utf8").catch(() => "");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<GeneratedQcPayload>;
    return typeof parsed.productKey === "string" && typeof parsed.productName === "string"
      ? parsed as GeneratedQcPayload
      : null;
  } catch {
    return null;
  }
}

function generatedFieldCount(fieldModel: unknown) {
  return Boolean(fieldModel && typeof fieldModel === "object" && "fields" in fieldModel)
    ? Object.keys((fieldModel as { fields?: Record<string, unknown> }).fields ?? {}).length
    : 0;
}

function generatedFormulaCount(fieldModel: unknown) {
  return Boolean(fieldModel && typeof fieldModel === "object" && "formulas" in fieldModel)
    ? Object.keys((fieldModel as { formulas?: Record<string, unknown> }).formulas ?? {}).length
    : 0;
}

function generatedTableCount(document: unknown) {
  let count = 0;
  walkJson(document, (node) => {
    if (node.type === "table" || node.kind === "table") count += 1;
  });
  return count;
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
