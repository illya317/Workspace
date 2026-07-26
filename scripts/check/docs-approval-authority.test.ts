import assert from "node:assert/strict";
import test, { mock } from "node:test";

const publishWrites: Array<Record<string, unknown>> = [];

mock.module("server-only", { namedExports: {} } as never);
mock.module("../../packages/platform/server/approvals", {
  namedExports: { listRequests: async () => ({ ok: true, data: [] }) },
} as never);
mock.module("../../packages/platform/server/approval-lifecycle", {
  namedExports: { bindApprovalLifecycle: () => ({}) },
} as never);
mock.module("../../packages/platform/server/approvals/workflow-node-handlers", {
  namedExports: { resolveWorkflowNodeHandlerUserIds: async () => [] },
} as never);
mock.module("../../packages/platform/server/business-space-natural-users", {
  namedExports: {
    listDepartmentResponsibleUserIds: async () => [],
    listDirectManagerUserIds: async () => [19],
  },
} as never);
mock.module("../../packages/platform/server/domain-validation", {
  namedExports: {
    failCommand: (error: string, status: number) => ({ ok: false, error, status }),
    okCommand: (data: unknown) => ({ ok: true, data }),
  },
} as never);
mock.module("../../packages/platform/server/prisma", {
  namedExports: { prisma: { user: { findMany: async () => [] } } },
} as never);
mock.module("../../packages/platform/server/docs-editor/domain/document-template-validation", {
  namedExports: { buildSaveDraftCommand: async () => ({ ok: false }) },
} as never);
mock.module("../../packages/platform/server/docs-editor/db", {
  namedExports: {
    docsEditorDb: () => ({
      documentTemplate: { findFirst: async () => null },
      documentTemplateSpace: {
        findFirst: async () => ({ id: 8, targetType: "department", targetId: 3 }),
        findUnique: async () => null,
      },
    }),
  },
} as never);
mock.module("../../packages/platform/server/docs-editor/permissions", {
  namedExports: {
    canApproveDocsEditorTemplateAction: async () => true,
    canSubmitDocsEditorTemplateAction: async () => true,
    docsEditorScopeId: () => "department:3",
    getDocsEditorPermissionResourceKey: () => "space.department.templates",
    resolveSpaceAccess: async () => true,
  },
} as never);
mock.module("../../packages/platform/server/docs-editor/publish-service", {
  namedExports: {
    publishTemplateSnapshot: async (input: Record<string, unknown>) => {
      publishWrites.push(input);
      return { ok: true, data: { id: 12 } };
    },
  },
} as never);
mock.module("../../packages/platform/server/docs-editor/service", {
  namedExports: {
    getTemplateWithAccess: async () => ({ ok: false }),
    saveDraft: async () => ({ ok: true, data: { id: 12 } }),
  },
} as never);
mock.module("../../packages/platform/server/docs-editor/space-service", {
  namedExports: { resolveTargetSpace: async () => null },
} as never);

const request = {
  id: 73,
  version: 9,
  businessActionKey: "docs.editor.template.publish",
  handlerSource: "direct_manager",
  activeWorkflowNodeKey: null,
  submitterUserId: 7,
  latestPayload: {
    action: "publish",
    targetType: "department",
    targetId: 3,
    templateId: 12,
    data: { version: 5, title: "Quality template" },
  },
};

async function adapter() {
  const docsApprovalModule = await import("../../packages/platform/server/docs-editor/approvals");
  return docsApprovalModule.docsTemplateApprovalAdapter;
}

async function issueAuthorization() {
  const authority = await import("../../packages/platform/server/approval-commit-authorization");
  return authority.issueApprovalCommitAuthorization({
    requestId: request.id,
    requestVersion: request.version,
    businessActionKey: request.businessActionKey,
  });
}

test("Docs approved commit rejects missing approval capability before writing", async () => {
  publishWrites.length = 0;
  const result = await (await adapter()).commitApprovedPayload({
    actorUserId: 19,
    request: request as never,
    approvalAuthorization: undefined as never,
  });

  assert.equal(result.ok, false);
  assert.equal(publishWrites.length, 0);
});

test("Docs approved commit consumes one matching approval capability", async () => {
  publishWrites.length = 0;
  const approvalAuthorization = await issueAuthorization();
  const input = {
    actorUserId: 19,
    request: request as never,
    approvalAuthorization,
  };

  const result = await (await adapter()).commitApprovedPayload(input);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(publishWrites.length, 1);
  assert.equal(publishWrites[0]?.updateGuard, "workflow-approved");

  const replay = await (await adapter()).commitApprovedPayload(input);
  assert.equal(replay.ok, false);
  assert.equal(publishWrites.length, 1);
});
