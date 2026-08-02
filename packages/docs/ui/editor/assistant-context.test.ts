import assert from "node:assert/strict";
import test from "node:test";

import { buildDocsEditorAssistantContext } from "./assistant-context";

test("Docs Editor assistant binds the selected template id and version", () => {
  const context = buildDocsEditorAssistantContext({
    activeSpaceTitle: "示例质量部模板空间",
    activeTab: "templates",
    activeTemplateId: "42",
    detail: {
      id: "42",
      title: "批检验记录：盐酸维拉帕米片",
      type: "document",
      status: "published",
      spaceId: "department:12",
      version: 7,
      updatedAt: "2026-07-22T00:00:00.000Z",
      document: {},
      fieldModel: {},
      actionPermissions: permissions,
    },
  });

  assert.equal(context.contextLabel, "文档模板 / 示例质量部模板空间 / 当前模板：批检验记录：盐酸维拉帕米片");
  assert.deepEqual(context.sourceContext, {
    navigationLabel: "文档模板",
    activeKey: "templates",
    activeLabel: "文档模板",
    activeChildKey: "template:42;version:7;status:published",
    activeChildLabel: "批检验记录：盐酸维拉帕米片（已发布）",
  });
});

test("Docs Editor assistant does not bind stale or workflow detail", () => {
  const context = buildDocsEditorAssistantContext({
    activeSpaceTitle: "示例质量部模板空间",
    activeTab: "workflow",
    activeTemplateId: "42",
    detail: {
      id: "41",
      title: "旧模板",
      type: "document",
      status: "draft",
      spaceId: "department:12",
      version: 3,
      updatedAt: "2026-07-22T00:00:00.000Z",
      document: {},
      fieldModel: {},
      actionPermissions: permissions,
    },
  });

  assert.equal(context.contextLabel, "文档模板 / 示例质量部模板空间");
  assert.equal(context.sourceContext?.activeChildKey, undefined);
  assert.equal(context.sourceContext?.activeChildLabel, undefined);
});

const permissions = {
  canRead: true,
  canCreate: true,
  canUpdate: true,
  canDelete: true,
  canArchive: true,
  canSubmit: true,
  canApprove: true,
  canPublish: true,
  canExport: true,
  canManagePermissions: true,
};
