import {
  getOperationalAnalysisEditableTemplate,
  operationalAnalysisTemplateDraftUpdateBodySchema,
  operationalAnalysisTemplateRuntimeParamsSchema,
  saveOperationalAnalysisTemplate,
} from "@workspace/finance/server/cost";
import { registerFinanceWorkSpaceAccessProvider } from "@workspace/finance/server/cost/work-space-access-provider";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { isProgrammaticApiRequest } from "@workspace/platform/server/auth";
import { okCommand } from "@workspace/platform/server/domain-validation";

registerFinanceWorkSpaceAccessProvider();

export const GET = createCommandRoute({
  paramsSchema: operationalAnalysisTemplateRuntimeParamsSchema,
  paramsError: "经营分析模板参数无效",
  buildCommand: ({ params, user, request }) => okCommand({
    userId: user.userId,
    scopeType: params.targetType,
    scopeId: params.targetId,
    templateId: params.templateId,
    viaApiKey: isProgrammaticApiRequest(request),
  }),
  action: ({ userId, scopeType, scopeId, templateId, viaApiKey }) => getOperationalAnalysisEditableTemplate(
    userId,
    { scopeType, scopeId },
    templateId,
    { viaApiKey },
  ),
});

export const PUT = createCommandRoute({
  paramsSchema: operationalAnalysisTemplateRuntimeParamsSchema,
  paramsError: "经营分析模板参数无效",
  bodySchema: operationalAnalysisTemplateDraftUpdateBodySchema,
  bodyError: "经营分析模板草稿参数无效",
  buildCommand: ({ params, body, user, request }) => okCommand({
    userId: user.userId,
    viaApiKey: isProgrammaticApiRequest(request),
    stored: {
      input: {
        scopeType: params.targetType,
        scopeId: params.targetId,
        templateId: params.templateId,
        name: body.name,
        description: body.description,
        definition: body.definition,
      },
      expectedRevision: body.expectedRevision,
    },
  }),
  action: ({ userId, stored, viaApiKey }) => saveOperationalAnalysisTemplate(
    userId,
    stored,
    { viaApiKey },
  ),
});
