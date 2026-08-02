import { resolveBusinessActionRuntime } from "@workspace/platform/server/business-action-executor";
import type { DocsEditorSpaceRow } from "./db";
import {
  docsEditorScopeId,
  getDocsEditorPermissionResourceKey,
} from "./permissions";
import type { DocsEditorSpaceActionPermissions } from "./types";

export type DocsEditorRuntimeAction = "create" | "save" | "publish";

export function resolveDocsEditorActionRuntime(input: {
  userId: number;
  space: DocsEditorSpaceRow;
  permissions: DocsEditorSpaceActionPermissions;
  action: DocsEditorRuntimeAction;
}) {
  const businessActionKey = input.action === "create"
    ? "docs.editor.template.draft.create"
    : input.action === "save"
      ? "docs.editor.template.draft.save"
      : "docs.editor.template.publish";
  return resolveBusinessActionRuntime({
    businessActionKey,
    actor: {
      userId: input.userId,
      canDirectWrite: input.action === "create"
        ? input.permissions.canCreate
        : input.action === "save"
          ? input.permissions.canUpdate
          : input.permissions.canPublish,
      canStartWorkflow: input.permissions.canSubmit,
      canProcessWorkflow: input.permissions.canApprove,
    },
    workflowApplicable: input.space.targetType !== "personal",
    resourceKey: getDocsEditorPermissionResourceKey(input.space.targetType),
    scopeType: input.space.targetType,
    scopeId: docsEditorScopeId(input.space),
    defaults: {
      businessActionKey,
      mode: "optional",
      flowType: "publish",
      separationPolicy: "auto_pass_if_authorized",
      handlerSource: "permission",
    },
  });
}
