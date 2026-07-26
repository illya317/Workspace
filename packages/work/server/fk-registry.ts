import {
  createRelationCatalogFromRegistrations,
  defineRelationRegistrations,
  type RelationRegistrationAdapters,
} from "@workspace/platform/server/relation-targets";
import { getRegisteredModuleDefinition } from "@workspace/platform/module-registry";
import { archivedBooleanFilter, currentEmploymentDateWhere, currentOpenEndedDateWhere, employmentIsActiveOnDate, matchesFkKeyword, normalizeLifecycleScope } from "@workspace/platform/server/relation-registry";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { buildVisibleProjectWhere } from "./access";
import { buildVisibleMeetingWhere } from "./meeting-access";
import { listWorkTaskSpaces } from "./task-spaces";
import { listWorkOkrCycleOptions, resolveWorkOkrCycleOption } from "./work-okr-cycles";
import { listWorkSourceDepartmentsForScope, listWorkSourceDepartmentOptions } from "./work-source-departments";
import { listWorkResponsibilityReferenceOptions, resolveWorkResponsibilityReferenceOption } from "./work-responsibility-references";
import { workOwnerDepartmentScopeIds } from "./work-owner-scopes";
import {
  listWorkPeriodItemRelationOptions,
  listWorkPeriodPlanRelationOptions,
  listWorkPlanAlignmentOptions,
  listWorkPlanUpperAlignmentOptions,
  resolveWorkPlanAlignmentOption,
  resolveWorkItemRelationOption,
  resolveWorkPlanRelationOption,
} from "./work-period-relations";
import { listAssignedWorkItemAlignmentOptions } from "./work-assigned-alignment-options";
import { resolveProjectMemberDepartmentScopeIds } from "./project-member-department-scope";
import { listWorkOwnerEmployeeOptions } from "./work-owner-eligibility";
import { listRecursiveSuperiorEmployeeIdsForUser } from "./work-superior-employees";
import {
  collaborationExecutorPositionIds,
  listDepartmentCollaborationReferenceOptions,
  resolveDepartmentCollaborationReferenceOption,
} from "./work-collaboration-references";

const WORK_RELATION_REGISTRATIONS = getRegisteredModuleDefinition("@workspace/work").relationRegistrations ?? [];
const WORK_SELECTOR_RELATION_REGISTRATIONS = WORK_RELATION_REGISTRATIONS.filter((registration) => registration.usage !== "governance");

const WORK_RELATION_ADAPTERS: RelationRegistrationAdapters = {
  "work.projects.parent": {
    search: ({ keyword, lifecycleScope, userId }) => listVisibleProjectReferenceOptions({
      userId: requireFkUserId(userId),
      keyword,
      lifecycleScope,
    }),
  },
  "work.projects.member.project": {
    search: ({ keyword, lifecycleScope, userId }) => listVisibleProjectReferenceOptions({
      userId: requireFkUserId(userId),
      keyword,
      lifecycleScope,
    }),
  },
  "work.projects.member.employee": {
    search: ({ keyword, lifecycleScope }) => listEmployeeReferenceOptions({ keyword, lifecycleScope }),
  },
  "work.projects.member.enablingDepartmentEmployee": {
    search: ({ keyword, lifecycleScope, params, userId }) => listDepartmentEmployeeReferenceOptions({
      keyword,
      lifecycleScope,
      projectType: params?.projectType,
      departmentIds: normalizePositiveParams(params?.departmentIds ?? params?.departmentId),
      actorUserId: userId,
    }),
  },
  "work.tasks.linked.project": {
    search: ({ keyword, lifecycleScope, userId }) => listVisibleProjectReferenceOptions({
      userId: requireFkUserId(userId),
      keyword,
      lifecycleScope,
    }),
  },
  "work.tasks.source.meeting": {
    search: ({ keyword, userId }) => listVisibleMeetingReferenceOptions({
      userId: requireFkUserId(userId),
      keyword,
    }),
  },
  "work.tasks.source.department": {
    search: ({ keyword, userId, params }) => listWorkSourceDepartmentOptions({
      userId: requireFkUserId(userId),
      keyword,
      targetType: params?.scopeTargetType,
      targetId: normalizePositiveParam(params?.scopeTargetId),
    }),
  },
  "work.tasks.owner.employee": {
    search: ({ keyword, lifecycleScope, params, userId }) => listWorkOwnerEmployeeReferenceOptions({
      keyword,
      lifecycleScope,
      userId,
      targetType: params?.targetType,
      targetId: normalizePositiveParam(params?.targetId),
      collaborationId: normalizePositiveParam(params?.collaborationId),
    }),
  },
  "work.tasks.collaboration": {
    search: ({ keyword, params, userId }) => listDepartmentCollaborationReferenceOptions({
      userId: requireFkUserId(userId),
      keyword,
      targetType: params?.targetType,
      targetId: normalizePositiveParam(params?.targetId),
    }),
    resolve: resolveDepartmentCollaborationReferenceOption,
  },
  "work.tasks.owner.position": {
    search: ({ keyword, params }) => listWorkOwnerPositionReferenceOptions({
      keyword,
      targetType: params?.targetType,
      targetId: normalizePositiveParam(params?.targetId),
      ownerEmployeeId: normalizePositiveParam(params?.ownerEmployeeId),
      collaborationId: normalizePositiveParam(params?.collaborationId),
    }),
  },
  "work.tasks.item.responsibility-group": {
    search: ({ keyword, params }) => listWorkResponsibilityReferenceOptions({
      keyword,
      nodeType: "duty_group",
      targetType: params?.targetType,
      targetId: normalizePositiveParam(params?.targetId),
      ownerEmployeeId: normalizePositiveParam(params?.ownerEmployeeId),
      positionId: normalizePositiveParam(params?.positionId),
    }),
    resolve: resolveWorkResponsibilityReferenceOption,
  },
  "work.tasks.item.responsibility": {
    search: ({ keyword, params }) => listWorkResponsibilityReferenceOptions({
      keyword,
      nodeType: "duty_item",
      targetType: params?.targetType,
      targetId: normalizePositiveParam(params?.targetId),
      ownerEmployeeId: normalizePositiveParam(params?.ownerEmployeeId),
      positionId: normalizePositiveParam(params?.positionId),
    }),
    resolve: resolveWorkResponsibilityReferenceOption,
  },
  "work.tasks.okr.cycle": {
    search: ({ keyword, params }) => listWorkOkrCycleOptions({
      keyword,
      periodType: params?.periodType,
    }),
    resolve: resolveWorkOkrCycleOption,
  },
  "work.tasks.source.plan": {
    search: ({ keyword, userId, params }) => listVisibleWorkPlanReferenceOptions({
      userId: requireFkUserId(userId),
      keyword,
      targetType: params?.targetType,
      scopeTargetType: params?.scopeTargetType,
      scopeTargetId: normalizePositiveParam(params?.scopeTargetId),
      sourceDepartmentId: normalizePositiveParam(params?.sourceDepartmentId),
    }),
    resolve: resolveWorkPlanReferenceOption,
  },
  "work.tasks.parent.plan": {
    search: ({ keyword, params }) => listWorkPeriodPlanRelationOptions({
      keyword,
      relation: "parent",
      targetType: params?.targetType,
      targetId: normalizePositiveParam(params?.targetId),
      okrCycleId: normalizePositiveParam(params?.okrCycleId),
      currentPlanId: normalizePositiveParam(params?.currentPlanId),
    }),
    resolve: resolveWorkPlanRelationOption,
  },
  "work.tasks.plan.alignment": {
    search: ({ keyword, params, userId }) => listWorkPlanAlignmentOptions({
      userId,
      keyword,
      targetType: params?.targetType,
      targetId: normalizePositiveParam(params?.targetId),
      okrCycleId: normalizePositiveParam(params?.okrCycleId),
      currentPlanId: normalizePositiveParam(params?.currentPlanId),
    }),
    resolve: resolveWorkPlanAlignmentOption,
  },
  "work.tasks.plan.upper-alignment": {
    search: ({ keyword, params }) => listWorkPlanUpperAlignmentOptions({
      keyword,
      targetType: params?.targetType,
      targetId: normalizePositiveParam(params?.targetId),
      okrCycleId: normalizePositiveParam(params?.okrCycleId),
      currentPlanId: normalizePositiveParam(params?.currentPlanId),
    }),
    resolve: resolveWorkPlanAlignmentOption,
  },
  "work.tasks.assigned.alignment.item": {
    search: ({ keyword, params, userId }) => listAssignedWorkItemAlignmentOptions({
      userId,
      keyword,
      targetType: params?.targetType,
      targetId: normalizePositiveParam(params?.targetId),
      currentWorkItemId: normalizePositiveParam(params?.currentWorkItemId),
    }),
    resolve: resolveWorkItemRelationOption,
  },
  "work.tasks.previous.plan": {
    search: ({ keyword, params }) => listWorkPeriodPlanRelationOptions({
      keyword,
      relation: "previous",
      targetType: params?.targetType,
      targetId: normalizePositiveParam(params?.targetId),
      okrCycleId: normalizePositiveParam(params?.okrCycleId),
      currentPlanId: normalizePositiveParam(params?.currentPlanId),
    }),
    resolve: resolveWorkPlanRelationOption,
  },
  "work.tasks.parent.item": {
    search: ({ keyword, params }) => listWorkPeriodItemRelationOptions({
      keyword,
      relation: "parent",
      targetType: params?.targetType,
      targetId: normalizePositiveParam(params?.targetId),
      planId: normalizePositiveParam(params?.planId),
      currentWorkItemId: normalizePositiveParam(params?.currentWorkItemId),
      itemType: params?.itemType,
    }),
    resolve: resolveWorkItemRelationOption,
  },
  "work.tasks.previous.item": {
    search: ({ keyword, params }) => listWorkPeriodItemRelationOptions({
      keyword,
      relation: "previous",
      targetType: params?.targetType,
      targetId: normalizePositiveParam(params?.targetId),
      planId: normalizePositiveParam(params?.planId),
      currentWorkItemId: normalizePositiveParam(params?.currentWorkItemId),
      itemType: params?.itemType,
    }),
    resolve: resolveWorkItemRelationOption,
  },
};

function requireFkUserId(userId: number | undefined) {
  if (!userId) throw new Error("未登录");
  return userId;
}

async function listDepartmentEmployeeReferenceOptions(input: {
  keyword: string;
  lifecycleScope: "active" | "all" | "archived";
  projectType?: string | null;
  departmentIds: number[];
  actorUserId?: number | null;
}) {
  const departmentIds = await resolveProjectMemberDepartmentScopeIds(input);
  if (departmentIds.length === 0) return [];
  const excludedEmployeeIds = input.actorUserId
    ? await listRecursiveSuperiorEmployeeIdsForUser(input.actorUserId)
    : [];
  return listEmployeeReferenceOptions({ ...input, departmentIds, excludedEmployeeIds });
}

async function listEmployeeReferenceOptions(input: {
  keyword: string;
  lifecycleScope: "active" | "all" | "archived";
  departmentIds?: number[];
  excludedEmployeeIds?: number[];
}) {
  const rows = await prisma.employee.findMany({
    where: {
      ...(input.departmentIds?.length
        ? { positions: { some: currentEmployeeDepartmentWhere(input.departmentIds) } }
        : {}),
      ...(input.excludedEmployeeIds?.length ? { id: { notIn: input.excludedEmployeeIds } } : {}),
      ...(input.lifecycleScope === "active"
        ? { employments: { some: currentEmploymentDateWhere() } }
        : input.lifecycleScope === "archived"
          ? { employments: { none: currentEmploymentDateWhere() } }
          : {}),
    },
    select: {
      id: true,
      name: true,
      employeeId: true,
      employments: { select: { isActive: true, joinDate: true, leaveDate: true } },
    },
    orderBy: { employeeId: "asc" },
    ...(input.keyword.trim() ? {} : { take: 120 }),
  });
  return rows
    .map((row) => {
      const active = row.employments.some((employment) => employmentIsActiveOnDate(employment, workspaceBusinessDate(new Date())));
      return {
        id: row.id,
        name: row.name,
        subtitle: row.employeeId,
        lifecycleStatus: active ? "active" as const : "inactive" as const,
      };
    })
    .filter((row) => matchesFkKeyword([row.name, row.subtitle], input.keyword))
    .slice(0, 50);
}

function currentEmployeeDepartmentWhere(departmentIds: number[]) {
  return currentOpenEndedDateWhere({ departmentId: { in: departmentIds } });
}

async function listWorkOwnerEmployeeReferenceOptions(input: {
  keyword: string;
  lifecycleScope?: string;
  userId?: number | null;
  targetType?: string | null;
  targetId?: number | null;
  collaborationId?: number | null;
}) {
  return listWorkOwnerEmployeeOptions({
    actorUserId: input.userId,
    targetType: input.targetType,
    targetId: input.targetId,
    collaborationId: input.collaborationId,
    keyword: input.keyword,
    lifecycleScope: normalizeLifecycleScope(input.lifecycleScope),
  });
}

async function listWorkOwnerPositionReferenceOptions(input: {
  keyword: string;
  targetType?: string | null;
  targetId?: number | null;
  ownerEmployeeId?: number | null;
  collaborationId?: number | null;
}) {
  const employeeIds = await workOwnerPositionEmployeeIds(input);
  if (employeeIds.length === 0) return [];
  const executorPositionIds = input.collaborationId ? await collaborationExecutorPositionIds(input) : null;
  const departmentIds = executorPositionIds === null ? await workOwnerDepartmentScopeIds(input.targetType, input.targetId) : [];
  const rows = await prisma.eDP.findMany({
    where: {
      employeeId: { in: employeeIds },
      ...(executorPositionIds === null && departmentIds.length > 0 ? { departmentId: { in: departmentIds } } : {}),
      positionId: executorPositionIds === null ? { not: null } : { in: executorPositionIds },
      ...currentEdpWhere(),
      position: { isArchived: false, positionDescriptionId: { not: null } },
    },
    select: {
      id: true,
      isPrimary: true,
      employeeId: true,
      department: { select: { name: true } },
      position: { select: { id: true, code: true, name: true } },
    },
    orderBy: [{ isPrimary: "desc" }, { id: "asc" }],
  });
  const seen = new Set<number>();
  return rows
    .flatMap((row) => {
      if (!row.position || seen.has(row.position.id)) return [];
      seen.add(row.position.id);
      const option = {
        id: row.position.id,
        name: row.position.name,
        subtitle: [row.position.code, row.department?.name, row.isPrimary ? "主岗" : null].filter(Boolean).join(" · "),
        lifecycleStatus: "active" as const,
        isPrimary: row.isPrimary,
      };
      return matchesFkKeyword([option.name, option.subtitle], input.keyword) ? [option] : [];
    })
    .slice(0, 50);
}

async function workOwnerPositionEmployeeIds(input: {
  targetType?: string | null;
  targetId?: number | null;
  ownerEmployeeId?: number | null;
}) {
  if (input.ownerEmployeeId) return [input.ownerEmployeeId];
  if (input.targetType !== "personal" || !input.targetId) return [];
  const rows = await prisma.employee.findMany({ where: { userId: input.targetId }, select: { id: true } });
  return rows.map((row) => row.id);
}

function currentEdpWhere() {
  return currentOpenEndedDateWhere();
}

async function listVisibleWorkPlanReferenceOptions(input: {
  userId: number;
  keyword: string;
  targetType?: string | null;
  scopeTargetType?: string | null;
  scopeTargetId?: number | null;
  sourceDepartmentId?: number | null;
}) {
  const scopedSearch = await workPlanSourceSearchForScope(input);
  if (scopedSearch) return listWorkPlanReferenceRows({ keyword: input.keyword, ...scopedSearch });

  const { spaces } = await listWorkTaskSpaces(input.userId);
  const visibleSpaces = spaces.filter((space) => space.actionPermissions.canRead && (!input.targetType || space.targetType === input.targetType));
  if (!visibleSpaces.length) return [];
  return listWorkPlanReferenceRows({
    keyword: input.keyword,
    where: {
      OR: visibleSpaces.map((space) => ({ targetType: space.targetType, targetId: space.targetId })),
      kind: "okr",
      isArchived: false,
    },
    spaceLabelByKey: new Map(visibleSpaces.map((space) => [`${space.targetType}:${space.targetId}`, space.name])),
  });
}

async function workPlanSourceSearchForScope(input: {
  targetType?: string | null;
  scopeTargetType?: string | null;
  scopeTargetId?: number | null;
  sourceDepartmentId?: number | null;
}): Promise<{ where: Prisma.WorkPlanWhereInput; spaceLabelByKey: ReadonlyMap<string, string> } | null> {
  if (input.targetType !== "department" || !input.scopeTargetType || !input.scopeTargetId) return null;
  const allowedDepartments = await listWorkSourceDepartmentsForScope({
    targetType: input.scopeTargetType,
    targetId: input.scopeTargetId,
  });
  const departments = input.sourceDepartmentId
    ? allowedDepartments.filter((department) => department.id === input.sourceDepartmentId)
    : allowedDepartments;
  const departmentIds = departments.map((department) => department.id);
  const spaceLabelByKey = new Map(departments.map((department) => [`department:${department.id}`, department.name]));
  if (!departmentIds.length) {
    return {
      where: {
        targetType: "department",
        targetId: { in: [] },
        kind: "okr",
        isArchived: false,
      },
      spaceLabelByKey,
    };
  }
  return {
    where: {
      targetType: "department",
      targetId: { in: departmentIds },
      kind: "okr",
      isArchived: false,
    },
    spaceLabelByKey,
  };
}

async function listWorkPlanReferenceRows(input: {
  keyword: string;
  where: Prisma.WorkPlanWhereInput;
  spaceLabelByKey?: ReadonlyMap<string, string>;
}) {
  const rows = await prisma.workPlan.findMany({
    where: input.where,
    select: {
      id: true,
      title: true,
      targetType: true,
      targetId: true,
      okrCycle: { select: { label: true } },
      periodType: true,
      actualStartDate: true,
      actualEndDate: true,
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: input.keyword.trim() ? 120 : 30,
  });
  return rows
    .map((row) => ({
      id: row.id,
      name: row.title,
      subtitle: [row.okrCycle?.label ?? formatWorkPlanPeriod(row), input.spaceLabelByKey?.get(`${row.targetType}:${row.targetId}`)].filter(Boolean).join(" · "),
      lifecycleStatus: "active" as const,
    }))
    .filter((row) => matchesFkKeyword([row.name, row.subtitle], input.keyword))
    .slice(0, 20);
}

function normalizePositiveParam(value: string | null | undefined) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizePositiveParams(value: string | null | undefined) {
  if (!value) return [];
  return Array.from(new Set(value.split(",")
    .map((item) => Number(item))
    .filter((id) => Number.isInteger(id) && id > 0)));
}

async function resolveWorkPlanReferenceOption(id: number) {
  const row = await prisma.workPlan.findUnique({ where: { id }, select: { id: true, title: true } });
  return row ? { id: row.id, label: row.title, lifecycleStatus: "active" as const } : null;
}

function formatWorkPlanPeriod(row: { periodType: string | null; actualStartDate: Date | null; actualEndDate: Date | null }) {
  if (!row.periodType) return null;
  const start = row.actualStartDate?.toISOString().slice(0, 10);
  const end = row.actualEndDate?.toISOString().slice(0, 10);
  return [row.periodType, start && end ? `${start} - ${end}` : null].filter(Boolean).join(" · ");
}

async function listVisibleMeetingReferenceOptions(input: {
  userId: number;
  keyword: string;
}) {
  const visibleWhere = await buildVisibleMeetingWhere(input.userId);
  const rows = await prisma.meeting.findMany({
    where: visibleWhere,
    select: { id: true, title: true, startAt: true },
    orderBy: [{ startAt: "desc" }, { id: "desc" }],
    take: input.keyword.trim() ? 80 : 20,
  });

  return rows
    .map((row) => ({
      id: row.id,
      name: row.title,
      subtitle: row.startAt ? row.startAt.toISOString().slice(0, 10) : undefined,
      lifecycleStatus: "active" as const,
    }))
    .filter((row) => matchesFkKeyword([row.name, row.subtitle], input.keyword))
    .slice(0, 20);
}

export async function listVisibleProjectReferenceOptions(input: {
  userId: number;
  keyword: string;
  lifecycleScope?: string;
}) {
  const lifecycleScope = normalizeLifecycleScope(input.lifecycleScope);
  const visibleWhere = await buildVisibleProjectWhere(input.userId);
  const rows = await prisma.project.findMany({
    where: { AND: [visibleWhere, archivedBooleanFilter(lifecycleScope)] },
    select: { id: true, name: true, code: true, isArchived: true },
    orderBy: lifecycleScope === "archived" ? [{ archivedAt: "desc" }, { id: "desc" }] : { id: "asc" },
    take: input.keyword.trim() ? 80 : 20,
  });

  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      subtitle: row.code ?? undefined,
      lifecycleStatus: row.isArchived ? "archived" as const : "active" as const,
    }))
    .filter((row) => matchesFkKeyword([row.name, row.subtitle], input.keyword))
    .slice(0, 20);
}

export const WORK_FK_DEFINITIONS = defineRelationRegistrations(WORK_SELECTOR_RELATION_REGISTRATIONS, WORK_RELATION_ADAPTERS);
export const WORK_FK_REGISTRY = createRelationCatalogFromRegistrations(WORK_SELECTOR_RELATION_REGISTRATIONS, WORK_RELATION_ADAPTERS);
