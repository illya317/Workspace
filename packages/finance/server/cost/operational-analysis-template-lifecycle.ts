import type {
  OperationalAnalysisManagedTemplateDTO,
  OperationalAnalysisTemplateLifecycleActionsDTO,
  OperationalAnalysisTemplateLifecycleDTO,
  OperationalAnalysisTemplateRevisionKind,
} from "@workspace/finance/types";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { prisma } from "@workspace/platform/server/prisma";
import { workspaceSourcesOperationalAnalysisDefinitionSchema } from "@workspace/platform/workspace-analysis-definition-schema";

import {
  hasOperationalAnalysisDraft,
  planOperationalAnalysisTemplateLifecycle,
  type OperationalAnalysisTemplateLifecycleCommand,
  type OperationalAnalysisTemplateLifecycleIssue,
  type OperationalAnalysisTemplateLifecycleState,
} from "../domain/operational-analysis-template-lifecycle-validation";
import type {
  OperationalAnalysisTemplateLifecycleCommandInput,
  OperationalAnalysisTemplateLifecycleQuery,
} from "./operational-analysis-template-schema";
import {
  canConfigureOperationalAnalytics,
  canUseOperationalAnalyticsApi,
} from "./operational-analytics";
import {
  compileAuthorizedFinanceWorkspaceAnalysisDefinition,
  runFinanceWorkspaceAnalysisRuntime,
} from "./workspace-analysis-runtime";

type AnalysisScope = { scopeType: "personal" | "department" | "project"; scopeId: number };

type ManagedTemplateRow = {
  id: number;
  name: string;
  description: string | null;
  status: string;
  revision: number;
  publishedRevision: number | null;
  updatedAt: Date;
};

const PUBLISHED_REVISION_KINDS = new Set<OperationalAnalysisTemplateRevisionKind>([
  "legacy",
  "publish",
  "rollback",
  "discard",
]);

export async function listOperationalAnalysisManagedTemplates(
  userId: number,
  scope: AnalysisScope,
) {
  if (!await canConfigureOperationalAnalytics(userId, scope.scopeType, scope.scopeId)) return [];
  const rows = await prisma.workspaceAnalysisTemplate.findMany({
    where: scope,
    orderBy: [{ status: "asc" }, { sortOrder: "asc" }, { updatedAt: "desc" }, { id: "asc" }],
    take: 100,
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      revision: true,
      publishedRevision: true,
      updatedAt: true,
    },
  });
  return rows.flatMap((row) => {
    const state = lifecycleState(row);
    return state ? [managedTemplateDto(row, state)] : [];
  });
}

export async function listOperationalAnalysisEditableTemplates(
  userId: number,
  scope: AnalysisScope,
) {
  if (!await canConfigureOperationalAnalytics(userId, scope.scopeType, scope.scopeId)) return [];
  const rows = await prisma.workspaceAnalysisTemplate.findMany({
    where: { ...scope, status: "active" },
    orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }, { id: "asc" }],
    take: 100,
    select: {
      id: true,
      revision: true,
      publishedRevision: true,
    },
  });
  if (!rows.length) return [];
  const snapshots = await prisma.workspaceAnalysisTemplateRevision.findMany({
    where: { OR: rows.map((row) => ({ templateId: row.id, revision: row.revision })) },
    select: {
      templateId: true,
      revision: true,
      name: true,
      description: true,
      code: true,
    },
  });
  const snapshotByTemplateId = new Map(snapshots.map((snapshot) => [snapshot.templateId, snapshot]));
  return rows.flatMap((row) => {
    const snapshot = snapshotByTemplateId.get(row.id);
    const definition = parseWorkspaceSourcesDefinition(snapshot?.code);
    if (!snapshot || snapshot.revision !== row.revision || !definition) return [];
    return [{
      key: `workspace:${row.id}`,
      id: row.id,
      name: snapshot.name,
      description: snapshot.description,
      source: "workspace" as const,
      revision: snapshot.revision,
      definition,
      lifecycle: row.publishedRevision === null
        ? { headRevision: row.revision, publishedRevision: null, hasDraft: true }
        : {
            headRevision: row.revision,
            publishedRevision: row.publishedRevision,
            hasDraft: row.revision !== row.publishedRevision,
          },
    }];
  });
}

export async function getOperationalAnalysisTemplateLifecycle(input: {
  readonly userId: number;
  readonly scope: AnalysisScope;
  readonly templateId: number;
  readonly query: OperationalAnalysisTemplateLifecycleQuery;
  readonly viaApiKey?: boolean;
}) {
  if (!await canConfigureOperationalAnalytics(input.userId, input.scope.scopeType, input.scope.scopeId)) {
    return serviceError("无权限管理该空间的经营分析模板", 403);
  }
  if (input.viaApiKey && !await canUseOperationalAnalyticsApi(input.userId, input.scope.scopeType, input.scope.scopeId)) {
    return serviceError("当前 API 凭证没有该空间的经营分析 API 使用权限", 403);
  }
  const template = await prisma.workspaceAnalysisTemplate.findFirst({
    where: { id: input.templateId, ...input.scope },
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      revision: true,
      publishedRevision: true,
      updatedAt: true,
    },
  });
  if (!template) return serviceError("分析模板不存在", 404);
  const state = lifecycleState(template);
  if (!state) return serviceError("分析模板生命周期状态无效", 409);
  const skip = (input.query.page - 1) * input.query.pageSize;
  const [revisions, total] = await prisma.$transaction([
    prisma.workspaceAnalysisTemplateRevision.findMany({
      where: { templateId: template.id },
      orderBy: { revision: "desc" },
      skip,
      take: input.query.pageSize,
      select: {
        revision: true,
        name: true,
        description: true,
        changeKind: true,
        sourceRevision: true,
        reason: true,
        createdBy: true,
        createdAt: true,
      },
    }),
    prisma.workspaceAnalysisTemplateRevision.count({ where: { templateId: template.id } }),
  ]);
  const dto: OperationalAnalysisTemplateLifecycleDTO = {
    template: managedTemplateDto(template, state),
    revisions: revisions.map((revision) => {
      const changeKind = revisionKind(revision.changeKind);
      return {
        revision: revision.revision,
        name: revision.name,
        description: revision.description,
        changeKind,
        sourceRevision: revision.sourceRevision,
        reason: revision.reason,
        createdBy: revision.createdBy,
        createdAt: revision.createdAt.toISOString(),
        isHead: revision.revision === template.revision,
        isPublished: revision.revision === template.publishedRevision,
        wasPublished: PUBLISHED_REVISION_KINDS.has(changeKind),
      };
    }),
    page: input.query.page,
    pageSize: input.query.pageSize,
    total,
  };
  return serviceOk({ success: true, data: dto });
}

export async function runOperationalAnalysisTemplateRevisionPreview(input: {
  readonly userId: number;
  readonly scope: AnalysisScope;
  readonly templateId: number;
  readonly expectedRevision: number;
  readonly revision: number;
  readonly filterValues?: Readonly<Record<string, string>>;
  readonly viaApiKey?: boolean;
  readonly signal?: AbortSignal;
}) {
  if (!await canConfigureOperationalAnalytics(input.userId, input.scope.scopeType, input.scope.scopeId)) {
    return serviceError("无权限预览该空间的经营分析草稿", 403);
  }
  if (input.viaApiKey && !await canUseOperationalAnalyticsApi(input.userId, input.scope.scopeType, input.scope.scopeId)) {
    return serviceError("当前 API 凭证没有该空间的经营分析 API 使用权限", 403);
  }
  const template = await prisma.workspaceAnalysisTemplate.findFirst({
    where: { id: input.templateId, ...input.scope },
    select: {
      status: true,
      revision: true,
      revisions: {
        where: { revision: input.revision },
        select: { code: true },
        take: 1,
      },
    },
  });
  if (!template) return serviceError("分析模板不存在", 404);
  if (template.revision !== input.expectedRevision) {
    return serviceError("分析模板已被他人修改，请刷新后重试", 409);
  }
  if (template.status !== "active") return serviceError("已归档模板不能预览", 409);
  const definition = parseWorkspaceSourcesDefinition(template.revisions[0]?.code);
  if (!definition) return serviceError("该修订不是可预览的 v3 经营分析模板", 409);
  return runFinanceWorkspaceAnalysisRuntime({
    userId: input.userId,
    scope: input.scope,
    definition,
    filterValues: input.filterValues,
    signal: input.signal,
  });
}

export async function executeOperationalAnalysisTemplateLifecycle(input: {
  readonly userId: number;
  readonly scope: AnalysisScope;
  readonly templateId: number;
  readonly command: OperationalAnalysisTemplateLifecycleCommandInput;
  readonly viaApiKey?: boolean;
}) {
  if (!await canConfigureOperationalAnalytics(input.userId, input.scope.scopeType, input.scope.scopeId)) {
    return serviceError("无权限管理该空间的经营分析模板", 403);
  }
  if (input.viaApiKey && !await canUseOperationalAnalyticsApi(input.userId, input.scope.scopeType, input.scope.scopeId)) {
    return serviceError("当前 API 凭证没有该空间的经营分析 API 使用权限", 403);
  }
  const current = await prisma.workspaceAnalysisTemplate.findFirst({
    where: { id: input.templateId, ...input.scope },
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      revision: true,
      publishedRevision: true,
      updatedAt: true,
    },
  });
  if (!current) return serviceError("分析模板不存在", 404);
  if (current.revision !== input.command.expectedRevision) {
    return serviceError("分析模板已被他人修改，请刷新后重试", 409);
  }
  const state = lifecycleState(current);
  if (!state) return serviceError("分析模板生命周期状态无效", 409);
  const planned = planOperationalAnalysisTemplateLifecycle(state, lifecycleCommand(input.command));
  if (!planned.ok) return lifecycleIssue(planned.issue);
  const source = await prisma.workspaceAnalysisTemplateRevision.findFirst({
    where: { templateId: current.id, revision: planned.plan.snapshotSourceRevision },
    select: {
      revision: true,
      name: true,
      description: true,
      code: true,
      changeKind: true,
    },
  });
  if (!source) return serviceError("生命周期来源修订不存在", 409);
  if (input.command.action === "rollback" && !PUBLISHED_REVISION_KINDS.has(revisionKind(source.changeKind))) {
    return serviceError("只能回滚到曾经发布过的修订", 409);
  }
  if (input.command.action === "publish" || input.command.action === "rollback") {
    const definition = parseWorkspaceSourcesDefinition(source.code);
    if (!definition) return serviceError("只有 v3 经营分析模板可以发布", 409);
    const compiled = await compileAuthorizedFinanceWorkspaceAnalysisDefinition({
      userId: input.userId,
      scope: input.scope,
      definition,
    });
    if (!compiled.ok) return compiled;
  }
  if (source.name !== current.name) {
    const duplicate = await prisma.workspaceAnalysisTemplate.findFirst({
      where: { ...input.scope, name: source.name, id: { not: current.id } },
      select: { id: true },
    });
    if (duplicate) return serviceError("当前空间已经存在同名分析模板", 409);
  }

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const claimed = await tx.workspaceAnalysisTemplate.updateMany({
      where: {
        id: current.id,
        ...input.scope,
        status: current.status,
        revision: input.command.expectedRevision,
      },
      data: {
        name: source.name,
        description: source.description,
        code: source.code,
        status: planned.plan.nextStatus,
        revision: planned.plan.nextRevision,
        publishedRevision: planned.plan.nextPublishedRevision,
        updatedBy: input.userId,
        ...(planned.plan.publishedAudit === "set" ? { publishedBy: input.userId, publishedAt: now } : {}),
        ...(planned.plan.publishedAudit === "clear" ? { publishedBy: null, publishedAt: null } : {}),
        ...(planned.plan.archivedAudit === "set" ? { archivedBy: input.userId, archivedAt: now } : {}),
        ...(planned.plan.archivedAudit === "clear" ? { archivedBy: null, archivedAt: null } : {}),
      },
    });
    if (claimed.count !== 1) return null;
    await tx.workspaceAnalysisTemplateRevision.create({
      data: {
        templateId: current.id,
        revision: planned.plan.nextRevision,
        name: source.name,
        description: source.description,
        code: source.code,
        changeKind: planned.plan.changeKind,
        sourceRevision: source.revision,
        reason: input.command.reason?.trim() || null,
        createdBy: input.userId,
      },
    });
    return tx.workspaceAnalysisTemplate.findUnique({
      where: { id: current.id },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        revision: true,
        publishedRevision: true,
        updatedAt: true,
      },
    });
  });
  if (!updated) return serviceError("分析模板已被他人修改，请刷新后重试", 409);
  const updatedState = lifecycleState(updated);
  if (!updatedState) return serviceError("分析模板生命周期状态无效", 409);
  return serviceOk({ success: true, data: managedTemplateDto(updated, updatedState) });
}

function lifecycleCommand(
  input: OperationalAnalysisTemplateLifecycleCommandInput,
): OperationalAnalysisTemplateLifecycleCommand {
  return input.action === "rollback"
    ? { kind: input.action, sourceRevision: input.sourceRevision }
    : { kind: input.action };
}

function lifecycleState(row: { status: string; revision: number; publishedRevision: number | null }) {
  if (row.status !== "active" && row.status !== "archived") return null;
  if (!Number.isInteger(row.revision) || row.revision <= 0) return null;
  if (row.publishedRevision !== null
    && (!Number.isInteger(row.publishedRevision) || row.publishedRevision <= 0 || row.publishedRevision > row.revision)) return null;
  return {
    status: row.status,
    revision: row.revision,
    publishedRevision: row.publishedRevision,
  } satisfies OperationalAnalysisTemplateLifecycleState;
}

function managedTemplateDto(
  row: ManagedTemplateRow,
  state: OperationalAnalysisTemplateLifecycleState,
): OperationalAnalysisManagedTemplateDTO {
  return {
    key: `workspace:${row.id}`,
    id: row.id,
    name: row.name,
    description: row.description,
    status: state.status,
    headRevision: state.revision,
    publishedRevision: state.publishedRevision,
    hasDraft: hasOperationalAnalysisDraft(state),
    updatedAt: row.updatedAt.toISOString(),
    actions: lifecycleActions(state),
  };
}

function lifecycleActions(
  state: OperationalAnalysisTemplateLifecycleState,
): OperationalAnalysisTemplateLifecycleActionsDTO {
  const draft = hasOperationalAnalysisDraft(state);
  const active = state.status === "active";
  return {
    publish: action(active && draft, active ? "当前没有待发布草稿" : "已归档模板不能发布"),
    rollback: action(active && state.publishedRevision !== null && !draft, draft ? "请先发布或放弃当前草稿" : "当前没有已发布版本"),
    discard: action(active && state.publishedRevision !== null && draft, state.publishedRevision === null ? "首次草稿可直接归档" : "当前没有待放弃草稿"),
    archive: action(active && (state.publishedRevision === null || !draft), draft ? "请先发布或放弃当前草稿" : "模板已经归档"),
    restore: action(!active, active ? "模板当前未归档" : null),
  };
}

function action(enabled: boolean, reason: string | null): { enabled: boolean; reason: string | null } {
  return { enabled, reason: enabled ? null : reason };
}

function revisionKind(value: string): OperationalAnalysisTemplateRevisionKind {
  if (value === "draft" || value === "publish" || value === "rollback" || value === "discard"
    || value === "archive" || value === "restore") return value;
  return "legacy";
}

function parseWorkspaceSourcesDefinition(code: string | undefined) {
  if (!code) return null;
  try {
    const parsed = workspaceSourcesOperationalAnalysisDefinitionSchema.safeParse(JSON.parse(code));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function lifecycleIssue(issue: OperationalAnalysisTemplateLifecycleIssue) {
  const messages: Record<OperationalAnalysisTemplateLifecycleIssue, string> = {
    template_archived: "已归档模板只能先恢复为草稿",
    template_active: "模板当前未归档",
    no_draft: "当前没有待处理草稿",
    unpublished_template: "模板尚未发布",
    dirty_draft: "请先发布或放弃当前草稿",
    invalid_source_revision: "回滚来源修订无效",
  };
  return serviceError(messages[issue], 409);
}
