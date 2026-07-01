export type MeetingType = {
  id: number;
  key: string;
  name: string;
  description: string | null;
  defaultVisibility: string;
};

export type MeetingSummary = {
  id: number;
  typeId: number;
  typeName: string;
  title: string;
  description: string;
  startAt: string | null;
  endAt: string | null;
  location: string;
  visibility: string;
  status: string;
  ownerUserId: number | null;
  ownerName: string | null;
  secretaryUserId: number | null;
  secretaryName: string | null;
  participantCount: number;
  counts: {
    agendaItems: number;
    minuteEntries: number;
    proposals: number;
    decisions: number;
    actionCandidates: number;
  };
  participants: MeetingParticipant[];
};

export type MeetingParticipant = {
  id: number;
  userId: number;
  userName: string | null;
  role: string;
  canVote: boolean;
  attendanceStatus: string;
};

export type MeetingPermission = {
  canView: boolean;
  canEdit: boolean;
  canManage: boolean;
  canDelete: boolean;
  canVote: boolean;
  canApprove: boolean;
  canViewAll: boolean;
  participantRole: string | null;
};

export type MeetingDetail = MeetingSummary & {
  permissions: MeetingPermission;
  seriesId: number | null;
  seriesTitle: string | null;
  agendaItems: Array<{
    id: number;
    title: string;
    description: string;
    presenterUserId: number | null;
    sortOrder: number;
    status: string;
  }>;
  minuteEntries: Array<{
    id: number;
    agendaItemId: number | null;
    content: string;
    kind: string;
    createdAt: string;
  }>;
  proposals: Array<{
    id: number;
    agendaItemId: number | null;
    title: string;
    content: string;
    status: string;
    voteVisibility: string;
    minVotesRequired: number | null;
    closedAt: string | null;
    tally: {
      yes: number;
      no: number;
      abstain: number;
      total: number;
    };
    myVote: {
      choice: string;
      note: string;
    } | null;
    votes: Array<{
      id: number;
      voterUserId: number;
      voterName: string | null;
      choice: string;
      note: string;
      updatedAt: string;
    }>;
    decisions: Array<{
      id: number;
      title: string;
      kind: string;
    }>;
  }>;
  decisions: Array<{
    id: number;
    agendaItemId: number | null;
    proposalId: number | null;
    kind: string;
    title: string;
    content: string;
    status: string;
    effectiveDate: string | null;
    decidedAt: string;
  }>;
  actionCandidates: Array<{
    id: number;
    agendaItemId: number | null;
    decisionId: number | null;
    title: string;
    description: string;
    targetKind: string;
    status: string;
    linkedWorkItemId: number | null;
    linkedWorkItemTitle: string | null;
    linkedWorkPlanId: number | null;
    linkedWorkPlanTitle: string | null;
    linkedProjectTaskId: number | null;
    linkedProjectTaskTitle: string | null;
    linkedProjectId: number | null;
    linkedProjectName: string | null;
  }>;
};

export type CreateMeetingDraft = {
  typeId: string;
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  location: string;
  visibility: "participants_only" | "public";
  participantUserIds: string;
};

export type ActionDraft = {
  workPlanId: string;
  workItemId: string;
  projectTaskId: string;
  projectId: string;
  targetType: string;
  targetId: string;
};

export const ROLE_OPTIONS = [{
  value: "participant",
  label: "参会",
}, {
  value: "voter",
  label: "投票",
}, {
  value: "secretary",
  label: "记录",
}, {
  value: "owner",
  label: "主持",
}, {
  value: "observer",
  label: "旁听",
}];

export const DECISION_KIND_OPTIONS = [{
  value: "decision",
  label: "决定",
}, {
  value: "resolution",
  label: "决议",
}, {
  value: "guidance",
  label: "指导",
}];
