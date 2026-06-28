import { serviceError, serviceOk, serviceResponse } from "@workspace/platform/server/api";
import type { DomainServiceResult } from "@workspace/platform/server/domain-validation";
import { prisma } from "@workspace/platform/server/prisma";
import {
  buildVisibleMeetingWhere,
  canDeleteMeeting,
  canEditMeeting,
  canUseMeetings,
  getMeetingPermissions,
  getMeetingPermissionsById,
} from "./meeting-access";
import { canEditWorkTask, canViewProject } from "./access";
import { createProjectTask, updateProjectTask } from "./project-tasks";
import { createWorkPlan, getWorkPlanAccessMetadata, updateWorkPlan } from "./work-plans";
import {
  validateMeetingActionCandidate,
  validateMeetingActionCandidateLink,
  validateMeetingAgenda,
  validateMeetingCreate,
  validateMeetingDelete,
  validateMeetingDecision,
  validateMeetingMinute,
  validateMeetingParticipant,
  validateMeetingProposal,
  validateMeetingProposalClose,
  validateMeetingUpdate,
  validateMeetingVote,
} from "./domain/meeting-validation";
import {
  meetingDetailInclude,
  meetingSummaryInclude,
  tallyVotes,
  toMeetingDetailDto,
  toMeetingSummaryDto,
} from "./meeting-dto";

const DEFAULT_MEETING_TYPES = [
  { key: "business_cycle", name: "周期经营会议", description: "周会、月度会、季度经营会", sortOrder: 10 },
  { key: "management", name: "管理层会议", description: "管理人员会议、核心人员会议、组织和预算会议", sortOrder: 20 },
  { key: "special", name: "专项会议", description: "风险、客户、跨部门协调、制度评审等专项会议", sortOrder: 30 },
] as const;

const DEFAULT_MEETING_TYPE_KEYS = DEFAULT_MEETING_TYPES.map(type => type.key);

export async function listMeetingTypes() {
  await ensureDefaultMeetingTypes();
  return prisma.meetingType.findMany({
    where: { key: { in: DEFAULT_MEETING_TYPE_KEYS } },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
}

export async function listMeetings(input: { userId: number; typeId?: number | null }) {
  if (!(await canUseMeetings(input.userId))) return serviceError("无权限", 403);
  await ensureDefaultMeetingTypes();
  const visibleWhere = await buildVisibleMeetingWhere(input.userId);
  const meetings = await prisma.meeting.findMany({
    where: { AND: [visibleWhere, { type: { key: { in: DEFAULT_MEETING_TYPE_KEYS } } }, input.typeId ? { typeId: input.typeId } : {}] },
    include: meetingSummaryInclude,
    orderBy: [{ startAt: "desc" }, { id: "desc" }],
    take: 200,
  });
  return serviceOk({ types: await listMeetingTypes(), meetings: meetings.map(toMeetingSummaryDto) });
}

export async function getMeetingDetail(input: { userId: number; meetingId: number }) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: input.meetingId },
    include: meetingDetailInclude,
  });
  if (!meeting) return serviceError("会议不存在", 404);
  const permissions = await getMeetingPermissions(input.userId, meeting);
  if (!permissions.canView) return serviceError("无权限", 403);
  return serviceOk({ meeting: toMeetingDetailDto(meeting, input.userId, permissions) });
}

export async function createMeeting(input: { userId: number; body: Record<string, unknown> }) {
  if (!(await canUseMeetings(input.userId, "write"))) return serviceError("无权限", 403);
  await ensureDefaultMeetingTypes();
  const command = validateMeetingCreate(input.body);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status);
  const type = await prisma.meetingType.findFirst({
    where: { id: command.data.typeId, key: { in: DEFAULT_MEETING_TYPE_KEYS } },
  });
  if (!type) return serviceError("会议类型不存在", 404);
  if (command.data.seriesId) {
    const series = await prisma.meetingSeries.findUnique({ where: { id: command.data.seriesId }, select: { typeId: true } });
    if (!series || series.typeId !== command.data.typeId) return serviceError("会议系列不存在", 404);
  }
  const ownerUserId = command.data.ownerUserId ?? input.userId;
  const secretaryUserId = command.data.secretaryUserId ?? input.userId;
  const userIds = new Set([ownerUserId, secretaryUserId, input.userId, ...command.data.participantUserIds]);
  const existingUsers = await prisma.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true } });
  if (existingUsers.length !== userIds.size) return serviceError("参会用户不存在", 400);

  const meeting = await prisma.$transaction(async (tx) => {
    const created = await tx.meeting.create({
      data: {
        typeId: command.data.typeId,
        seriesId: command.data.seriesId,
        title: command.data.title,
        description: command.data.description,
        startAt: command.data.startAt,
        endAt: command.data.endAt,
        location: command.data.location,
        visibility: command.data.visibility || type.defaultVisibility,
        ownerUserId,
        secretaryUserId,
        createdBy: input.userId,
      },
    });
    for (const userId of userIds) {
      const role = userId === ownerUserId ? "owner" : userId === secretaryUserId ? "secretary" : "participant";
      await tx.meetingParticipant.create({
        data: { meetingId: created.id, userId, role, canVote: role === "owner" },
      });
    }
    return created;
  });
  return getMeetingDetail({ userId: input.userId, meetingId: meeting.id });
}

export async function updateMeeting(input: { userId: number; meetingId: number; body: Record<string, unknown> }) {
  if (!(await canEditMeeting(input.userId, input.meetingId))) return serviceError("无权限", 403);
  const command = validateMeetingUpdate(input.body);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status);
  await prisma.meeting.update({ where: { id: input.meetingId }, data: command.data });
  return getMeetingDetail({ userId: input.userId, meetingId: input.meetingId });
}

export async function deleteMeeting(input: { userId: number; meetingId: number }) {
  const command = validateMeetingDelete({ meetingId: input.meetingId });
  if (!command.ok) return serviceError(command.issue.message, command.issue.status);
  if (!(await canDeleteMeeting(input.userId, command.data.meetingId))) return serviceError("无权限", 403);
  await prisma.meeting.delete({ where: { id: command.data.meetingId } });
  return serviceOk({ success: true });
}

export async function upsertMeetingParticipant(input: { userId: number; meetingId: number; body: Record<string, unknown> }) {
  if (!(await canEditMeeting(input.userId, input.meetingId))) return serviceError("无权限", 403);
  const command = validateMeetingParticipant(input.body);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status);
  const user = await prisma.user.findUnique({ where: { id: command.data.userId }, select: { id: true } });
  if (!user) return serviceError("参会用户不存在", 404);
  await prisma.meetingParticipant.upsert({
    where: { meetingId_userId: { meetingId: input.meetingId, userId: command.data.userId } },
    create: {
      meetingId: input.meetingId,
      userId: command.data.userId,
      role: command.data.role,
      canVote: command.data.canVote,
      attendanceStatus: command.data.attendanceStatus,
    },
    update: {
      role: command.data.role,
      canVote: command.data.canVote,
      attendanceStatus: command.data.attendanceStatus,
    },
  });
  return getMeetingDetail({ userId: input.userId, meetingId: input.meetingId });
}

export async function createMeetingAgendaItem(input: { userId: number; meetingId: number; body: Record<string, unknown> }) {
  if (!(await canEditMeeting(input.userId, input.meetingId))) return serviceError("无权限", 403);
  const command = validateMeetingAgenda(input.body);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status);
  await prisma.meetingAgendaItem.create({
    data: { meetingId: input.meetingId, ...command.data, createdBy: input.userId },
  });
  return getMeetingDetail({ userId: input.userId, meetingId: input.meetingId });
}

export async function createMeetingMinuteEntry(input: { userId: number; meetingId: number; body: Record<string, unknown> }) {
  if (!(await canEditMeeting(input.userId, input.meetingId))) return serviceError("无权限", 403);
  const command = validateMeetingMinute(input.body);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status);
  const agendaError = await ensureAgendaBelongsToMeeting(input.meetingId, command.data.agendaItemId);
  if (agendaError) return serviceError(agendaError, 400);
  await prisma.meetingMinuteEntry.create({
    data: { meetingId: input.meetingId, ...command.data, createdBy: input.userId },
  });
  return getMeetingDetail({ userId: input.userId, meetingId: input.meetingId });
}

export async function createMeetingProposal(input: { userId: number; meetingId: number; body: Record<string, unknown> }) {
  if (!(await canEditMeeting(input.userId, input.meetingId))) return serviceError("无权限", 403);
  const command = validateMeetingProposal(input.body);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status);
  const agendaError = await ensureAgendaBelongsToMeeting(input.meetingId, command.data.agendaItemId);
  if (agendaError) return serviceError(agendaError, 400);
  await prisma.meetingProposal.create({
    data: { meetingId: input.meetingId, ...command.data, createdBy: input.userId },
  });
  return getMeetingDetail({ userId: input.userId, meetingId: input.meetingId });
}

export async function castMeetingVote(input: { userId: number; meetingId: number; body: Record<string, unknown> }) {
  const command = validateMeetingVote(input.body);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status);
  const proposal = await prisma.meetingProposal.findUnique({
    where: { id: command.data.proposalId },
    select: { id: true, meetingId: true, status: true },
  });
  if (!proposal || proposal.meetingId !== input.meetingId) return serviceError("表决事项不存在", 404);
  if (proposal.status !== "open") return serviceError("表决已关闭", 400);
  const permissions = await getMeetingPermissionsById(input.userId, input.meetingId);
  if (!permissions?.canVote) return serviceError("无投票权限", 403);
  await prisma.meetingVote.upsert({
    where: { proposalId_voterUserId: { proposalId: command.data.proposalId, voterUserId: input.userId } },
    create: {
      proposalId: command.data.proposalId,
      voterUserId: input.userId,
      choice: command.data.choice,
      note: command.data.note,
    },
    update: { choice: command.data.choice, note: command.data.note },
  });
  return getMeetingDetail({ userId: input.userId, meetingId: input.meetingId });
}

export async function closeMeetingProposal(input: { userId: number; meetingId: number; proposalId: number }) {
  const command = validateMeetingProposalClose({ proposalId: input.proposalId });
  if (!command.ok) return serviceError(command.issue.message, command.issue.status);
  if (!(await canEditMeeting(input.userId, input.meetingId))) return serviceError("无权限", 403);
  const proposal = await prisma.meetingProposal.findUnique({
    where: { id: command.data.proposalId },
    include: { votes: true },
  });
  if (!proposal || proposal.meetingId !== input.meetingId) return serviceError("表决事项不存在", 404);
  if (proposal.status !== "open") return serviceError("表决已关闭", 400);
  const tally = tallyVotes(proposal.votes);
  const meetsMinimum = proposal.minVotesRequired ? tally.total >= proposal.minVotesRequired : true;
  const status = meetsMinimum && tally.yes > tally.no ? "passed" : "rejected";
  await prisma.meetingProposal.update({
    where: { id: proposal.id },
    data: { status, closedBy: input.userId, closedAt: new Date() },
  });
  return getMeetingDetail({ userId: input.userId, meetingId: input.meetingId });
}

export async function createMeetingDecision(input: { userId: number; meetingId: number; body: Record<string, unknown> }) {
  if (!(await canEditMeeting(input.userId, input.meetingId))) return serviceError("无权限", 403);
  const command = validateMeetingDecision(input.body);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status);
  const agendaError = await ensureAgendaBelongsToMeeting(input.meetingId, command.data.agendaItemId);
  if (agendaError) return serviceError(agendaError, 400);
  const proposalError = await ensureDecisionProposal(input.meetingId, command.data.proposalId);
  if (proposalError) return serviceError(proposalError, 400);
  await prisma.meetingDecision.create({
    data: { meetingId: input.meetingId, ...command.data, createdBy: input.userId },
  });
  return getMeetingDetail({ userId: input.userId, meetingId: input.meetingId });
}

export async function createMeetingActionCandidate(input: { userId: number; meetingId: number; body: Record<string, unknown> }) {
  if (!(await canEditMeeting(input.userId, input.meetingId))) return serviceError("无权限", 403);
  const command = validateMeetingActionCandidate(input.body);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status);
  const agendaError = await ensureAgendaBelongsToMeeting(input.meetingId, command.data.agendaItemId);
  if (agendaError) return serviceError(agendaError, 400);
  const decisionError = await ensureDecisionBelongsToMeeting(input.meetingId, command.data.decisionId);
  if (decisionError) return serviceError(decisionError, 400);
  await prisma.meetingActionCandidate.create({
    data: { meetingId: input.meetingId, ...command.data, createdBy: input.userId },
  });
  return getMeetingDetail({ userId: input.userId, meetingId: input.meetingId });
}

export async function linkMeetingActionCandidate(input: {
  userId: number;
  meetingId: number;
  candidateId: number;
  body: Record<string, unknown>;
}) {
  const command = validateMeetingActionCandidateLink({ candidateId: input.candidateId, action: input.body.action });
  if (!command.ok) return serviceError(command.issue.message, command.issue.status);
  const candidate = await prisma.meetingActionCandidate.findUnique({ where: { id: command.data.candidateId } });
  if (!candidate || candidate.meetingId !== input.meetingId) return serviceError("行动候选不存在", 404);
  if (!(await canEditMeeting(input.userId, input.meetingId))) return serviceError("无权限", 403);
  const action = command.data.action;
  if (action === "ignore") {
    await prisma.meetingActionCandidate.update({ where: { id: candidate.id }, data: { status: "ignored" } });
    return getMeetingDetail({ userId: input.userId, meetingId: input.meetingId });
  }
  if (action === "linkWorkPlan") return linkCandidateToWorkPlan(input, candidate);
  if (action === "createWorkPlan" || action === "createWorkItem") return createWorkPlanFromCandidate(input, candidate);
  if (action === "linkWorkItem") return serviceError("会议行动候选请链接 OKR 计划，不再直接链接子任务", 400);
  if (action === "linkProjectTask") return linkCandidateToProjectTask(input, candidate);
  if (action === "createProjectTask") return createProjectTaskFromCandidate(input, candidate);
  return serviceError("行动候选动作无效", 400);
}

async function linkCandidateToWorkPlan(
  input: { userId: number; meetingId: number; candidateId: number; body: Record<string, unknown> },
  candidate: { id: number; meetingId: number; decisionId: number | null },
) {
  const workPlanId = Number(input.body.workPlanId);
  if (!Number.isInteger(workPlanId) || workPlanId <= 0) return serviceError("OKR 计划无效", 400);
  const metadata = await getWorkPlanAccessMetadata(workPlanId);
  if (!metadata?.targetId) return serviceError("OKR 计划不存在", 404);
  if (!(await canEditWorkTask(input.userId, metadata.targetType, metadata.targetId))) return serviceError("无权限编辑工作计划", 403);
  const result = await updateWorkPlan(workPlanId, {
    sourceType: "meeting",
    sourceMeetingId: input.meetingId,
    sourceMeetingDecisionId: candidate.decisionId,
    sourceMeetingActionCandidateId: candidate.id,
  });
  if (!result.ok) return serviceError(result.error, result.status || 400);
  await prisma.meetingActionCandidate.update({
    where: { id: candidate.id },
    data: { status: "linked", targetKind: "work_plan", linkedWorkPlanId: workPlanId },
  });
  return getMeetingDetail({ userId: input.userId, meetingId: input.meetingId });
}

async function createWorkPlanFromCandidate(
  input: { userId: number; meetingId: number; candidateId: number; body: Record<string, unknown> },
  candidate: { id: number; meetingId: number; decisionId: number | null; title: string; description: string },
) {
  const targetType = String(input.body.targetType || "personal");
  const targetId = Number(input.body.targetId || input.userId);
  if (!Number.isInteger(targetId) || targetId <= 0) return serviceError("工作计划目标无效", 400);
  if (!(await canEditWorkTask(input.userId, targetType, targetId))) return serviceError("无权限编辑工作计划", 403);
  const result = await createWorkPlan({
    targetType,
    targetId,
    kind: "okr",
    title: String(input.body.title || input.body.content || candidate.title),
    description: String(input.body.description || candidate.description || ""),
    ownerEmployeeId: input.body.ownerEmployeeId ? Number(input.body.ownerEmployeeId) : null,
    sourceType: "meeting",
    sourceMeetingId: input.meetingId,
    sourceMeetingDecisionId: candidate.decisionId,
    sourceMeetingActionCandidateId: candidate.id,
  });
  if (!result.ok) return serviceError(result.error, result.status || 400);
  const workPlan = result.data as { id?: number };
  await prisma.meetingActionCandidate.update({
    where: { id: candidate.id },
    data: { status: "linked", targetKind: "work_plan", linkedWorkPlanId: workPlan.id ?? null },
  });
  return getMeetingDetail({ userId: input.userId, meetingId: input.meetingId });
}

async function linkCandidateToProjectTask(
  input: { userId: number; meetingId: number; candidateId: number; body: Record<string, unknown> },
  candidate: { id: number; meetingId: number; decisionId: number | null },
) {
  const projectTaskId = Number(input.body.projectTaskId);
  if (!Number.isInteger(projectTaskId) || projectTaskId <= 0) return serviceError("项目任务无效", 400);
  const task = await prisma.projectTask.findUnique({ where: { id: projectTaskId }, select: { id: true, projectId: true } });
  if (!task) return serviceError("项目任务不存在", 404);
  const result = await updateProjectTask({
    userId: input.userId,
    projectId: task.projectId,
    taskId: task.id,
    body: { sourceMeetingDecisionId: candidate.decisionId, sourceMeetingActionCandidateId: candidate.id },
  });
  if (!result.ok) return serviceError(result.error, result.status || 400);
  await prisma.meetingActionCandidate.update({
    where: { id: candidate.id },
    data: { status: "linked", targetKind: "project_task", linkedProjectTaskId: task.id },
  });
  return getMeetingDetail({ userId: input.userId, meetingId: input.meetingId });
}

async function createProjectTaskFromCandidate(
  input: { userId: number; meetingId: number; candidateId: number; body: Record<string, unknown> },
  candidate: { id: number; meetingId: number; decisionId: number | null; title: string; description: string },
) {
  const projectId = Number(input.body.projectId);
  if (!Number.isInteger(projectId) || projectId <= 0) return serviceError("项目无效", 400);
  if (!(await canViewProject(input.userId, projectId))) return serviceError("无权限访问项目", 403);
  const result = await createProjectTask({
    userId: input.userId,
    projectId,
    body: {
      name: String(input.body.name || candidate.title),
      description: String(input.body.description || candidate.description || ""),
      ownerEmployeeId: input.body.ownerEmployeeId,
      planPhaseId: input.body.planPhaseId,
      sourceMeetingDecisionId: candidate.decisionId,
      sourceMeetingActionCandidateId: candidate.id,
    },
  });
  if (!result.ok) return serviceError(result.error, result.status || 400);
  const task = result.data.task as { id?: number };
  await prisma.meetingActionCandidate.update({
    where: { id: candidate.id },
    data: { status: "linked", targetKind: "project_task", linkedProjectTaskId: task.id ?? null },
  });
  return getMeetingDetail({ userId: input.userId, meetingId: input.meetingId });
}

async function ensureAgendaBelongsToMeeting(meetingId: number, agendaItemId: number | null) {
  if (!agendaItemId) return null;
  const item = await prisma.meetingAgendaItem.findUnique({ where: { id: agendaItemId }, select: { meetingId: true } });
  if (!item || item.meetingId !== meetingId) return "议题不属于当前会议";
  return null;
}

async function ensureDecisionProposal(meetingId: number, proposalId: number | null) {
  if (!proposalId) return null;
  const proposal = await prisma.meetingProposal.findUnique({ where: { id: proposalId }, select: { meetingId: true, status: true } });
  if (!proposal || proposal.meetingId !== meetingId) return "表决事项不属于当前会议";
  if (proposal.status !== "passed") return "只有已通过的表决才能生成决议";
  return null;
}

async function ensureDecisionBelongsToMeeting(meetingId: number, decisionId: number | null) {
  if (!decisionId) return null;
  const decision = await prisma.meetingDecision.findUnique({ where: { id: decisionId }, select: { meetingId: true } });
  if (!decision || decision.meetingId !== meetingId) return "决议不属于当前会议";
  return null;
}

async function ensureDefaultMeetingTypes() {
  for (const type of DEFAULT_MEETING_TYPES) {
    await prisma.meetingType.upsert({
      where: { key: type.key },
      update: { ...type, defaultVisibility: "participants_only" },
      create: { ...type, defaultVisibility: "participants_only" },
    });
  }
  await prisma.meetingType.deleteMany({
    where: {
      key: { notIn: DEFAULT_MEETING_TYPE_KEYS },
      meetings: { none: {} },
      series: { none: {} },
    },
  });
}

export const meetingServiceResponse: <T>(result: DomainServiceResult<T>) => Response = serviceResponse;
