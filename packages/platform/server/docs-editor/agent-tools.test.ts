import assert from "node:assert/strict";
import test, { mock } from "node:test";

import type { AgentExecutionContext } from "../agent/execution";
import type { DocsEditorTemplateDetailDto } from "./types";

type MockModule = (specifier: string, options: { namedExports: Record<string, unknown> }) => void;
const mockModule = (mock as unknown as { module: MockModule }).module.bind(mock);

const execution = {
  requester: { id: 11, username: "requester" },
  actor: { id: 22, username: "qc-agent" },
  profile: null,
} satisfies AgentExecutionContext;

let templatesByUser = new Map<number, DocsEditorTemplateDetailDto[]>();
let savedInputs: Record<string, unknown>[] = [];

mockModule("server-only", { namedExports: {} });
mockModule("./service", {
  namedExports: {
    listTemplates: async ({ userId }: { userId: number }) => ({
      ok: true as const,
      data: templatesByUser.get(userId) ?? [],
    }),
    getTemplate: async ({ userId, templateId }: { userId: number; templateId: number }) => {
      const template = (templatesByUser.get(userId) ?? []).find((item) => Number(item.id) === templateId);
      return template
        ? { ok: true as const, data: template }
        : { ok: false as const, error: "无权限", status: 403 };
    },
    saveDraft: async (input: Record<string, unknown>) => {
      savedInputs.push(input);
      const current = templatesByUser.get(execution.actor.id)?.[0];
      return current
        ? {
          ok: true as const,
          data: {
            ...current,
            version: current.version + 1,
            document: input.document ?? current.document,
            fieldModel: input.fieldModel ?? current.fieldModel,
          },
        }
        : { ok: false as const, error: "模板不存在", status: 404 };
    },
  },
});
mockModule("./publish-service", {
  namedExports: {
    publishDraft: async () => ({ ok: false as const, error: "not used", status: 500 }),
  },
});

const { inspectQcTemplateTool, searchQcTemplatesTool, updateQcTemplateTool } = await import("./agent-tools");

test("QC template search returns only requester/actor readable intersection", async () => {
  templatesByUser = new Map([
    [11, [template(1), template(2)]],
    [22, [template(2), template(3)]],
  ]);

  const result = await searchQcTemplatesTool.execute({}, execution);

  assert.equal(result.type, "data");
  assert.deepEqual((result.data as { items: Array<{ id: string }> }).items.map((item) => item.id), ["2"]);
});

test("QC template direct update requires scoped update permission for both identities", async () => {
  templatesByUser = new Map([
    [11, [template(2, { canUpdate: false })]],
    [22, [template(2, { canUpdate: true })]],
  ]);
  savedInputs = [];

  const result = await updateQcTemplateTool.execute({ templateId: 2, version: 4, title: "新标题" }, execution);

  assert.equal(result.type, "error");
  assert.match(result.message, /双方没有 QC 模板修改权限/);
  assert.equal(savedInputs.length, 0);
});

test("QC template direct update writes through the actor after deterministic replacement", async () => {
  templatesByUser = new Map([
    [11, [template(2)]],
    [22, [template(2)]],
  ]);
  savedInputs = [];

  const result = await updateQcTemplateTool.execute({
    templateId: 2,
    version: 4,
    replacements: [{
      from: "微生物检验",
      to: "微生物限度检查",
      match: "exact",
      scope: "document",
      expectedMatches: 1,
    }],
  }, execution);

  assert.equal(result.type, "data");
  assert.equal(savedInputs.length, 1);
  assert.equal(savedInputs[0]?.userId, 22);
  assert.equal(savedInputs[0]?.version, 4);
  assert.deepEqual(savedInputs[0]?.document, {
    schemaVersion: 1,
    kind: "qc-editor-document",
    id: "qc-2",
    title: "产品2",
    blocks: [{ id: "heading-1", type: "heading", level: 1, text: "微生物限度检查" }],
  });
});

test("QC template structure inspection and patches use the same direct save path", async () => {
  templatesByUser = new Map([
    [11, [template(2)]],
    [22, [template(2)]],
  ]);
  savedInputs = [];

  const inspection = await inspectQcTemplateTool.execute({
    templateId: 2,
    view: "value",
    path: "/document/blocks/0",
  }, execution);
  assert.equal(inspection.type, "data");
  assert.deepEqual(
    (inspection.data as { inspection: { value: unknown } }).inspection.value,
    { id: "heading-1", type: "heading", level: 1, text: "微生物检验" },
  );

  const result = await updateQcTemplateTool.execute({
    templateId: 2,
    version: 4,
    patches: [
      { op: "test", path: "/document/blocks/0/text", value: "微生物检验" },
      { op: "add", path: "/document/blocks/-", value: { id: "page-1", type: "pageBreak" } },
      { op: "add", path: "/fieldModel/formulas", value: { score: { fieldKey: "score", rule: "1" } } },
    ],
  }, execution);

  assert.equal(result.type, "data");
  assert.equal(savedInputs.length, 1);
  assert.deepEqual(savedInputs[0]?.document, {
    schemaVersion: 1,
    kind: "qc-editor-document",
    id: "qc-2",
    title: "产品2",
    blocks: [
      { id: "heading-1", type: "heading", level: 1, text: "微生物检验" },
      { id: "page-1", type: "pageBreak" },
    ],
  });
  assert.deepEqual(savedInputs[0]?.fieldModel, {
    schemaVersion: 1,
    fields: {},
    formulas: { score: { fieldKey: "score", rule: "1" } },
  });
});

function template(
  id: number,
  permissions: Partial<DocsEditorTemplateDetailDto["actionPermissions"]> = {},
): DocsEditorTemplateDetailDto {
  return {
    id: String(id),
    title: `批检验记录：产品${id}`,
    type: "quality-record",
    status: "published",
    spaceId: "8",
    version: 4,
    updatedAt: "2026-07-22T00:00:00.000Z",
    sourceKind: "production.qc.official",
    sourceProductKey: `product-${id}`,
    actionPermissions: {
      canRead: true,
      canCreate: false,
      canUpdate: true,
      canDelete: false,
      canArchive: false,
      canSubmit: false,
      canApprove: true,
      canPublish: true,
      canExport: true,
      canManagePermissions: false,
      ...permissions,
    },
    document: {
      schemaVersion: 1,
      kind: "qc-editor-document",
      id: `qc-${id}`,
      title: `产品${id}`,
      blocks: [{ id: "heading-1", type: "heading", level: 1, text: "微生物检验" }],
    },
    fieldModel: { schemaVersion: 1, fields: {}, formulas: {} },
  };
}
