import { z } from "zod";

import type { AgentExecutionContext } from "@workspace/platform/server/agent/execution";
import type { AgentTool } from "@workspace/platform/server/agent/tools";
import type { WorkspaceAnalysisSourceDefinition } from "@workspace/platform/workspace-analysis-source-contract";
import { matchText } from "@workspace/platform/search";

import { listOperationalAnalysisSources } from "./operational-analysis-source-directory";
import { listOperationalAnalysisEditableTemplates } from "./operational-analysis-template-lifecycle";
import { listOperationalAnalysisTemplates } from "./operational-analysis-templates";

const AGENT_ASSISTANT_ENTRY = { resourceKey: "agent.assistant", action: "entry" } as const;
const scopeTypeSchema = z.enum(["personal", "department", "project"]);
const scopeShape = {
  scopeType: { type: "string", enum: ["personal", "department", "project"] },
  scopeId: { type: "integer", minimum: 1 },
} as const;

const readWorkspaceInputSchema = z.object({
  scopeType: scopeTypeSchema,
  scopeId: z.coerce.number().int().positive(),
  templateId: z.coerce.number().int().positive().optional(),
}).strict();

const discoverSourcesInputSchema = z.object({
  scopeType: scopeTypeSchema,
  scopeId: z.coerce.number().int().positive(),
  keyword: z.string().trim().max(120).optional().default(""),
  page: z.coerce.number().int().min(1).max(100).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(30).optional().default(20),
  selected: z.array(z.object({
    sourceKey: z.string().trim().min(3).max(120),
    sourceVersion: z.coerce.number().int().positive(),
  }).strict()).max(4).optional().default([]),
}).strict();

export const readOperationalAnalysisWorkspaceTool: AgentTool = {
  key: "finance.readOperationalAnalysisWorkspace",
  label: "读取经营分析工作空间",
  description: [
    "读取 personal、department 或 project 空间当前可用的经营分析模板、精确草稿头 revision、发布状态和完整受控定义。",
    "修改现有模板前必须先调用本工具，不能根据页面文案猜 templateId、revision 或当前代码。",
    "只返回请求人与 Agent 执行身份共同可见的模板交集。",
  ].join("\n"),
  parameters: {
    type: "object",
    properties: {
      ...scopeShape,
      templateId: { type: "integer", minimum: 1, description: "可选；精确读取一个 Workspace 模板" },
    },
    required: ["scopeType", "scopeId"],
    additionalProperties: false,
  },
  requiredPermissions: [AGENT_ASSISTANT_ENTRY],
  delegatedExecution: true,
  mutates: false,

  async execute(params, execution) {
    const parsed = readWorkspaceInputSchema.safeParse(params);
    if (!parsed.success) return { type: "error", message: parsed.error.issues[0]?.message || "经营分析空间参数无效" };
    const shared = await loadSharedTemplateCatalog(execution, parsed.data);
    if (!shared.ok) return { type: "error", message: shared.error };
    const templates = parsed.data.templateId
      ? shared.templates.filter((template) => template.id === parsed.data.templateId)
      : shared.templates;
    if (parsed.data.templateId && templates.length === 0) {
      return { type: "error", message: "模板不存在，或请求人与 Agent 执行身份不能共同读取该模板" };
    }
    const data = {
      scope: { scopeType: parsed.data.scopeType, scopeId: parsed.data.scopeId },
      canConfigure: shared.canConfigure,
      templates,
      rule: "Workspace 模板的 definition 与 revision 是当前草稿头快照；publishedRevision 表示读者正在使用的正式版本。后续提案仍必须通过 expectedRevision CAS，确认后只保存草稿，不会直接发布。",
    };
    return {
      type: templates.length ? "data" : "empty",
      message: templates.length
        ? `已读取 ${templates.length} 个双方共同可见的经营分析模板。`
        : "当前空间没有双方共同可见的经营分析模板。",
      data,
      modelContext: data,
    };
  },
};

export const discoverOperationalAnalysisSourcesTool: AgentTool = {
  key: "finance.discoverOperationalAnalysisSources",
  label: "发现经营分析数据源",
  description: [
    "按关键词分页发现当前空间可用的版本化 sourceKey，并可一次展开最多 4 个 sourceKey@version 的完整字段、口径、参数、空间绑定、能力和运行限制。",
    "创建或修改 schemaVersion=3 模板前必须先调用；只能引用本工具返回的 sourceKey、sourceVersion、字段和参数。",
    "结果只取请求人与 Agent 执行身份的共同可见交集，不包含内部 URL、rowsPath、分页 adapter 或原始数据。",
  ].join("\n"),
  parameters: {
    type: "object",
    properties: {
      ...scopeShape,
      keyword: { type: "string", maxLength: 120, description: "按 sourceKey、名称、描述或 owner 搜索" },
      page: { type: "integer", minimum: 1, maximum: 100, default: 1 },
      pageSize: { type: "integer", minimum: 1, maximum: 30, default: 20 },
      selected: {
        type: "array",
        maxItems: 4,
        description: "展开完整定义的精确 sourceKey@version；必须存在于当前空间的共同可用目录",
        items: {
          type: "object",
          properties: {
            sourceKey: { type: "string" },
            sourceVersion: { type: "integer", minimum: 1 },
          },
          required: ["sourceKey", "sourceVersion"],
          additionalProperties: false,
        },
      },
    },
    required: ["scopeType", "scopeId"],
    additionalProperties: false,
  },
  requiredPermissions: [AGENT_ASSISTANT_ENTRY],
  delegatedExecution: true,
  mutates: false,

  async execute(params, execution) {
    const parsed = discoverSourcesInputSchema.safeParse(params);
    if (!parsed.success) return { type: "error", message: parsed.error.issues[0]?.message || "经营分析数据源查询参数无效" };
    const shared = await loadSharedSources(execution, parsed.data.scopeType, parsed.data.scopeId);
    if (!shared.ok) return { type: "error", message: shared.error };
    const matched = shared.sources
      .filter((source) => matchText(sourceSearchText(source), parsed.data.keyword))
      .sort((left, right) => sourceIdentity(left).localeCompare(sourceIdentity(right)));
    const start = (parsed.data.page - 1) * parsed.data.pageSize;
    const pageItems = matched.slice(start, start + parsed.data.pageSize);
    const byIdentity = new Map(shared.sources.map((source) => [sourceIdentity(source), source]));
    const selected = parsed.data.selected.map((reference) => {
      const identity = `${reference.sourceKey}@${reference.sourceVersion}`;
      return byIdentity.get(identity);
    });
    const missing = parsed.data.selected.find((_, index) => !selected[index]);
    if (missing) {
      return {
        type: "error",
        message: `${missing.sourceKey}@${missing.sourceVersion} 不在请求人与 Agent 执行身份的共同可用数据源中`,
      };
    }
    const data = {
      scope: { scopeType: parsed.data.scopeType, scopeId: parsed.data.scopeId },
      query: { keyword: parsed.data.keyword, page: parsed.data.page, pageSize: parsed.data.pageSize },
      total: matched.length,
      hasMore: start + pageItems.length < matched.length,
      sources: pageItems.map(sourceSummary),
      selected: selected.filter((source): source is WorkspaceAnalysisSourceDefinition => Boolean(source)),
      rule: "新模板只能引用 selected 中已展开的精确 sourceKey、sourceVersion、参数和字段。",
    };
    return {
      type: pageItems.length || selected.length ? "data" : "empty",
      message: pageItems.length || selected.length
        ? `找到 ${matched.length} 个共同可用数据源，本页 ${pageItems.length} 个，已展开 ${selected.length} 个。`
        : "没有找到双方共同可用的数据源。",
      data,
      modelContext: data,
    };
  },
};

async function loadSharedTemplateCatalog(
  execution: AgentExecutionContext,
  scope: { scopeType: z.infer<typeof scopeTypeSchema>; scopeId: number },
) {
  const userIds = sharedUserIds(execution);
  const [results, editableResults] = await Promise.all([
    Promise.all(userIds.map((userId) => listOperationalAnalysisTemplates(userId, scope))),
    Promise.all(userIds.map((userId) => listOperationalAnalysisEditableTemplates(userId, scope))),
  ]);
  const denied = results.find((result) => !result.ok);
  if (denied && !denied.ok) return { ok: false as const, error: denied.error };
  const catalogs = results.flatMap((result) => result.ok ? [result.data.data] : []);
  const base = catalogs[0];
  if (!base) return { ok: false as const, error: "经营分析模板目录暂不可用" };
  const systemTemplates = base.templates.filter((template) => template.source === "system");
  const sharedSystemKeys = intersectKeys(catalogs.map((catalog) => new Set(
    catalog.templates.filter((template) => template.source === "system").map(templateIdentity),
  )));
  const sharedWorkspaceKeys = intersectKeys(editableResults.map((templates) => new Set(templates.map(templateIdentity))));
  return {
    ok: true as const,
    canConfigure: catalogs.every((catalog) => catalog.canConfigure),
    templates: [
      ...systemTemplates.filter((template) => sharedSystemKeys.has(templateIdentity(template))),
      ...(editableResults[0] ?? []).filter((template) => sharedWorkspaceKeys.has(templateIdentity(template))),
    ],
  };
}

async function loadSharedSources(
  execution: AgentExecutionContext,
  scopeType: z.infer<typeof scopeTypeSchema>,
  scopeId: number,
) {
  const results = await Promise.all(sharedUserIds(execution).map((userId) => (
    listOperationalAnalysisSources(userId, { scopeType, scopeId })
  )));
  const denied = results.find((result) => !result.ok);
  if (denied && !denied.ok) return { ok: false as const, error: denied.error };
  const directories = results.flatMap((result) => result.ok ? [result.data.data] : []);
  const base = directories[0];
  if (!base) return { ok: false as const, error: "经营分析数据源目录暂不可用" };
  const sharedKeys = intersectKeys(directories.map((directory) => new Set(directory.sources.map(sourceVisibilityIdentity))));
  return {
    ok: true as const,
    sources: base.sources.filter((source) => sharedKeys.has(sourceVisibilityIdentity(source))),
  };
}

function sharedUserIds(execution: AgentExecutionContext) {
  return [...new Set([execution.requester.id, execution.actor.id])];
}

function intersectKeys(sets: readonly Set<string>[]) {
  const [first, ...rest] = sets;
  return new Set([...(first ?? new Set<string>())].filter((key) => rest.every((set) => set.has(key))));
}

function templateIdentity(template: { key: string; revision: number; definition: unknown }) {
  return `${template.key}@${template.revision}:${JSON.stringify(template.definition)}`;
}

function sourceIdentity(source: Pick<WorkspaceAnalysisSourceDefinition, "sourceKey" | "version">) {
  return `${source.sourceKey}@${source.version}`;
}

function sourceVisibilityIdentity(source: WorkspaceAnalysisSourceDefinition) {
  return `${sourceIdentity(source)}:${JSON.stringify(source)}`;
}

function sourceSearchText(source: WorkspaceAnalysisSourceDefinition) {
  return [source.sourceKey, source.label, source.description, source.ownerModuleKey]
    .join(" ")
    .toLocaleLowerCase();
}

function sourceSummary(source: WorkspaceAnalysisSourceDefinition) {
  return {
    sourceKey: source.sourceKey,
    sourceVersion: source.version,
    label: source.label,
    description: source.description,
    ownerModuleKey: source.ownerModuleKey,
    supportedScopes: Object.keys(source.scopeBindings),
    resourceKey: source.authorization.resourceKey,
    requiredActions: source.authorization.requiredActions,
    fieldCount: source.fields.length,
    parameterCount: source.parameters.length,
    limits: source.limits,
  };
}
