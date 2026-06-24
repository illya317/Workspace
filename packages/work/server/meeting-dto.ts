import { Prisma } from "@workspace/platform/server/prisma";
import type { MeetingPermissionResult } from "./meeting-access";

const userSelect = {
  id: true,
  nickname: true,
  username: true,
  employeeId: true,
  employees: { select: { name: true, employeeId: true }, take: 1 },
} satisfies Prisma.UserSelect;

export const meetingSummaryInclude = {
  type: true,
  owner: { select: userSelect },
  secretary: { select: userSelect },
  participants: { include: { user: { select: userSelect } }, orderBy: { id: "asc" } },
  _count: {
    select: {
      agendaItems: true,
      minuteEntries: true,
      proposals: true,
      decisions: true,
      actionCandidates: true,
    },
  },
} satisfies Prisma.MeetingInclude;

export const meetingDetailInclude = {
  type: true,
  series: true,
  owner: { select: userSelect },
  secretary: { select: userSelect },
  participants: { include: { user: { select: userSelect } }, orderBy: { id: "asc" } },
  agendaItems: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
  minuteEntries: { orderBy: { id: "asc" } },
  proposals: {
    orderBy: { id: "asc" },
    include: {
      votes: { include: { voter: { select: userSelect } }, orderBy: { id: "asc" } },
      decisions: { select: { id: true, title: true, kind: true } },
    },
  },
  decisions: { orderBy: { id: "asc" } },
  actionCandidates: {
    orderBy: { id: "asc" },
    include: {
      linkedWorkItem: { select: { id: true, content: true, status: true } },
      linkedProjectTask: { select: { id: true, name: true, projectId: true, project: { select: { id: true, name: true, code: true } } } },
    },
  },
  _count: meetingSummaryInclude._count,
} satisfies Prisma.MeetingInclude;

type MeetingSummaryRow = Prisma.MeetingGetPayload<{ include: typeof meetingSummaryInclude }>;
type MeetingDetailRow = Prisma.MeetingGetPayload<{ include: typeof meetingDetailInclude }>;

export function toMeetingSummaryDto(row: MeetingSummaryRow) {
  return {
    id: row.id,
    typeId: row.typeId,
    typeName: row.type.name,
    title: row.title,
    description: row.description,
    startAt: formatDateTime(row.startAt),
    endAt: formatDateTime(row.endAt),
    location: row.location,
    visibility: row.visibility,
    status: row.status,
    ownerUserId: row.ownerUserId,
    ownerName: userName(row.owner),
    secretaryUserId: row.secretaryUserId,
    secretaryName: userName(row.secretary),
    participantCount: row.participants.length,
    counts: row._count,
    participants: row.participants.map(toParticipantDto),
  };
}

export function toMeetingDetailDto(row: MeetingDetailRow, userId: number, permissions: MeetingPermissionResult) {
  return {
    ...toMeetingSummaryDto(row),
    permissions,
    seriesId: row.seriesId,
    seriesTitle: row.series?.title ?? null,
    agendaItems: row.agendaItems.map((item) => ({
      id: item.id,
      meetingId: item.meetingId,
      title: item.title,
      description: item.description,
      presenterUserId: item.presenterUserId,
      sortOrder: item.sortOrder,
      status: item.status,
    })),
    minuteEntries: row.minuteEntries.map((item) => ({
      id: item.id,
      meetingId: item.meetingId,
      agendaItemId: item.agendaItemId,
      content: item.content,
      kind: item.kind,
      createdAt: item.createdAt.toISOString(),
    })),
    proposals: row.proposals.map((proposal) => {
      const summary = tallyVotes(proposal.votes);
      const myVote = proposal.votes.find((vote) => vote.voterUserId === userId) ?? null;
      const hideVotes = proposal.voteVisibility === "anonymous" && !permissions.canManage;
      return {
        id: proposal.id,
        meetingId: proposal.meetingId,
        agendaItemId: proposal.agendaItemId,
        title: proposal.title,
        content: proposal.content,
        status: proposal.status,
        voteVisibility: proposal.voteVisibility,
        minVotesRequired: proposal.minVotesRequired,
        closedAt: proposal.closedAt?.toISOString() ?? null,
        tally: summary,
        myVote: myVote ? { choice: myVote.choice, note: myVote.note } : null,
        votes: hideVotes ? [] : proposal.votes.map((vote) => ({
          id: vote.id,
          voterUserId: vote.voterUserId,
          voterName: userName(vote.voter),
          choice: vote.choice,
          note: vote.note,
          updatedAt: vote.updatedAt.toISOString(),
        })),
        decisions: proposal.decisions,
      };
    }),
    decisions: row.decisions.map((decision) => ({
      id: decision.id,
      meetingId: decision.meetingId,
      agendaItemId: decision.agendaItemId,
      proposalId: decision.proposalId,
      kind: decision.kind,
      title: decision.title,
      content: decision.content,
      status: decision.status,
      effectiveDate: formatDate(decision.effectiveDate),
      decidedAt: decision.decidedAt.toISOString(),
    })),
    actionCandidates: row.actionCandidates.map((candidate) => ({
      id: candidate.id,
      meetingId: candidate.meetingId,
      agendaItemId: candidate.agendaItemId,
      decisionId: candidate.decisionId,
      title: candidate.title,
      description: candidate.description,
      targetKind: candidate.targetKind,
      status: candidate.status,
      linkedWorkItemId: candidate.linkedWorkItemId,
      linkedWorkItemTitle: candidate.linkedWorkItem?.content ?? null,
      linkedProjectTaskId: candidate.linkedProjectTaskId,
      linkedProjectTaskTitle: candidate.linkedProjectTask?.name ?? null,
      linkedProjectId: candidate.linkedProjectTask?.projectId ?? null,
      linkedProjectName: candidate.linkedProjectTask?.project.name ?? null,
    })),
  };
}

export function tallyVotes(votes: Array<{ choice: string }>) {
  const tally = { yes: 0, no: 0, abstain: 0, total: 0 };
  for (const vote of votes) {
    if (vote.choice === "yes") tally.yes += 1;
    else if (vote.choice === "no") tally.no += 1;
    else tally.abstain += 1;
    tally.total += 1;
  }
  return tally;
}

function toParticipantDto(row: MeetingSummaryRow["participants"][number]) {
  return {
    id: row.id,
    userId: row.userId,
    userName: userName(row.user),
    role: row.role,
    canVote: row.canVote,
    attendanceStatus: row.attendanceStatus,
  };
}

function userName(user: { nickname: string; username: string | null; employeeId: string | null; employees?: Array<{ name: string; employeeId: string }> } | null) {
  if (!user) return null;
  return user.employees?.[0]?.name || user.nickname || user.username || user.employeeId || null;
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return null;
  return new Date(value).toISOString().slice(0, 10);
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return null;
  return new Date(value).toISOString();
}
