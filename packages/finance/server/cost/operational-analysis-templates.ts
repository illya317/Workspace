import type {
  OperationalAnalysisDefinition,
  OperationalAnalysisScopeType,
  OperationalAnalysisTemplateCatalogDTO,
  OperationalAnalysisTemplateDTO,
  WorkspaceApiOperationalAnalysisDefinition,
  WorkspaceApiQueryValue,
} from "@workspace/finance/types";
import { findApiContract } from "@workspace/platform/api-registry";
import { evaluatePermissionAction } from "@workspace/platform/server/auth";
import { prisma } from "@workspace/platform/server/prisma";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { workspaceSourcesOperationalAnalysisDefinitionSchema } from "@workspace/platform/workspace-analysis-definition-schema";
import { validateOperationalAnalysisTemplate } from "../domain/operational-analysis-template-validation";
import {
  operationalAnalysisDefinitionSchema,
  workspaceSourcesOperationalAnalysisTemplateInputSchema,
  type StoredWorkspaceSourcesOperationalAnalysisTemplateInput,
  type WorkspaceSourcesOperationalAnalysisTemplateInput,
} from "./operational-analysis-template-schema";
import {
  canReadOperationalAnalytics,
  canConfigureOperationalAnalytics,
  canUseOperationalAnalyticsApi,
} from "./operational-analytics";
import {
  listOperationalAnalysisEditableTemplates,
  listOperationalAnalysisManagedTemplates,
} from "./operational-analysis-template-lifecycle";
import { hasDepartmentShipmentActivity, hasPersonalShipmentActivity } from "./shipment-department-scope";
import {
  compileAuthorizedFinanceWorkspaceAnalysisDefinition,
  runFinanceWorkspaceAnalysisRuntime,
} from "./workspace-analysis-runtime";
import { buildCostOperationalAnalysisRuntime } from "./operational-analysis-cost-runtime";
const SYSTEM_SALES_DEFINITION = {
  schemaVersion: 1,
  dataset: "sales.shipments",
  layout: "stack",
  filters: ["periodMode", "period", "groupBy", "metric", "sortOrder", "pageSize"],
  blocks: [
    { kind: "salesMetrics" },
    { kind: "salesCharts" },
    { kind: "salesSummary" },
    { kind: "salesDetails" },
  ],
} as const satisfies OperationalAnalysisDefinition;

type AnalysisScope = { scopeType: OperationalAnalysisScopeType; scopeId: number };

export async function listOperationalAnalysisTemplates(
  userId: number,
  scope: AnalysisScope,
  options: { readonly viaApiKey?: boolean } = {},
) {
  if (!await canReadOperationalAnalytics(userId, scope.scopeType, scope.scopeId)) {
    return serviceError("无权限查看该空间的经营分析", 403);
  }
  if (options.viaApiKey && !await canUseOperationalAnalyticsApi(userId, scope.scopeType, scope.scopeId)) {
    return serviceError("当前 API 凭证没有该空间的经营分析 API 使用权限", 403);
  }
  const [rows, canConfigure, hasSales] = await Promise.all([
    prisma.workspaceAnalysisTemplate.findMany({
      where: { ...scope, status: "active", publishedRevision: { not: null } },
      orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }, { id: "asc" }],
      take: 100,
      select: {
        id: true,
        revision: true,
        publishedRevision: true,
      },
    }),
    canConfigureOperationalAnalytics(userId, scope.scopeType, scope.scopeId),
    hasSalesTemplate(scope),
  ]);
  const [publishedSnapshots, managedTemplates] = await Promise.all([
    rows.length
      ? prisma.workspaceAnalysisTemplateRevision.findMany({
          where: {
            OR: rows.flatMap((row) => row.publishedRevision === null
              ? []
              : [{ templateId: row.id, revision: row.publishedRevision }]),
          },
          select: {
            templateId: true,
            revision: true,
            name: true,
            description: true,
            code: true,
          },
        })
      : Promise.resolve([]),
    canConfigure ? listOperationalAnalysisManagedTemplates(userId, scope) : Promise.resolve([]),
  ]);
  const snapshotByTemplateId = new Map(publishedSnapshots.map((snapshot) => [snapshot.templateId, snapshot]));
  const parsedTemplates = rows.flatMap((row): OperationalAnalysisTemplateDTO[] => {
    const snapshot = snapshotByTemplateId.get(row.id);
    if (!snapshot || row.publishedRevision === null || snapshot.revision !== row.publishedRevision) return [];
    const definition = parseStoredDefinition(snapshot.code);
    if (!definition) return [];
    return [{
      key: `workspace:${row.id}`,
      id: row.id,
      name: snapshot.name,
      description: snapshot.description,
      source: "workspace",
      revision: snapshot.revision,
      definition,
      lifecycle: {
        headRevision: row.revision,
        publishedRevision: snapshot.revision,
        hasDraft: row.revision !== snapshot.revision,
      },
    }];
  });
  const accessible = await filterTemplatesByDatasetAccess(userId, scope, parsedTemplates, hasSales);
  const templates = hasSales
    ? [{
        key: "system:sales",
        id: null,
        name: "销售经营分析",
        description: "发货、回款、排行和明细",
        source: "system" as const,
        revision: 1,
        definition: SYSTEM_SALES_DEFINITION,
        lifecycle: null,
      }, ...accessible]
    : accessible;
  return serviceOk({
    success: true,
    data: { scope, canConfigure, templates, managedTemplates } satisfies OperationalAnalysisTemplateCatalogDTO,
  });
}

async function prepareOperationalAnalysisTemplateSave(
  userId: number,
  input: WorkspaceSourcesOperationalAnalysisTemplateInput,
  options: { readonly viaApiKey?: boolean } = {},
) {
  if (!await canConfigureOperationalAnalytics(userId, input.scopeType, input.scopeId)) {
    return serviceError("无权限配置该空间的经营分析", 403);
  }
  if (options.viaApiKey && !await canUseOperationalAnalyticsApi(userId, input.scopeType, input.scopeId)) {
    return serviceError("当前 API 凭证没有该空间的经营分析 API 使用权限", 403);
  }
  const compiled = await compileAuthorizedFinanceWorkspaceAnalysisDefinition({
    userId,
    scope: { scopeType: input.scopeType, scopeId: input.scopeId },
    definition: input.definition,
  });
  if (!compiled.ok) return compiled;
  const existing = input.templateId
    ? await prisma.workspaceAnalysisTemplate.findFirst({
        where: { id: input.templateId, scopeType: input.scopeType, scopeId: input.scopeId, status: "active" },
        select: { id: true, name: true, revision: true },
      })
    : null;
  if (input.templateId && !existing) return serviceError("要修改的分析模板不存在", 404);
  const duplicateName = await prisma.workspaceAnalysisTemplate.findFirst({
    where: {
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      name: input.name,
      ...(input.templateId ? { id: { not: input.templateId } } : {}),
    },
    select: { id: true },
  });
  if (duplicateName) return serviceError("当前空间已经存在同名分析模板", 409);
  return serviceOk({
    input,
    expectedRevision: existing?.revision,
    existingName: existing?.name ?? null,
  });
}

export async function saveOperationalAnalysisTemplate(
  userId: number,
  stored: StoredWorkspaceSourcesOperationalAnalysisTemplateInput,
  options: { readonly viaApiKey?: boolean } = {},
) {
  const parsed = workspaceSourcesOperationalAnalysisTemplateInputSchema.safeParse(stored.input);
  if (!parsed.success) return serviceError(parsed.error.issues[0]?.message ?? "经营分析模板参数无效", 400);
  const validated = validateOperationalAnalysisTemplate(parsed.data);
  if (!validated.ok) return serviceError(validated.error, 400);
  const prepared = await prepareOperationalAnalysisTemplateSave(userId, validated.data, options);
  if (!prepared.ok) return prepared;
  const { input } = prepared.data;
  if (input.templateId) {
    if (stored.expectedRevision !== prepared.data.expectedRevision) {
      return serviceError("分析模板已被他人修改，请重新发起", 409);
    }
    const nextRevision = (stored.expectedRevision ?? 0) + 1;
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.workspaceAnalysisTemplate.updateMany({
        where: {
          id: input.templateId,
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          status: "active",
          revision: stored.expectedRevision,
        },
        data: {
          name: input.name,
          description: input.description,
          code: input.code,
          revision: nextRevision,
          updatedBy: userId,
        },
      });
      if (result.count !== 1) return null;
      await tx.workspaceAnalysisTemplateRevision.create({
        data: {
          templateId: input.templateId!,
          revision: nextRevision,
          name: input.name,
          description: input.description,
          code: input.code,
          changeKind: "draft",
          createdBy: userId,
        },
      });
      return tx.workspaceAnalysisTemplate.findUnique({ where: { id: input.templateId! } });
    });
    return updated
      ? serviceOk({
          id: updated.id,
          name: updated.name,
          revision: updated.revision,
          publishedRevision: updated.publishedRevision,
          status: "draft" as const,
          executionMode: "direct" as const,
        })
      : serviceError("分析模板已被他人修改，请重新发起", 409);
  }

  const created = await prisma.$transaction(async (tx) => {
    const template = await tx.workspaceAnalysisTemplate.create({
      data: {
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        name: input.name,
        description: input.description,
        code: input.code,
        createdBy: userId,
        updatedBy: userId,
      },
    });
    await tx.workspaceAnalysisTemplateRevision.create({
      data: {
        templateId: template.id,
        revision: 1,
        name: input.name,
        description: input.description,
        code: input.code,
        changeKind: "draft",
        createdBy: userId,
      },
    });
    return template;
  });
  return serviceOk({
    id: created.id,
    name: created.name,
    revision: created.revision,
    publishedRevision: null,
    status: "draft" as const,
    executionMode: "direct" as const,
  });
}

export async function getOperationalAnalysisEditableTemplate(
  userId: number,
  scope: AnalysisScope,
  templateId: number,
  options: { readonly viaApiKey?: boolean } = {},
) {
  if (!await canConfigureOperationalAnalytics(userId, scope.scopeType, scope.scopeId)) {
    return serviceError("无权限配置该空间的经营分析", 403);
  }
  if (options.viaApiKey && !await canUseOperationalAnalyticsApi(userId, scope.scopeType, scope.scopeId)) {
    return serviceError("当前 API 凭证没有该空间的经营分析 API 使用权限", 403);
  }
  const templates = await listOperationalAnalysisEditableTemplates(userId, scope);
  const template = templates.find((candidate) => candidate.id === templateId);
  return template
    ? serviceOk({ success: true, data: template })
    : serviceError("分析模板不存在，或当前草稿不是可编辑的 v3 模板", 404);
}

export async function getCostOperationalAnalysisRuntime(
  userId: number,
  scope: AnalysisScope,
  templateId: number,
  filters: { year?: number; month?: number; productName?: string },
) {
  if (!await canReadOperationalAnalytics(userId, scope.scopeType, scope.scopeId)) {
    return serviceError("无权限查看该空间的经营分析", 403);
  }
  if (!await evaluatePermissionAction(userId, "finance.cost", "read")) {
    return serviceError("无权限读取成本数据源", 403);
  }
  const template = await prisma.workspaceAnalysisTemplate.findFirst({
    where: { id: templateId, ...scope, status: "active", publishedRevision: { not: null } },
    select: { publishedRevision: true },
  });
  if (!template) return serviceError("分析模板不存在", 404);
  const snapshot = template.publishedRevision === null
    ? null
    : await prisma.workspaceAnalysisTemplateRevision.findFirst({
        where: { templateId, revision: template.publishedRevision },
        select: { code: true },
      });
  const definition = snapshot ? parseStoredDefinition(snapshot.code) : null;
  if (!definition || definition.dataset !== "finance.costStructure") {
    return serviceError("该模板不使用成本结构数据源", 409);
  }
  const runtime = await buildCostOperationalAnalysisRuntime(filters);
  return serviceOk({ success: true, data: runtime });
}

export async function runWorkspaceSourcesOperationalAnalysisTemplateRuntime(input: {
  readonly userId: number;
  readonly scope: AnalysisScope;
  readonly templateId: number;
  readonly revision: number;
  readonly filterValues?: Readonly<Record<string, string>>;
  readonly viaApiKey?: boolean;
  readonly signal?: AbortSignal;
}) {
  if (!await canReadOperationalAnalytics(input.userId, input.scope.scopeType, input.scope.scopeId)) {
    return serviceError("无权限查看该空间的经营分析", 403);
  }
  if (input.viaApiKey && !await canUseOperationalAnalyticsApi(input.userId, input.scope.scopeType, input.scope.scopeId)) {
    return serviceError("当前 API 凭证没有该空间的经营分析 API 使用权限", 403);
  }

  const template = await prisma.workspaceAnalysisTemplate.findFirst({
    where: {
      id: input.templateId,
      ...input.scope,
      status: "active",
    },
    select: {
      publishedRevision: true,
      revisions: {
        where: { revision: input.revision },
        select: { code: true },
        take: 1,
      },
    },
  });
  if (!template) return serviceError("分析模板不存在", 404);
  if (template.publishedRevision !== input.revision) {
    return serviceError("分析模板正式版本已更新，请刷新后重试", 409);
  }
  const definition = parseStoredWorkspaceSourcesDefinition(template.revisions[0]?.code);
  if (!definition) {
    return serviceError("当前模板修订不是可执行的 v3 经营分析模板", 409);
  }

  return runFinanceWorkspaceAnalysisRuntime({
    userId: input.userId,
    scope: input.scope,
    definition,
    filterValues: input.filterValues,
    viaApiKey: input.viaApiKey,
    signal: input.signal,
  });
}

function parseStoredDefinition(code: string): OperationalAnalysisDefinition | null {
  try {
    const parsed = operationalAnalysisDefinitionSchema.safeParse(JSON.parse(code));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function parseStoredWorkspaceSourcesDefinition(code: string | undefined) {
  if (!code) return null;
  try {
    const parsed = workspaceSourcesOperationalAnalysisDefinitionSchema.safeParse(JSON.parse(code));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function hasSalesTemplate(scope: AnalysisScope) {
  if (scope.scopeType === "personal") return hasPersonalShipmentActivity(scope.scopeId);
  if (scope.scopeType === "department") return hasDepartmentShipmentActivity(scope.scopeId);
  return false;
}

async function filterTemplatesByDatasetAccess(
  userId: number,
  scope: AnalysisScope,
  templates: OperationalAnalysisTemplateDTO[],
  hasSales: boolean,
) {
  const costAllowed = templates.some((template) => template.definition.dataset === "finance.costStructure")
    ? await evaluatePermissionAction(userId, "finance.cost", "read")
    : false;
  const accessible: OperationalAnalysisTemplateDTO[] = [];
  for (const template of templates) {
    if (template.definition.dataset === "sales.shipments") {
      if (hasSales) accessible.push(template);
      continue;
    }
    if (template.definition.dataset === "finance.costStructure") {
      if (costAllowed) accessible.push(template);
      continue;
    }
    if (template.definition.dataset === "workspace.api") {
      if (await canReadWorkspaceApiSources(userId, scope, template.definition)) accessible.push(template);
      continue;
    }
    accessible.push(template);
  }
  return accessible;
}

async function canReadWorkspaceApiSources(
  userId: number,
  scope: AnalysisScope,
  definition: WorkspaceApiOperationalAnalysisDefinition,
) {
  for (const source of definition.sources) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(source.query ?? {})) {
      searchParams.set(key, resolveWorkspaceApiQueryValue(value, scope));
    }
    const contract = findApiContract("GET", source.path, searchParams);
    if (!contract?.resourceKey) return false;
    // A legacy URL template cannot safely preflight a service-delegated object
    // visibility rule without invoking the business endpoint and exposing its
    // transport definition. Keep it out of the catalog until it is migrated to
    // a v3 sourceKey whose owner can perform scoped discovery.
    if (contract.runtimeEnforcement === "serviceDelegated") return false;
    for (const action of contract.requiredActions) {
      if (!await evaluatePermissionAction(userId, contract.resourceKey, action, {
        scopeId: contract.authorization.scopeId ?? undefined,
        projection: contract.authorization.projection,
      })) return false;
    }
  }
  return true;
}

function resolveWorkspaceApiQueryValue(value: WorkspaceApiQueryValue, scope: AnalysisScope) {
  if (typeof value !== "object") return String(value);
  return value.binding === "scopeId" ? String(scope.scopeId) : scope.scopeType;
}
