import assert from "node:assert/strict";
import test, { mock } from "node:test";

type MockModule = (specifier: string, options: { namedExports: Record<string, unknown> }) => void;
const mockModule = (mock as unknown as { module: MockModule }).module.bind(mock);

type PublishInput = {
  userId: number;
  templateId: number;
  version: number;
  title: string;
  type: string;
  document: Record<string, unknown>;
  fieldModel: Record<string, unknown>;
  sourceKind: string | null;
  sourceProductKey: string | null;
  sourceStageKeys: string[] | null;
};

let mode: "direct" | "workflow" = "workflow";
let preparedPayload: unknown = null;
let committedInput: unknown = null;

const serviceOk = <T>(data: T) => ({ ok: true as const, data });
const serviceError = (error: string, status: number) => ({ ok: false as const, error, status });

mockModule("server-only", { namedExports: {} });
mockModule("../business-action-executor", {
  namedExports: {
    defineBusinessActionCommandAdapter: (definition: unknown) => definition,
    executeBusinessActionCommand: async (input: {
      command: {
        validate: (value: unknown, context: unknown) => Promise<ReturnType<typeof serviceOk>> | ReturnType<typeof serviceOk>;
        commit: (value: unknown, context: unknown) => Promise<ReturnType<typeof serviceOk>> | ReturnType<typeof serviceOk>;
      };
      input: unknown;
      context: unknown;
      authorize?: () => Promise<boolean> | boolean;
      workflow?: { prepare: (value: unknown, context: unknown) => Promise<unknown> | unknown };
    }) => {
      const normalized = await input.command.validate(input.input, input.context);
      if (!normalized.ok) return normalized;
      if (mode === "workflow") {
        preparedPayload = await input.workflow?.prepare(normalized.data, input.context);
        return serviceOk({ executionMode: "workflow" as const, request: { id: 23 } });
      }
      if (input.authorize && !(await input.authorize())) return serviceError("无权限发布模板", 403);
      const committed = await input.command.commit(normalized.data, input.context);
      return committed.ok
        ? serviceOk({ executionMode: "direct" as const, result: committed.data })
        : committed;
    },
  },
});
mockModule("../api", {
  namedExports: { serviceError, serviceOk },
});
mockModule("./approvals", {
  namedExports: { docsTemplateApprovalAdapter: {} },
});
mockModule("./db", {
  namedExports: { docsEditorDb: () => ({}) },
});
mockModule("./domain/document-template-validation", {
  namedExports: {
    buildSaveDraftCommand: (input: Record<string, unknown>) => (
      input.document && input.fieldModel
        ? { ok: true as const, data: input }
        : { ok: false as const, issue: { message: "缺少完整模板快照", status: 400 } }
    ),
  },
});
mockModule("./permissions", {
  namedExports: {
    canCreateDocsEditorTemplateAction: async () => true,
    canPublishDocsEditorTemplateAction: async () => true,
    canUpdateDocsEditorTemplateAction: async () => true,
    docsEditorScopeId: () => "department:8",
    getDocsEditorPermissionResourceKey: () => "space.department.templates",
  },
});
mockModule("./publish-service", {
  namedExports: {
    publishTemplateSnapshot: async (input: unknown) => {
      committedInput = input;
      return serviceOk({ id: 12 });
    },
  },
});
mockModule("./service", {
  namedExports: {
    getTemplateWithAccess: async () => ({
      template: { id: 12 },
      space: { targetType: "department", targetId: 8 },
    }),
    saveDraft: async () => serviceOk({ id: 12 }),
  },
});
mockModule("./space-service", {
  namedExports: { resolveTargetSpace: async () => null },
});

const fullRecord: PublishInput = {
  userId: 41,
  templateId: 12,
  version: 6,
  title: "月度质量模板",
  type: "quality-record",
  document: { schemaVersion: 3, blocks: [{ id: "heading-1" }] },
  fieldModel: { schemaVersion: 2, fields: { result: { type: "number" } } },
  sourceKind: "production.qc.official",
  sourceProductKey: "product-17",
  sourceStageKeys: ["sampling", "release"],
};

test("workflow publish freezes the complete template record in the approval payload", async () => {
  const { executePublishDocsEditorTemplate } = await import("./mutation-executor");
  mode = "workflow";
  preparedPayload = null;

  const result = await executePublishDocsEditorTemplate(fullRecord);

  assert.equal(result.ok, true);
  assert.deepEqual(preparedPayload, {
    resourceKey: "space.department.templates",
    scopeId: "department:8",
    subjectId: "12",
    businessActionKey: "docs.editor.template.publish",
    flowType: "publish",
    separationPolicy: "auto_pass_if_authorized",
    payload: {
      action: "publish",
      targetType: "department",
      targetId: 8,
      templateId: 12,
      data: {
        templateId: 12,
        version: 6,
        title: fullRecord.title,
        type: fullRecord.type,
        document: fullRecord.document,
        fieldModel: fullRecord.fieldModel,
        sourceKind: fullRecord.sourceKind,
        sourceProductKey: fullRecord.sourceProductKey,
        sourceStageKeys: fullRecord.sourceStageKeys,
      },
    },
  });
});

test("direct publish commits the same complete template record", async () => {
  const { executePublishDocsEditorTemplate } = await import("./mutation-executor");
  mode = "direct";
  committedInput = null;

  const result = await executePublishDocsEditorTemplate(fullRecord);

  assert.equal(result.ok, true);
  assert.deepEqual(committedInput, fullRecord);
});

test("Docs publish contract requires a full-record snapshot at every workflow boundary", async () => {
  const { getActionContractMetadata } = await import("../../action-contract-registry");
  const contract = getActionContractMetadata("docs.editor.template.publish");

  assert.ok(contract);
  assert.deepEqual(contract.payload, {
    cardinality: "single",
    shape: "full_record",
    target: "existing_record",
    targetIdKey: "templateId",
    versionKey: "version",
    notes: "发布流程提交当前模板完整快照；审批通过发布这份快照，不重新读取后续草稿。",
  });
  assert.ok(contract.persistence);
  assert.equal(contract.persistence.strategy, "approval_payload");
  assert.ok("commitKey" in contract.domain);
  assert.equal(
    contract.domain.commitKey,
    "packages/platform/server/docs-editor/publish-service.publishTemplateSnapshot",
  );
  assert.deepEqual(
    contract.workflow.kind === "configurable" ? contract.workflow.validateOn : null,
    ["draft", "submit", "commit"],
  );
});
