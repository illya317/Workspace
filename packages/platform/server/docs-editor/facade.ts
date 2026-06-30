import "server-only";

import type {
  CreateDocumentTemplateCommand,
  SaveDocumentTemplateDraftCommand,
} from "./types";
import {
  copyTemplate,
  deleteDraft,
  getEditorBootstrap,
  getTemplate,
  listSpaces,
  listTemplates,
  markPublished,
  requestPublish,
  saveDraft,
} from "./service";
import type { ServiceResult } from "../api";

export class DocsEditorServiceError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

function unwrapServiceResult<T>(result: ServiceResult<T>): T {
  if (result.ok === true) return result.data;
  throw new DocsEditorServiceError(result.error, result.status);
}

function numberFromString(value: number | string | null | undefined) {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number") return Number.isInteger(value) && value > 0 ? value : undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function templateIdFromString(value: number | string) {
  return numberFromString(value) ?? 0;
}

export async function getDocsEditorBootstrap(userId: number, spaceId?: number | string | null) {
  return unwrapServiceResult(await getEditorBootstrap({ userId, spaceId }));
}

export async function listDocumentTemplateSpaces(userId: number) {
  return unwrapServiceResult(await listSpaces({ userId }));
}

export async function listDocumentTemplates(userId: number, spaceId?: number | string | null) {
  return unwrapServiceResult(await listTemplates({ userId, spaceId }));
}

export async function getDocumentTemplate(userId: number, templateId: number | string) {
  return unwrapServiceResult(await getTemplate({ userId, templateId: templateIdFromString(templateId) }));
}

export async function createDocumentTemplate(userId: number, command: CreateDocumentTemplateCommand) {
  return unwrapServiceResult(await saveDraft({
    userId,
    spaceId: numberFromString(command.spaceId),
    title: command.title,
    type: command.type,
    document: command.document,
    fieldModel: command.fieldModel,
    sourceKind: command.sourceKind,
    sourceProductKey: command.sourceProductKey,
    sourceStageKeys: command.sourceStageKeys,
  }));
}

export async function saveDocumentTemplateDraft(
  userId: number,
  templateId: number | string,
  command: SaveDocumentTemplateDraftCommand,
) {
  return unwrapServiceResult(await saveDraft({
    userId,
    templateId: numberFromString(templateId),
    ...command,
  }));
}

export async function copyDocumentTemplate(
  userId: number,
  templateId: number | string,
  targetSpaceId?: number | string | null,
) {
  return unwrapServiceResult(await copyTemplate({
    userId,
    templateId: templateIdFromString(templateId),
    targetSpaceId: numberFromString(targetSpaceId),
  }));
}

export async function deleteDocumentTemplateDraft(userId: number, templateId: number | string) {
  return unwrapServiceResult(await deleteDraft({ userId, templateId: numberFromString(templateId) ?? 0 }));
}

export async function requestDocumentTemplatePublish(userId: number, templateId: number | string) {
  return unwrapServiceResult(await requestPublish({ userId, templateId: numberFromString(templateId) ?? 0 }));
}

export async function markDocumentTemplatePublished(userId: number, templateId: number | string, official?: boolean) {
  return unwrapServiceResult(await markPublished({
    userId,
    templateId: numberFromString(templateId) ?? 0,
    official,
  }));
}
