import assert from "node:assert/strict";
import test, { mock } from "node:test";

type MockModule = (specifier: string, options: { namedExports: Record<string, unknown> }) => void;
const mockModule = (mock as unknown as { module: MockModule }).module.bind(mock);

let publishCommand: unknown = null;

mockModule("@workspace/docs/server", {
  namedExports: {
    executePublishDocsEditorTemplate: async (command: unknown) => {
      publishCommand = command;
      return { ok: true, data: { executionMode: "workflow", request: { id: 19 } } };
    },
  },
});
mockModule("@workspace/platform/server/domain-validation", {
  namedExports: { okCommand: <T>(data: T) => ({ ok: true as const, data }) },
});
mockModule("@workspace/platform/server/api-route", {
  namedExports: {
    createCommandRoute: (options: {
      paramsSchema: { parse: (value: unknown) => unknown };
      bodySchema: { parse: (value: unknown) => unknown };
      buildCommand: (context: Record<string, unknown>) => Promise<unknown> | unknown;
      action: (command: unknown) => Promise<unknown> | unknown;
    }) => async (request: Request, context: { params: Promise<Record<string, string>> }) => {
      const params = options.paramsSchema.parse(await context.params);
      const body = options.bodySchema.parse(await request.json());
      const built = await options.buildCommand({ user: { userId: 41 }, params, body });
      const command = built as { ok: boolean; data?: unknown };
      if (!command.ok) return built;
      return options.action(command.data);
    },
  },
});

test("template publish route forwards the parsed full-record snapshot", async () => {
  const { POST } = await import("./[templateId]/publish/route");
  publishCommand = null;
  const body = {
    version: "6",
    title: "月度质量模板",
    type: "quality-record",
    document: { schemaVersion: 3, blocks: [{ id: "heading-1", text: "月报" }] },
    fieldModel: { schemaVersion: 2, fields: { result: { type: "number" } } },
    sourceKind: "production.qc.official",
    sourceProductKey: "product-17",
    sourceStageKeys: ["sampling", "release"],
    ignored: "must be stripped by the route schema",
  };

  await (POST as unknown as (
    request: Request,
    context: { params: Promise<Record<string, string>> },
  ) => Promise<unknown>)(new Request("http://localhost/api/modules/docs/editor/templates/12/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ templateId: "12" }) });

  assert.deepEqual(publishCommand, {
    userId: 41,
    templateId: "12",
    version: 6,
    title: body.title,
    type: body.type,
    document: body.document,
    fieldModel: body.fieldModel,
    sourceKind: body.sourceKind,
    sourceProductKey: body.sourceProductKey,
    sourceStageKeys: body.sourceStageKeys,
  });
});
