import "server-only";

import { z } from "zod";

import { serviceError, serviceOk } from "@workspace/platform/service-result";

import {
  operationalAnalysisTemplateDraftCreateBodySchema,
  operationalAnalysisTemplateDraftUpdateBodySchema,
  operationalAnalysisTemplateLifecycleCommandSchema,
  operationalAnalysisTemplatePreviewInputSchema,
} from "./operational-analysis-template-schema";
import {
  canConfigureOperationalAnalytics,
  canUseOperationalAnalyticsApi,
  type OperationalAnalyticsScopeType,
} from "./operational-analytics";

type AnalysisScope = {
  readonly scopeType: OperationalAnalyticsScopeType;
  readonly scopeId: number;
};

export function buildOperationalAnalysisTemplateApiContract(scope: AnalysisScope) {
  const basePath = `/api/modules/finance/cost/operational-analytics/spaces/${scope.scopeType}/${scope.scopeId}`;
  const templatesPath = `${basePath}/templates`;
  return {
    version: 1,
    scope,
    routes: {
      discoverSources: `GET ${basePath}/sources/discover?keyword=<required>&page=1&pageSize=20&selected=<sourceKey@version>`,
      listTemplates: `GET ${templatesPath}`,
      createDraft: `POST ${templatesPath}`,
      readDraft: `GET ${templatesPath}/:templateId`,
      updateDraft: `PUT ${templatesPath}/:templateId`,
      previewRevision: `POST ${templatesPath}/:templateId/preview`,
      lifecycle: `POST ${templatesPath}/:templateId/lifecycle`,
      runPublishedRevision: `POST ${templatesPath}/:templateId/runtime`,
    },
    rules: [
      "Scope and template identity come only from the route; do not send scopeType, scopeId or templateId in a draft body.",
      "Discover and expand every sourceKey@version before using its parameters or fields.",
      "Create and update accept only schemaVersion=3 with dataset=workspace.sources.",
      "Read the current draft before update, preview or lifecycle actions and send its exact revision as expectedRevision.",
      "Preview before publish. Publish creates a new immutable revision; use the returned publishedRevision for runtime.",
    ],
    bodySchemas: {
      createDraft: z.toJSONSchema(operationalAnalysisTemplateDraftCreateBodySchema),
      updateDraft: z.toJSONSchema(operationalAnalysisTemplateDraftUpdateBodySchema),
      previewRevision: z.toJSONSchema(operationalAnalysisTemplatePreviewInputSchema),
      lifecycle: z.toJSONSchema(operationalAnalysisTemplateLifecycleCommandSchema),
    },
    example: {
      createDraft: {
        name: "部门入职趋势",
        description: "示例仅演示 DSL 形状；sourceKey、版本、字段和参数必须以当前空间 discovery 为准。",
        definition: {
          schemaVersion: 3,
          dataset: "workspace.sources",
          layout: "stack",
          sources: [{ key: "employments", sourceKey: "hr.employments", sourceVersion: 1 }],
          filters: [{ key: "joinYear", label: "入职年份", source: "employments", field: "joinDate", kind: "year" }],
          blocks: [{
            key: "joinTrend",
            kind: "chart",
            source: "employments",
            title: "月度入职趋势",
            dimension: { field: "joinDate", label: "入职月份", bucket: "month" },
            metrics: [{ key: "joinCount", label: "入职人数", operation: "count", field: "joinDate", format: "integer" }],
            comparison: "both",
            sort: "dimensionAsc",
          }],
        },
      },
      publish: { action: "publish", expectedRevision: 1, reason: "预览通过后发布" },
    },
  };
}

export async function getOperationalAnalysisTemplateApiContract(
  userId: number,
  scope: AnalysisScope,
  options: { readonly viaApiKey?: boolean } = {},
) {
  if (!await canConfigureOperationalAnalytics(userId, scope.scopeType, scope.scopeId)) {
    return serviceError("无权限配置该空间的经营分析", 403);
  }
  if (options.viaApiKey && !await canUseOperationalAnalyticsApi(userId, scope.scopeType, scope.scopeId)) {
    return serviceError("当前 API 凭证没有该空间的经营分析 API 使用权限", 403);
  }
  return serviceOk({ success: true, data: buildOperationalAnalysisTemplateApiContract(scope) });
}
