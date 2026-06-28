import {
  createFkRegistryFromRegistrations,
  defineFkRegistrations,
  type FkRegistrationAdapters,
  type FkRegistration,
} from "@workspace/platform/server/fk-targets";
import { getRegisteredModuleDefinition } from "@workspace/platform/module-registry";
import {
  archivedBooleanFilter,
  matchesFkKeyword,
  normalizeLifecycleScope,
} from "@workspace/platform/server/fk-registry";
import { prisma } from "@workspace/platform/server/prisma";
import { buildVisibleProjectWhere } from "./access";
import { buildVisibleMeetingWhere } from "./meeting-access";

const WORK_FK_REGISTRATIONS = getRegisteredModuleDefinition("@workspace/work").fkRegistrations as FkRegistration[];

const WORK_FK_ADAPTERS: FkRegistrationAdapters = {
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
  "work.tasks.linked.project": {
    search: ({ keyword, lifecycleScope, userId }) => listVisibleProjectReferenceOptions({
      userId: requireFkUserId(userId),
      keyword,
      lifecycleScope,
    }),
  },
  "work.projectTasks.project": {
    search: ({ keyword, lifecycleScope, userId }) => listVisibleProjectReferenceOptions({
      userId: requireFkUserId(userId),
      keyword,
      lifecycleScope,
    }),
  },
  "work.projects.parentTask": {
    search: ({ keyword, userId }) => listVisibleProjectTaskReferenceOptions({
      userId: requireFkUserId(userId),
      keyword,
    }),
  },
  "work.projectTasks.planPhase": {
    search: ({ keyword, userId }) => listVisibleProjectPlanPhaseReferenceOptions({
      userId: requireFkUserId(userId),
      keyword,
    }),
  },
  "work.projectTasks.source.decision": {
    search: ({ keyword, userId }) => listVisibleMeetingDecisionReferenceOptions({
      userId: requireFkUserId(userId),
      keyword,
    }),
  },
  "work.projectTasks.source.actionCandidate": {
    search: ({ keyword, userId }) => listVisibleMeetingActionCandidateReferenceOptions({
      userId: requireFkUserId(userId),
      keyword,
    }),
  },
  "work.tasks.source.meeting": {
    search: ({ keyword, userId }) => listVisibleMeetingReferenceOptions({
      userId: requireFkUserId(userId),
      keyword,
    }),
  },
};

function requireFkUserId(userId: number | undefined) {
  if (!userId) throw new Error("未登录");
  return userId;
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

async function listVisibleMeetingDecisionReferenceOptions(input: {
  userId: number;
  keyword: string;
}) {
  const visibleWhere = await buildVisibleMeetingWhere(input.userId);
  const rows = await prisma.meetingDecision.findMany({
    where: { meeting: visibleWhere },
    select: { id: true, title: true, kind: true, meeting: { select: { title: true } } },
    orderBy: [{ decidedAt: "desc" }, { id: "desc" }],
    take: input.keyword.trim() ? 80 : 20,
  });

  return rows
    .map((row) => ({
      id: row.id,
      name: row.title,
      subtitle: [row.kind, row.meeting.title].filter(Boolean).join(" · "),
      lifecycleStatus: "active" as const,
    }))
    .filter((row) => matchesFkKeyword([row.name, row.subtitle], input.keyword))
    .slice(0, 20);
}

async function listVisibleMeetingActionCandidateReferenceOptions(input: {
  userId: number;
  keyword: string;
}) {
  const visibleWhere = await buildVisibleMeetingWhere(input.userId);
  const rows = await prisma.meetingActionCandidate.findMany({
    where: { meeting: visibleWhere },
    select: { id: true, title: true, status: true, meeting: { select: { title: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: input.keyword.trim() ? 80 : 20,
  });

  return rows
    .map((row) => ({
      id: row.id,
      name: row.title,
      subtitle: [row.status, row.meeting.title].filter(Boolean).join(" · "),
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

async function listVisibleProjectPlanPhaseReferenceOptions(input: {
  userId: number;
  keyword: string;
}) {
  const visibleWhere = await buildVisibleProjectWhere(input.userId);
  const rows = await prisma.projectPlanPhase.findMany({
    where: { project: visibleWhere },
    select: { id: true, name: true, sequenceNo: true, project: { select: { code: true, name: true } } },
    orderBy: [{ projectId: "asc" }, { sequenceNo: "asc" }, { id: "asc" }],
    take: input.keyword.trim() ? 80 : 20,
  });

  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      subtitle: [row.project.code, row.project.name, `#${row.sequenceNo}`].filter(Boolean).join(" · "),
      lifecycleStatus: "active" as const,
    }))
    .filter((row) => matchesFkKeyword([row.name, row.subtitle], input.keyword))
    .slice(0, 20);
}

async function listVisibleProjectTaskReferenceOptions(input: {
  userId: number;
  keyword: string;
}) {
  const visibleWhere = await buildVisibleProjectWhere(input.userId);
  const rows = await prisma.projectTask.findMany({
    where: { project: visibleWhere },
    select: { id: true, name: true, project: { select: { code: true, name: true } } },
    orderBy: [{ projectId: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
    take: input.keyword.trim() ? 80 : 20,
  });

  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      subtitle: [row.project.code, row.project.name].filter(Boolean).join(" · "),
      lifecycleStatus: "active" as const,
    }))
    .filter((row) => matchesFkKeyword([row.name, row.subtitle], input.keyword))
    .slice(0, 20);
}

export const WORK_FK_DEFINITIONS = defineFkRegistrations(WORK_FK_REGISTRATIONS, WORK_FK_ADAPTERS);
export const WORK_FK_REGISTRY = createFkRegistryFromRegistrations(WORK_FK_REGISTRATIONS, WORK_FK_ADAPTERS);
