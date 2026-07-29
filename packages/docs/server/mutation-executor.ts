import "server-only";

import {
  defineBusinessActionCommandAdapter,
  executeBusinessActionCommand,
} from "@workspace/platform/server/business-action-executor";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import {
  docsTemplateApprovalAdapter,
  type DocsTemplateApprovalPayload,
} from "./approvals";
import { docsEditorDb } from "./db";
import {
  buildSaveDraftCommand,
  type SaveDraftInput,
} from "./domain/document-template-validation";
import {
  canCreateDocsEditorTemplateAction,
  canPublishDocsEditorTemplateAction,
  canUpdateDocsEditorTemplateAction,
  docsEditorScopeId,
  getDocsEditorPermissionResourceKey,
} from "./permissions";
import { publishTemplateSnapshot } from "./publish-service";
import { getTemplateWithAccess, saveDraft } from "./service";
import { resolveTargetSpace } from "./space-service";

type PublishTemplateInput = SaveDraftInput & {
  templateId: number | string;
  version: number | string | null;
};

const createTemplateCommand = defineBusinessActionCommandAdapter({
  businessActionKey: "docs.editor.template.draft.create",
  validatorKey: "packages/docs/server/domain/document-template-validation.buildSaveDraftCommand",
  commitKey: "packages/docs/server/service.saveDraft",
  validate: validateDraftInput,
  commit: (input: SaveDraftInput) => saveDraft(input),
});

const saveTemplateCommand = defineBusinessActionCommandAdapter({
  businessActionKey: "docs.editor.template.draft.save",
  validatorKey: "packages/docs/server/domain/document-template-validation.buildSaveDraftCommand",
  commitKey: "packages/docs/server/service.saveDraft",
  validate: validateDraftInput,
  commit: (input: SaveDraftInput) => saveDraft(input),
});

const publishTemplateCommand = defineBusinessActionCommandAdapter({
  businessActionKey: "docs.editor.template.publish",
  validatorKey: "packages/docs/server/domain/document-template-validation.buildSaveDraftCommand",
  commitKey: "packages/docs/server/publish-service.publishTemplateSnapshot",
  validate: validatePublishInput,
  commit: (input: PublishTemplateInput) => publishTemplateSnapshot(input),
});

export async function executeCreateDocsEditorTemplate(input: SaveDraftInput) {
  const space = await resolveTargetSpace({
    userId: input.userId,
    spaceId: positiveNumber(input.spaceId),
    departmentId: positiveNumber(input.departmentId),
    spaceKind: input.spaceKind ?? undefined,
  }, docsEditorDb());
  if (!space) return serviceError("目标空间不存在", 404);
  const payload = {
    action: "draft.create" as const,
    targetType: normalizeWorkflowTargetType(space.targetType),
    targetId: space.targetId,
    templateId: null,
    data: draftPayload(input),
  } satisfies DocsTemplateApprovalPayload;
  const result = await executeBusinessActionCommand({
    command: createTemplateCommand,
    input,
    context: undefined,
    actorUserId: input.userId,
    authorize: () => canCreateDocsEditorTemplateAction(input.userId, space),
    forbiddenMessage: "无权限创建模板",
    workflow: {
      applicable: space.targetType !== "personal",
      adapter: docsTemplateApprovalAdapter,
      operation: "create",
      prepare: () => prepareDocsTemplatePayload(space, payload),
    },
  });
  if (!result.ok) return result;
  return result.data.executionMode === "direct"
    ? serviceOk({ executionMode: "direct" as const, template: result.data.result })
    : serviceOk({ executionMode: "workflow" as const, request: result.data.request });
}

export async function executePublishDocsEditorTemplate(input: PublishTemplateInput) {
  const current = await getTemplateWithAccess(input.userId, positiveNumber(input.templateId) ?? 0);
  if (!current?.space) return serviceError("模板不存在", 404);
  const payload = {
    action: "publish",
    targetType: normalizeWorkflowTargetType(current.space.targetType),
    targetId: current.space.targetId,
    templateId: current.template.id,
    data: draftPayload(input),
  } satisfies DocsTemplateApprovalPayload;
  const result = await executeBusinessActionCommand({
    command: publishTemplateCommand,
    input,
    context: undefined,
    actorUserId: input.userId,
    authorize: () => canPublishDocsEditorTemplateAction(input.userId, current.space!),
    forbiddenMessage: "无权限发布模板",
    workflow: {
      applicable: current.space.targetType !== "personal",
      adapter: docsTemplateApprovalAdapter,
      operation: "update",
      subjectId: String(current.template.id),
      prepare: () => prepareDocsTemplatePayload(current.space!, payload, String(current.template.id)),
    },
  });
  if (!result.ok) return result;
  return result.data.executionMode === "direct"
    ? serviceOk({ executionMode: "direct" as const, template: result.data.result })
    : serviceOk({ executionMode: "workflow" as const, request: result.data.request });
}

export async function executeSaveDocsEditorTemplate(input: SaveDraftInput & {
  templateId: number | string;
}) {
  const current = await getTemplateWithAccess(input.userId, positiveNumber(input.templateId) ?? 0);
  if (!current?.space) return serviceError("模板不存在", 404);
  const payload = {
    action: "draft.save" as const,
    targetType: normalizeWorkflowTargetType(current.space.targetType),
    targetId: current.space.targetId,
    templateId: current.template.id,
    data: draftPayload(input),
  } satisfies DocsTemplateApprovalPayload;
  const result = await executeBusinessActionCommand({
    command: saveTemplateCommand,
    input,
    context: undefined,
    actorUserId: input.userId,
    authorize: () => canUpdateDocsEditorTemplateAction(input.userId, current.space!),
    forbiddenMessage: "无权限保存模板",
    workflow: {
      applicable: current.space.targetType !== "personal",
      adapter: docsTemplateApprovalAdapter,
      operation: "update",
      subjectId: String(current.template.id),
      prepare: () => prepareDocsTemplatePayload(current.space!, payload, String(current.template.id)),
    },
  });
  if (!result.ok) return result;
  return result.data.executionMode === "direct"
    ? serviceOk({ executionMode: "direct" as const, template: result.data.result })
    : serviceOk({ executionMode: "workflow" as const, request: result.data.request });
}

function draftPayload(input: SaveDraftInput) {
  const { userId: _userId, updateGuard: _updateGuard, ...data } = input;
  return data as Record<string, unknown>;
}

function validateDraftInput(input: SaveDraftInput) {
  const command = buildSaveDraftCommand(input);
  return command.ok
    ? serviceOk(input)
    : serviceError(command.issue.message, command.issue.status);
}

function validatePublishInput(input: PublishTemplateInput) {
  const command = buildSaveDraftCommand(input);
  return command.ok
    ? serviceOk(input)
    : serviceError(command.issue.message, command.issue.status);
}

function prepareDocsTemplatePayload(
  space: { targetType: string; targetId: number },
  payload: DocsTemplateApprovalPayload,
  subjectId?: string | null,
) {
  return {
    resourceKey: getDocsEditorPermissionResourceKey(space.targetType),
    scopeId: docsEditorScopeId(space),
    subjectId: subjectId ?? null,
    businessActionKey: payload.action === "draft.create"
      ? "docs.editor.template.draft.create"
      : payload.action === "publish"
        ? "docs.editor.template.publish"
        : "docs.editor.template.draft.save",
    flowType: "publish" as const,
    separationPolicy: "auto_pass_if_authorized" as const,
    payload,
  };
}

function positiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeWorkflowTargetType(value: string) {
  if (value === "company" || value === "committee" || value === "department") return value;
  return "department";
}
