import type { AgentExecutionContext } from "@workspace/platform/server/agent/execution";
import { createProposal, type ProposalExecutors } from "@workspace/platform/server/agent/proposals";
import type { AgentTool } from "@workspace/platform/server/agent/tools";

import {
  storedWorkspaceSourcesOperationalAnalysisTemplateInputSchema,
  workspaceSourcesOperationalAnalysisTemplateInputSchema,
} from "./operational-analysis-template-schema";
import {
  prepareOperationalAnalysisTemplateSave,
  saveOperationalAnalysisTemplate,
} from "./operational-analysis-templates";

export const CONFIGURE_OPERATIONAL_ANALYSIS_TEMPLATE_ACTION = "finance.configureOperationalAnalysisTemplate";

const AGENT_ASSISTANT_ENTRY = { resourceKey: "agent.assistant", action: "entry" } as const;

const metricToolSchema = {
  type: "object",
  properties: {
    key: { type: "string" },
    label: { type: "string" },
    operation: { type: "string", enum: ["count", "distinctCount", "sum", "average", "min", "max"] },
    field: { type: "string", description: "count 可省略；其他 operation 必须使用已发现且允许聚合的字段" },
    format: { type: "string", enum: ["number", "integer", "currency", "percent"] },
  },
  required: ["key", "label", "operation"],
  additionalProperties: false,
} as const;

const workspaceSourcesBlockToolSchema = {
  anyOf: [
    {
      type: "object",
      properties: {
        key: { type: "string" }, kind: { type: "string", enum: ["metrics"] }, source: { type: "string" },
        metrics: { type: "array", minItems: 1, maxItems: 8, items: metricToolSchema },
      },
      required: ["key", "kind", "source", "metrics"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        key: { type: "string" }, kind: { type: "string", enum: ["chart"] }, source: { type: "string" }, title: { type: "string" },
        dimension: {
          type: "object",
          properties: {
            field: { type: "string" }, label: { type: "string" },
            bucket: { type: "string", enum: ["year", "quarter", "month"] },
          },
          required: ["field"],
          additionalProperties: false,
        },
        metrics: { type: "array", minItems: 1, maxItems: 8, items: metricToolSchema },
        comparison: { type: "string", enum: ["none", "periodOverPeriod", "yearOverYear", "both"] },
        sort: { type: "string", enum: ["dimensionAsc", "dimensionDesc", "valueAsc", "valueDesc"] },
        limit: { type: "integer", minimum: 1, maximum: 60 },
      },
      required: ["key", "kind", "source", "title", "dimension", "metrics"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        key: { type: "string" }, kind: { type: "string", enum: ["table"] }, source: { type: "string" }, title: { type: "string" },
        columns: {
          type: "array",
          minItems: 1,
          maxItems: 24,
          items: {
            type: "object",
            properties: {
              key: { type: "string" }, label: { type: "string" }, field: { type: "string" },
              format: { type: "string", enum: ["text", "number", "integer", "currency", "percent", "date"] },
            },
            required: ["key", "label", "field"],
            additionalProperties: false,
          },
        },
        limit: { type: "integer", minimum: 1, maximum: 500 },
      },
      required: ["key", "kind", "source", "title", "columns"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        key: { type: "string" }, kind: { type: "string", enum: ["note"] }, title: { type: "string" }, content: { type: "string" },
      },
      required: ["key", "kind", "content"],
      additionalProperties: false,
    },
  ],
} as const;

export const configureOperationalAnalysisTemplateTool: AgentTool = {
  key: CONFIGURE_OPERATIONAL_ANALYSIS_TEMPLATE_ACTION,
  label: "配置工作空间经营分析模板",
  description: [
    "在 personal、department 或 project 工作空间创建或修订经营分析模板。",
    "模板轻代码保存在 Workspace 数据库，不修改 Git 源码；新写入只接受 schemaVersion=3 + dataset=workspace.sources。",
    "用户确认提案后只会保存草稿；草稿需在页面的“版本与发布”中预览并发布，普通读者才会看到。",
    "调用前必须先用 finance.readOperationalAnalysisWorkspace 读取现有模板，再用 finance.discoverOperationalAnalysisSources 选择并展开最多 4 个双方共同可用的精确 sourceKey@version。",
    "只能使用发现工具返回的参数、字段与能力；不能提交内部 URL、rowsPath、分页 adapter、JavaScript、SQL、文件路径或任意网络请求。",
    "通用区块为 metrics、chart、table、note；指标支持 count、distinctCount、sum、average、min、max；日期维度可按 year/quarter/month 分桶并做 periodOverPeriod、yearOverYear 或 both。",
    "数据源权限不是模板快照：保存和每次运行都会按请求人、目标空间及原业务 read/object visibility 重新校验。敏感级和导出策略只是治理元数据，不是第二套读取许可。",
    "必须先确认模板名称、目标空间、真实 sourceKey@version、字段口径、筛选器、区块顺序，以及同比/环比要求；不知道时先发现或提问，不能编造。",
    "页面上下文 activeTab 形如 operational-analysis:configure:<scopeType>:<scopeId>:<templateId|new>，应优先按它定位当前空间和当前模板；不要猜 ID。",
  ].join("\n"),
  parameters: {
    type: "object",
    properties: {
      scopeType: { type: "string", enum: ["personal", "department", "project"] },
      scopeId: { type: "integer", minimum: 1 },
      templateId: { type: "integer", minimum: 1, description: "修改当前 Workspace 模板时传入；新建时省略" },
      expectedRevision: { type: "integer", minimum: 1, description: "修改模板时必填；必须来自 readOperationalAnalysisWorkspace 刚读取的精确 revision" },
      name: { type: "string", minLength: 1, maxLength: 80 },
      description: { type: "string", maxLength: 300 },
      definition: {
        type: "object",
        description: "v3 受控经营分析 DSL；只引用 discoverOperationalAnalysisSources 已展开的版本化数据源，不包含实现 URL。",
        properties: {
          schemaVersion: { type: "integer", enum: [3] },
          dataset: { type: "string", enum: ["workspace.sources"] },
          layout: { type: "string", enum: ["stack", "grid"] },
          sources: {
            type: "array",
            minItems: 1,
            maxItems: 4,
            description: "每项声明页面内 alias key、已发现的 sourceKey、精确 sourceVersion，以及该数据源定义允许的 parameters。",
            items: {
              type: "object",
              properties: {
                key: { type: "string" },
                label: { type: "string" },
                sourceKey: { type: "string", description: "发现工具返回的稳定 sourceKey" },
                sourceVersion: { type: "integer", minimum: 1 },
                parameters: {
                  type: "object",
                  additionalProperties: { anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }] },
                },
              },
              required: ["key", "sourceKey", "sourceVersion"],
              additionalProperties: false,
            },
          },
          filters: {
            type: "array",
            maxItems: 12,
            description: "{key,label,source,field,kind,defaultValue?,options?}；source 是页面 alias，field 必须由对应 source 定义允许筛选；kind 为 search/select/year/month。",
            items: {
              type: "object",
              properties: {
                key: { type: "string" },
                label: { type: "string" },
                source: { type: "string" },
                field: { type: "string" },
                kind: { type: "string", enum: ["search", "select", "year", "month"] },
                defaultValue: { type: "string" },
                options: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { label: { type: "string" }, value: { type: "string" } },
                    required: ["label", "value"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["key", "label", "source", "field", "kind"],
              additionalProperties: false,
            },
          },
          blocks: {
            type: "array",
            minItems: 1,
            maxItems: 24,
            description: "metrics={key,source,metrics}；chart={key,source,title,dimension,metrics,comparison?,sort?,limit?}；table={key,source,title,columns,limit?}；note={key,title?,content}。metric={key,label,operation,field?,format?}。",
            items: workspaceSourcesBlockToolSchema,
          },
        },
        required: ["schemaVersion", "dataset", "sources", "filters", "blocks"],
        additionalProperties: false,
      },
    },
    required: ["scopeType", "scopeId", "name", "definition"],
    additionalProperties: false,
  },
  examples: [
    {
      user: "给财务部做部门入职时间分析，按月展示入职人数，并看同比环比和最近入职明细",
      arguments: {
        scopeType: "department",
        scopeId: 12,
        name: "部门入职时间分析",
        description: "按月观察本部门入职人数、同比环比与最近入职人员",
        definition: {
          schemaVersion: 3,
          dataset: "workspace.sources",
          layout: "stack",
          sources: [{ key: "employments", label: "本部门雇佣记录", sourceKey: "hr.employments", sourceVersion: 1 }],
          filters: [
            { key: "joinYear", label: "入职年份", source: "employments", field: "joinDate", kind: "year" },
            { key: "employee", label: "员工姓名", source: "employments", field: "employeeName", kind: "search" },
          ],
          blocks: [
            { key: "joinMetrics", kind: "metrics", source: "employments", metrics: [{ key: "joinCount", label: "入职人数", operation: "count", field: "joinDate", format: "integer" }] },
            { key: "joinTrend", kind: "chart", source: "employments", title: "入职人数同比与环比", dimension: { field: "joinDate", label: "入职月份", bucket: "month" }, metrics: [{ key: "joinCount", label: "入职人数", operation: "count", field: "joinDate", format: "integer" }], comparison: "both", sort: "dimensionAsc" },
            { key: "joinTable", kind: "table", source: "employments", title: "入职明细", columns: [{ key: "employeeName", label: "姓名", field: "employeeName" }, { key: "employeeCode", label: "工号", field: "employeeCode" }, { key: "positionNames", label: "岗位", field: "positionNames" }, { key: "joinDate", label: "入职日期", field: "joinDate", format: "date" }], limit: 100 },
          ],
        },
      },
    },
  ],
  requiredPermissions: [AGENT_ASSISTANT_ENTRY],
  policyActions: ["configure"],
  delegatedExecution: true,
  mutates: true,

  async execute(params, execution) {
    const expectedRevision = positiveRevision(params.expectedRevision);
    const { expectedRevision: _expectedRevision, ...inputParams } = params;
    const parsed = workspaceSourcesOperationalAnalysisTemplateInputSchema.safeParse(inputParams);
    if (!parsed.success) return { type: "error", message: parsed.error.issues[0]?.message || "经营分析模板参数无效" };
    if (parsed.data.templateId && expectedRevision === undefined) {
      return { type: "error", message: "修改模板前必须先读取当前模板，并传入精确 expectedRevision" };
    }
    if (!parsed.data.templateId && expectedRevision !== undefined) {
      return { type: "error", message: "新建模板不能传 expectedRevision" };
    }
    const prepared = await prepareForBothIdentities(execution, parsed.data);
    if (!prepared.ok) return { type: "error", message: prepared.error };
    if (expectedRevision !== prepared.data.expectedRevision) {
      return { type: "error", message: "分析模板已被他人修改，请重新读取当前模板后再发起" };
    }
    const input = prepared.data.input;
    const diff = {
      空间: `${input.scopeType}:${input.scopeId}`,
      操作: input.templateId ? "修改模板" : "新建模板",
      模板: input.name,
      基于修订: expectedRevision ?? "新建",
      数据集: input.definition.dataset,
      筛选器: input.definition.filters,
      区块: input.definition.blocks.map((block) => block.kind),
      轻代码定义: prepared.data.input.code,
    };
    const proposal = await createProposal(execution, {
      actionKey: CONFIGURE_OPERATIONAL_ANALYSIS_TEMPLATE_ACTION,
      toolKey: CONFIGURE_OPERATIONAL_ANALYSIS_TEMPLATE_ACTION,
      targetType: "WorkspaceAnalysisTemplate",
      targetId: input.templateId ? String(input.templateId) : `${input.scopeType}:${input.scopeId}`,
      payload: { input: parsed.data, expectedRevision },
      diff,
    });
    return {
      type: "proposal",
      message: "经营分析模板提案已生成；确认后会保存为 Workspace 草稿，不会直接发布。",
      proposal: {
        id: proposal.proposalId,
        actionKey: CONFIGURE_OPERATIONAL_ANALYSIS_TEMPLATE_ACTION,
        targetType: "WorkspaceAnalysisTemplate",
        targetId: input.templateId ? String(input.templateId) : undefined,
        diff,
      },
    };
  },
};

function positiveRevision(value: unknown) {
  const revision = typeof value === "number" ? value : Number.NaN;
  return Number.isInteger(revision) && revision > 0 ? revision : undefined;
}

async function prepareForBothIdentities(
  execution: AgentExecutionContext,
  input: Parameters<typeof prepareOperationalAnalysisTemplateSave>[1],
) {
  const userIds = [...new Set([execution.requester.id, execution.actor.id])];
  const results = await Promise.all(userIds.map((userId) => prepareOperationalAnalysisTemplateSave(userId, input)));
  return results.find((result) => !result.ok) ?? results[0]!;
}

export const financeOperationalAnalysisProposalExecutors: ProposalExecutors = {
  [CONFIGURE_OPERATIONAL_ANALYSIS_TEMPLATE_ACTION]: {
    toolKey: CONFIGURE_OPERATIONAL_ANALYSIS_TEMPLATE_ACTION,
    requiredPermissions: [AGENT_ASSISTANT_ENTRY],
    policyActions: ["configure"],
    delegatedExecution: true,
    execute: async (payload, execution) => {
      const parsed = storedWorkspaceSourcesOperationalAnalysisTemplateInputSchema.safeParse(payload);
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "经营分析模板提案无效");
      const revalidated = await prepareForBothIdentities(execution, parsed.data.input);
      if (!revalidated.ok) throw new Error(revalidated.error);
      if (revalidated.data.expectedRevision !== parsed.data.expectedRevision) {
        throw new Error("分析模板已被他人修改，请重新发起");
      }
      const result = await saveOperationalAnalysisTemplate(execution.actor.id, parsed.data);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  },
};
