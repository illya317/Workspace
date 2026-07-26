import "server-only";

import type { AgentExecutionContext } from "../agent/execution";
import type { AgentTool, AgentToolResult } from "../agent/tools";
import {
  applyQcTemplateTextReplacements,
  firstQcTemplateAgentValidationMessage,
  inspectQcTemplateText,
  parseQcTemplateInspectInput,
  parseQcTemplatePublishInput,
  parseQcTemplateSearchInput,
  parseQcTemplateUpdateInput,
} from "./domain/qc-template-agent-validation";
import {
  applyQcTemplateStructurePatches,
  inspectQcTemplateStructure,
} from "./domain/qc-template-agent-structure";
import { publishDraft } from "./publish-service";
import { getTemplate, listTemplates, saveDraft } from "./service";
import type { DocsEditorTemplateDetailDto, DocsEditorTemplateListItemDto } from "./types";

const DOCS_EDITOR_ENTRY = { resourceKey: "docs.editor", action: "entry" } as const;
const QC_OFFICIAL_SOURCE_KIND = "production.qc.official";

export const searchQcTemplatesTool: AgentTool = {
  key: "docs.searchQcTemplates",
  label: "查询 QC 模板",
  description: "按产品名或模板标题查询当前请求人和虚拟员工都能查看的 QC 官方模板。返回真实模板 ID、版本、状态和可执行动作；后续操作必须使用这里返回的 ID 和版本，禁止猜测。",
  parameters: {
    type: "object",
    properties: {
      keyword: { type: "string", maxLength: 100, description: "可选产品名或模板标题" },
      status: { type: "string", enum: ["draft", "published", "archived"] },
    },
    additionalProperties: false,
  },
  examples: [
    { user: "查一下氢氯噻嗪片的 QC 模板", arguments: { keyword: "氢氯噻嗪片" } },
  ],
  requiredPermissions: [DOCS_EDITOR_ENTRY],
  policyActions: ["read"],
  delegatedExecution: true,
  mutates: false,

  async execute(params, execution) {
    const parsed = parseQcTemplateSearchInput(params);
    if (!parsed.success) return validationError(parsed.error);
    const userIds = executionUserIds(execution);
    const results = await Promise.all(userIds.map((userId) => listTemplates({
      userId,
      keyword: parsed.data.keyword,
      status: parsed.data.status,
    })));
    const failed = results.find((result) => !result.ok);
    if (failed && !failed.ok) return { type: "error", message: failed.error };
    const rowsByUser = results.map((result) => result.ok ? result.data : []);
    const sharedIds = intersectReadableQcTemplateIds(rowsByUser);
    const items = (rowsByUser[0] ?? [])
      .filter((row) => sharedIds.has(row.id))
      .slice(0, 30)
      .map((row) => sharedListItem(row, rowsByUser));
    if (items.length === 0) {
      return { type: "empty", message: "没有找到双方都有权限查看的 QC 官方模板" };
    }
    const data = { total: items.length, items };
    return {
      type: "data",
      message: `找到 ${items.length} 个双方都有权限查看的 QC 官方模板`,
      data,
      modelContext: data,
    };
  },
};

export const inspectQcTemplateTool: AgentTool = {
  key: "docs.inspectQcTemplate",
  label: "检查 QC 模板内容",
  description: "读取一个双方都有权限查看的 QC 官方模板。view=text 按关键词返回可编辑文案；view=outline 返回指定 JSON 路径的直接子结构；view=value 返回不超过上限的完整子树。结构修改前必须先从 /document 或 /fieldModel 逐层查看实际路径和值，禁止猜测结构。",
  parameters: {
    type: "object",
    properties: {
      templateId: { type: "integer", minimum: 1 },
      view: { type: "string", enum: ["text", "outline", "value"], description: "默认 text；结构编辑使用 outline/value" },
      query: { type: "string", maxLength: 200, description: "可选；只返回包含该文本的可编辑内容" },
      path: { type: "string", maxLength: 1000, description: "outline/value 的 JSON Pointer，必须从 /document 或 /fieldModel 开始" },
    },
    required: ["templateId"],
    additionalProperties: false,
  },
  examples: [
    { user: "看看这个模板里所有微生物相关文案", arguments: { templateId: 12, query: "微生物" } },
    { user: "查看当前模板的文档结构", arguments: { templateId: 12, view: "outline", path: "/document/blocks" } },
    { user: "读取第三个表格的完整内容", arguments: { templateId: 12, view: "value", path: "/document/blocks/8" } },
  ],
  requiredPermissions: [DOCS_EDITOR_ENTRY],
  policyActions: ["read"],
  delegatedExecution: true,
  mutates: false,

  async execute(params, execution) {
    const parsed = parseQcTemplateInspectInput(params);
    if (!parsed.success) return validationError(parsed.error);
    const shared = await loadSharedQcTemplate(execution, parsed.data.templateId, "read");
    if (!shared.ok) return shared.result;
    if (parsed.data.view !== "text") {
      const inspection = inspectQcTemplateStructure({
        document: shared.template.document,
        fieldModel: shared.template.fieldModel,
        path: parsed.data.path ?? "/document",
        view: parsed.data.view,
      });
      if (!inspection.ok) return { type: "error", message: inspection.error };
      const data = {
        template: templateSummary(shared.template, shared.templates),
        inspection,
      };
      return {
        type: "data",
        message: "message" in inspection
          ? inspection.message
          : `已读取模板“${shared.template.title}”的结构路径 ${inspection.path}`,
        data,
        modelContext: data,
      };
    }
    const text = inspectQcTemplateText({
      document: shared.template.document,
      fieldModel: shared.template.fieldModel,
      query: parsed.data.query,
    });
    const data = {
      template: templateSummary(shared.template, shared.templates),
      query: parsed.data.query ?? null,
      ...text,
    };
    return {
      type: text.totalMatches === 0 ? "empty" : "data",
      message: text.totalMatches === 0
        ? `模板“${shared.template.title}”中没有找到匹配文本`
        : `模板“${shared.template.title}”中找到 ${text.totalMatches} 处可编辑文本`,
      data,
      modelContext: data,
    };
  },
};

export const updateQcTemplateTool: AgentTool = {
  key: "docs.updateQcTemplate",
  label: "直接修改 QC 模板",
  description: "直接保存 QC 官方模板草稿，不创建 Agent proposal。可修改标题、批量替换文案，或用结构补丁完整编辑 document/fieldModel，包括章节、表格、行列、单元格、字段、公式、引用、附件和分页。结构补丁支持 test/add/replace/remove/copy/move；必须先 inspect 实际路径，优先用 test 锁定旧值，再执行修改。权限、版本冲突、完整模板校验、历史与文件存储仍由 Docs Editor 服务强制执行。",
  parameters: {
    type: "object",
    properties: {
      templateId: { type: "integer", minimum: 1 },
      version: { type: "integer", minimum: 1 },
      title: { type: "string", minLength: 1, maxLength: 120 },
      replacements: {
        type: "array",
        minItems: 1,
        maxItems: 20,
        items: {
          type: "object",
          properties: {
            from: { type: "string", minLength: 1, maxLength: 500 },
            to: { type: "string", maxLength: 5000 },
            match: { type: "string", enum: ["exact", "substring"] },
            scope: { type: "string", enum: ["document", "fieldModel", "both"] },
            expectedMatches: { type: "integer", minimum: 1, maximum: 10000 },
          },
          required: ["from", "to", "match", "scope", "expectedMatches"],
          additionalProperties: false,
        },
      },
      patches: {
        type: "array",
        minItems: 1,
        maxItems: 50,
        description: "RFC 6902 风格结构补丁；路径仅允许 /document 和 /fieldModel",
        items: {
          type: "object",
          properties: {
            op: { type: "string", enum: ["test", "add", "replace", "remove", "copy", "move"] },
            path: { type: "string", minLength: 1, maxLength: 1000 },
            from: { type: "string", minLength: 1, maxLength: 1000 },
            value: { description: "test/add/replace 使用的任意 JSON 值" },
          },
          required: ["op", "path"],
          additionalProperties: false,
        },
      },
    },
    required: ["templateId", "version"],
    additionalProperties: false,
  },
  examples: [{
    user: "把刚才模板中的‘微生物检验’统一改成‘微生物限度检查’",
    arguments: {
      templateId: 12,
      version: 6,
      replacements: [{
        from: "微生物检验",
        to: "微生物限度检查",
        match: "exact",
        scope: "both",
        expectedMatches: 4,
      }],
    },
  }, {
    user: "在当前模板第一章末尾增加一个分页符",
    arguments: {
      templateId: 12,
      version: 6,
      patches: [{
        op: "add",
        path: "/document/blocks/-",
        value: { id: "page-break-agent-1", type: "pageBreak" },
      }],
    },
  }],
  requiredPermissions: [DOCS_EDITOR_ENTRY],
  policyActions: ["update"],
  delegatedExecution: true,
  mutates: true,
  writeMode: "direct",

  async execute(params, execution) {
    const parsed = parseQcTemplateUpdateInput(params);
    if (!parsed.success) return validationError(parsed.error);
    const shared = await loadSharedQcTemplate(execution, parsed.data.templateId, "update");
    if (!shared.ok) return shared.result;
    if (shared.template.version !== parsed.data.version) return versionConflict(shared.template.version);
    const replacements = parsed.data.replacements?.length
      ? applyQcTemplateTextReplacements({
        document: shared.template.document,
        fieldModel: shared.template.fieldModel,
        replacements: parsed.data.replacements,
      })
      : null;
    if (replacements && !replacements.ok) return { type: "error", message: replacements.error };
    const patches = parsed.data.patches?.length
      ? applyQcTemplateStructurePatches({
        document: replacements?.ok ? replacements.document : shared.template.document,
        fieldModel: replacements?.ok ? replacements.fieldModel : shared.template.fieldModel,
        patches: parsed.data.patches,
      })
      : null;
    if (patches && !patches.ok) return { type: "error", message: patches.error };
    const result = await saveDraft({
      userId: execution.actor.id,
      templateId: parsed.data.templateId,
      version: parsed.data.version,
      title: parsed.data.title,
      ...(patches?.ok ? {
        document: patches.document,
        fieldModel: patches.fieldModel,
      } : replacements?.ok ? {
        document: replacements.document,
        fieldModel: replacements.fieldModel,
      } : {}),
    });
    if (!result.ok) return { type: "error", message: result.error };
    const data = {
      template: compactTemplate(result.data),
      replacements: replacements?.ok ? replacements.applied : [],
      patches: patches?.ok ? patches.applied : [],
    };
    return {
      type: "data",
      message: `已直接保存 QC 模板“${result.data.title}”的草稿，当前版本 ${result.data.version}`,
      data,
      modelContext: data,
    };
  },
};

export const publishQcTemplateTool: AgentTool = {
  key: "docs.publishQcTemplate",
  label: "直接发布 QC 模板",
  description: "在用户明确要求发布时，直接发布双方都有发布权限的 QC 官方模板，不创建 Agent proposal。必须使用最新模板 ID 和版本；若该空间业务策略明确要求流程，Docs Editor 服务会拒绝直接发布。",
  parameters: {
    type: "object",
    properties: {
      templateId: { type: "integer", minimum: 1 },
      version: { type: "integer", minimum: 1 },
    },
    required: ["templateId", "version"],
    additionalProperties: false,
  },
  examples: [
    { user: "发布刚才修改后的 QC 模板", arguments: { templateId: 12, version: 7 } },
  ],
  requiredPermissions: [DOCS_EDITOR_ENTRY],
  policyActions: ["update"],
  delegatedExecution: true,
  mutates: true,
  writeMode: "direct",

  async execute(params, execution) {
    const parsed = parseQcTemplatePublishInput(params);
    if (!parsed.success) return validationError(parsed.error);
    const shared = await loadSharedQcTemplate(execution, parsed.data.templateId, "publish");
    if (!shared.ok) return shared.result;
    if (shared.template.version !== parsed.data.version) return versionConflict(shared.template.version);
    const result = await publishDraft({
      userId: execution.actor.id,
      templateId: parsed.data.templateId,
      version: parsed.data.version,
    });
    if (!result.ok) return { type: "error", message: result.error };
    const data = { template: compactTemplate(result.data) };
    return {
      type: "data",
      message: `已直接发布 QC 模板“${result.data.title}”，当前版本 ${result.data.version}`,
      data,
      modelContext: data,
    };
  },
};

export const docsEditorAgentTools: AgentTool[] = [
  searchQcTemplatesTool,
  inspectQcTemplateTool,
  updateQcTemplateTool,
  publishQcTemplateTool,
];

function validationError(error: Parameters<typeof firstQcTemplateAgentValidationMessage>[0]): AgentToolResult {
  return { type: "error", message: firstQcTemplateAgentValidationMessage(error) };
}

function executionUserIds(execution: AgentExecutionContext) {
  return Array.from(new Set([execution.requester.id, execution.actor.id]));
}

function intersectReadableQcTemplateIds(rowsByUser: DocsEditorTemplateListItemDto[][]) {
  const sets = rowsByUser.map((rows) => new Set(rows.filter(isReadableQcTemplate).map((row) => row.id)));
  return new Set(Array.from(sets[0] ?? []).filter((id) => sets.every((set) => set.has(id))));
}

function isReadableQcTemplate(row: DocsEditorTemplateListItemDto) {
  return row.sourceKind === QC_OFFICIAL_SOURCE_KIND && row.actionPermissions.canRead;
}

function sharedListItem(row: DocsEditorTemplateListItemDto, rowsByUser: DocsEditorTemplateListItemDto[][]) {
  const matches = rowsByUser.flatMap((rows) => rows.filter((item) => item.id === row.id));
  return {
    ...compactTemplate(row),
    productKey: row.sourceProductKey,
    canUpdate: matches.every((item) => item.actionPermissions.canUpdate),
    canPublish: matches.every((item) => item.actionPermissions.canPublish),
  };
}

async function loadSharedQcTemplate(
  execution: AgentExecutionContext,
  templateId: number,
  action: "read" | "update" | "publish",
) {
  const results = await Promise.all(executionUserIds(execution).map((userId) => getTemplate({ userId, templateId })));
  if (results.some((result) => !result.ok)) {
    return { ok: false as const, result: { type: "error" as const, message: "QC 模板不存在或双方权限不足" } };
  }
  const templates = results.flatMap((result) => result.ok ? [result.data] : []);
  if (templates.length === 0 || templates.some((template) => template.sourceKind !== QC_OFFICIAL_SOURCE_KIND)) {
    return { ok: false as const, result: { type: "error" as const, message: "目标不是 QC 官方模板" } };
  }
  const allowed = templates.every((template) => action === "read"
    ? template.actionPermissions.canRead
    : action === "update"
      ? template.actionPermissions.canUpdate
      : template.actionPermissions.canPublish);
  if (!allowed) {
    return { ok: false as const, result: { type: "error" as const, message: `双方没有 QC 模板${actionLabel(action)}权限` } };
  }
  const template = templates.at(-1)!;
  return { ok: true as const, template, templates };
}

function actionLabel(action: "read" | "update" | "publish") {
  return action === "read" ? "查看" : action === "update" ? "修改" : "发布";
}

function templateSummary(template: DocsEditorTemplateDetailDto, templates: DocsEditorTemplateDetailDto[]) {
  return {
    ...compactTemplate(template),
    productKey: template.sourceProductKey,
    canUpdate: templates.every((item) => item.actionPermissions.canUpdate),
    canPublish: templates.every((item) => item.actionPermissions.canPublish),
  };
}

function compactTemplate(template: DocsEditorTemplateListItemDto) {
  return {
    id: template.id,
    title: template.title,
    status: template.status,
    version: template.version,
    updatedAt: template.updatedAt,
    stageCount: template.stageCount,
    fieldCount: template.fieldCount,
    formulaCount: template.formulaCount,
    tableCount: template.tableCount,
  };
}

function versionConflict(actualVersion: number): AgentToolResult {
  return {
    type: "error",
    message: `模板版本已变化，当前版本为 ${actualVersion}；请重新检查后再处理。`,
  };
}
