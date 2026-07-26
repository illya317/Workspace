import "server-only";

import {
  defineWorkspaceAnalysisReadModel,
  type WorkspaceAnalysisReadModelField,
  type WorkspaceAnalysisReadModelFieldClassification,
  type WorkspaceAnalysisReadModelFields,
} from "@workspace/platform/server/workspace-analysis-read-model";

import type { toMeetingDetailDto } from "./meeting-dto";

export type WorkMeetingDetail = ReturnType<typeof toMeetingDetailDto>;

type MeetingContext = {
  readonly meetingId: number;
  readonly meetingTitle: string;
  readonly meetingStartAt: string | null;
};
type MeetingDetailParticipantRow = WorkMeetingDetail["participants"][number] & MeetingContext;
type MeetingAgendaItemRow = WorkMeetingDetail["agendaItems"][number] & MeetingContext;
type MeetingMinuteEntryRow = WorkMeetingDetail["minuteEntries"][number] & MeetingContext;
type MeetingProposal = WorkMeetingDetail["proposals"][number];
type MeetingProposalRow = MeetingProposal & MeetingContext & {
  readonly tallyYes: number;
  readonly tallyNo: number;
  readonly tallyAbstain: number;
  readonly tallyTotal: number;
  readonly myVoteChoice: string | null;
  readonly myVoteNote: string | null;
};
type MeetingProposalVoteRow = MeetingProposal["votes"][number] & MeetingContext & {
  readonly proposalId: number;
  readonly proposalTitle: string;
  readonly proposalVoteVisibility: string;
};
type MeetingDecisionRow = WorkMeetingDetail["decisions"][number] & MeetingContext;
type MeetingActionCandidateRow = WorkMeetingDetail["actionCandidates"][number] & MeetingContext;

const field = (
  valueKind: WorkspaceAnalysisReadModelField["valueKind"],
  label: string,
  description: string,
  options: Partial<Pick<WorkspaceAnalysisReadModelField, "sensitivity" | "exportPolicy" | "capabilities">> = {},
): WorkspaceAnalysisReadModelField => ({
  classification: "field",
  valueKind,
  label,
  description,
  sensitivity: options.sensitivity ?? "internal",
  exportPolicy: options.exportPolicy ?? "allowed",
  ...(options.capabilities ? { capabilities: options.capabilities } : {}),
});
const id = (label: string, description: string) => field("integer", label, description, {
  capabilities: { groupable: true, aggregateOperations: ["count", "distinctCount"] },
});
const confidential = (kind: WorkspaceAnalysisReadModelField["valueKind"], label: string, description: string) => (
  field(kind, label, description, { sensitivity: "confidential" })
);
const narrative = (label: string, description: string) => (
  field("text", label, description, { sensitivity: "confidential", capabilities: { groupable: false } })
);
const omit = (
  reason: Extract<WorkspaceAnalysisReadModelFieldClassification, { classification: "omit" }>["reason"],
  description: string,
) => ({ classification: "omit", reason, description } as const);
const child = (sourceKey: string, description: string) => (
  { classification: "childSource", sourceKey, description } as const
);

const VIEWER_SCOPES = {
  personal: { mode: "viewer", description: "读取当前查看人原会议页可见的指定会议，不归属到个人空间。", query: { requesterId: "requesterId" } },
  department: { mode: "viewer", description: "读取当前查看人原会议页可见的指定会议，不伪造为目标部门会议。", query: { requesterId: "requesterId" } },
  project: { mode: "viewer", description: "读取当前查看人原会议页可见的指定会议，不伪造为目标项目会议。", query: { requesterId: "requesterId" } },
} as const;
const MEETING_ID_PARAMETER = {
  key: "meetingId",
  queryKey: "meetingId",
  label: "会议",
  description: "必选会议稳定标识；执行时由原会议详情服务复核当前查看人的对象可见性。",
  kind: "integer",
  required: true,
} as const;
const DETAIL_API_PATH = "/api/modules/work/meetings/[id]";
const CHILD_PAGINATION = { pageParam: "page", pageSizeParam: "pageSize", pageSize: 250, maxPages: 2 } as const;
const CHILD_LIMITS = {
  maxRows: 500,
  maxGroups: 500,
  maxPageSize: 250,
  maxPages: 2,
  maxBytes: 8 * 1024 * 1024,
  timeoutMs: 10_000,
} as const;

export const WORK_MEETING_DETAIL_FIELD_CLASSIFICATIONS = {
  id: id("会议 ID", "会议稳定标识。"),
  typeId: id("会议类型 ID", "会议类型标识。"),
  typeName: field("text", "会议类型", "会议类型名称。"),
  title: confidential("text", "会议标题", "会议标题。"),
  description: narrative("会议说明", "会议说明。"),
  startAt: field("date", "开始时间", "会议开始时间。"),
  endAt: field("date", "结束时间", "会议结束时间。"),
  location: confidential("text", "地点", "会议地点。"),
  visibility: field("text", "可见范围", "会议可见范围。"),
  status: field("text", "状态", "会议状态。"),
  ownerUserId: id("负责人用户 ID", "会议负责人用户标识。"),
  ownerName: confidential("text", "负责人", "会议负责人姓名。"),
  secretaryUserId: id("记录人用户 ID", "会议记录人用户标识。"),
  secretaryName: confidential("text", "记录人", "会议记录人姓名。"),
  participantCount: field("integer", "参会人数", "会议参会人数量。"),
  counts: omit("derivedDuplicate", "议程、纪要、提案、决议和行动数量可从对应明细来源聚合。"),
  participants: child("work.meeting-detail-participants", "参会关系按同一必选会议参数拆为详情参会人来源。"),
  permissions: omit("controlPlane", "当前查看人的会议操作权限矩阵不是经营事实。"),
  seriesId: id("会议系列 ID", "会议所属系列标识。"),
  seriesTitle: confidential("text", "会议系列", "会议所属系列名称。"),
  agendaItems: child("work.meeting-agenda-items", "议程拆为一会议一议题事实。"),
  minuteEntries: child("work.meeting-minute-entries", "会议纪要拆为一会议一纪要事实。"),
  proposals: child("work.meeting-proposals", "会议提案拆为一会议一提案事实。"),
  decisions: child("work.meeting-decisions", "会议决议拆为一会议一决议事实。"),
  actionCandidates: child("work.meeting-action-candidates", "会议行动候选拆为一会议一行动事实。"),
} satisfies WorkspaceAnalysisReadModelFields<WorkMeetingDetail>;

const meetingContextFields = {
  meetingId: id("会议 ID", "明细所属会议标识。"),
  meetingTitle: confidential("text", "会议", "明细所属会议标题。"),
  meetingStartAt: field("date", "会议开始时间", "明细所属会议开始时间。"),
} as const;

const meetingDetailParticipantFields = {
  ...meetingContextFields,
  id: id("参会关系 ID", "会议参会关系标识。"),
  userId: id("参会用户 ID", "参会用户标识。"),
  userName: confidential("text", "参会人", "参会人姓名。"),
  role: field("text", "参会角色", "owner、secretary 或 participant。"),
  canVote: field("boolean", "可投票", "参会人是否具备投票资格。"),
  attendanceStatus: field("text", "出席状态", "参会人的出席状态。"),
} satisfies WorkspaceAnalysisReadModelFields<MeetingDetailParticipantRow>;

const meetingAgendaItemFields = {
  ...meetingContextFields,
  id: id("议程 ID", "会议议程稳定标识。"),
  title: confidential("text", "议题", "会议议题标题。"),
  description: narrative("议题说明", "会议议题说明。"),
  presenterUserId: id("汇报人用户 ID", "议题汇报人用户标识。"),
  sortOrder: field("integer", "排序", "议题在会议中的排序值。"),
  status: field("text", "状态", "议题当前状态。"),
} satisfies WorkspaceAnalysisReadModelFields<MeetingAgendaItemRow>;

const meetingMinuteEntryFields = {
  ...meetingContextFields,
  id: id("纪要 ID", "会议纪要稳定标识。"),
  agendaItemId: id("议程 ID", "纪要关联议程标识。"),
  content: narrative("纪要内容", "会议纪要正文。"),
  kind: field("text", "纪要类型", "会议纪要类型。"),
  createdAt: field("date", "记录时间", "会议纪要创建时间。"),
} satisfies WorkspaceAnalysisReadModelFields<MeetingMinuteEntryRow>;

export const WORK_MEETING_PROPOSAL_FIELD_CLASSIFICATIONS = {
  ...meetingContextFields,
  id: id("提案 ID", "会议提案稳定标识。"),
  agendaItemId: id("议程 ID", "提案关联议程标识。"),
  title: confidential("text", "提案", "会议提案标题。"),
  content: narrative("提案内容", "会议提案正文。"),
  status: field("text", "状态", "提案当前状态。"),
  voteVisibility: field("text", "投票可见性", "named 或 anonymous。"),
  minVotesRequired: field("integer", "最低票数", "提案关闭所需最低票数。"),
  closedAt: field("date", "关闭时间", "提案关闭时间。"),
  tally: omit("nonScalar", "投票汇总对象已规范化为赞成、反对、弃权和总票数四个标量。"),
  myVote: omit("nonScalar", "当前查看人的投票对象已规范化为投票选择和备注两个标量。"),
  votes: child("work.meeting-proposal-votes", "可见投票拆为一提案一投票事实；匿名票继续沿用原详情隐藏规则。"),
  decisions: omit("derivedDuplicate", "提案内决议摘要与会议完整决议重复，统一使用会议决议来源。"),
  tallyYes: field("integer", "赞成票", "原详情公开的赞成票数。"),
  tallyNo: field("integer", "反对票", "原详情公开的反对票数。"),
  tallyAbstain: field("integer", "弃权票", "原详情公开的弃权票数。"),
  tallyTotal: field("integer", "总票数", "原详情公开的总投票数。"),
  myVoteChoice: confidential("text", "我的投票", "当前查看人在该提案上的投票选择。"),
  myVoteNote: narrative("我的投票备注", "当前查看人在该提案上的投票备注。"),
} satisfies WorkspaceAnalysisReadModelFields<MeetingProposalRow>;

const meetingProposalVoteFields = {
  ...meetingContextFields,
  proposalId: id("提案 ID", "投票所属提案标识。"),
  proposalTitle: confidential("text", "提案", "投票所属提案标题。"),
  proposalVoteVisibility: field("text", "投票可见性", "提案的 named 或 anonymous 可见规则。"),
  id: id("投票 ID", "会议投票稳定标识。"),
  voterUserId: id("投票人用户 ID", "投票人用户标识。"),
  voterName: confidential("text", "投票人", "原详情对当前查看人公开的投票人姓名。"),
  choice: confidential("text", "投票选择", "yes、no 或 abstain。"),
  note: narrative("投票备注", "原详情对当前查看人公开的投票备注。"),
  updatedAt: field("date", "投票时间", "投票最后更新时间。"),
} satisfies WorkspaceAnalysisReadModelFields<MeetingProposalVoteRow>;

const meetingDecisionFields = {
  ...meetingContextFields,
  id: id("决议 ID", "会议决议稳定标识。"),
  agendaItemId: id("议程 ID", "决议关联议程标识。"),
  proposalId: id("提案 ID", "决议关联提案标识。"),
  kind: field("text", "决议类型", "会议决议类型。"),
  title: confidential("text", "决议", "会议决议标题。"),
  content: narrative("决议内容", "会议决议正文。"),
  status: field("text", "状态", "会议决议当前状态。"),
  effectiveDate: field("date", "生效日期", "会议决议生效日期。"),
  decidedAt: field("date", "决定时间", "会议形成决议的时间。"),
} satisfies WorkspaceAnalysisReadModelFields<MeetingDecisionRow>;

const meetingActionCandidateFields = {
  ...meetingContextFields,
  id: id("行动候选 ID", "会议行动候选稳定标识。"),
  agendaItemId: id("议程 ID", "行动候选关联议程标识。"),
  decisionId: id("决议 ID", "行动候选关联决议标识。"),
  title: confidential("text", "行动候选", "会议行动候选标题。"),
  description: narrative("行动说明", "会议行动候选说明。"),
  targetKind: field("text", "落地类型", "行动候选目标工作对象类型。"),
  status: field("text", "状态", "会议行动候选当前状态。"),
  linkedWorkItemId: id("工作节点 ID", "行动候选已关联工作节点标识。"),
  linkedWorkItemTitle: confidential("text", "工作节点", "行动候选已关联工作节点标题。"),
  linkedWorkPlanId: id("工作计划 ID", "行动候选已关联工作计划标识。"),
  linkedWorkPlanTitle: confidential("text", "工作计划", "行动候选已关联工作计划标题。"),
} satisfies WorkspaceAnalysisReadModelFields<MeetingActionCandidateRow>;

const source = <TRow extends object>(input: {
  sourceKey: string;
  label: string;
  description: string;
  rowsPath: string;
  fields: WorkspaceAnalysisReadModelFields<TRow>;
  maxRows?: number;
}) => defineWorkspaceAnalysisReadModel<TRow>()({
  sourceKey: input.sourceKey,
  version: 1,
  label: input.label,
  description: input.description,
  apiPath: DETAIL_API_PATH,
  rowsPath: input.rowsPath,
  totalPath: "total",
  scopes: VIEWER_SCOPES,
  parameters: [MEETING_ID_PARAMETER],
  fields: input.fields,
  pagination: input.maxRows === 1
    ? { pageParam: "page", pageSizeParam: "pageSize", pageSize: 1, maxPages: 1 }
    : CHILD_PAGINATION,
  limits: input.maxRows === 1
    ? { ...CHILD_LIMITS, maxRows: 1, maxPageSize: 1, maxPages: 1 }
    : CHILD_LIMITS,
});

export const WORK_MEETING_DETAILS_ANALYSIS_SOURCE = source<WorkMeetingDetail>({
  sourceKey: "work.meeting-details",
  label: "会议详情",
  description: "参数绑定的单会议完整事实；由原详情对象权限复核可见性，公开系列等稳定详情并将一对多事实拆为子来源。",
  rowsPath: "meeting",
  fields: WORK_MEETING_DETAIL_FIELD_CLASSIFICATIONS,
  maxRows: 1,
});
export const WORK_MEETING_DETAIL_PARTICIPANTS_ANALYSIS_SOURCE = source<MeetingDetailParticipantRow>({
  sourceKey: "work.meeting-detail-participants",
  label: "会议详情参会人",
  description: "以当前查看人可见指定会议中的一条参会关系为粒度，不受会议列表 200 条发现窗口限制。",
  rowsPath: "meeting.participants",
  fields: meetingDetailParticipantFields,
});
export const WORK_MEETING_AGENDA_ITEMS_ANALYSIS_SOURCE = source<MeetingAgendaItemRow>({
  sourceKey: "work.meeting-agenda-items",
  label: "会议议程",
  description: "以当前查看人可见指定会议中的一条议程为粒度。",
  rowsPath: "meeting.agendaItems",
  fields: meetingAgendaItemFields,
});
export const WORK_MEETING_MINUTE_ENTRIES_ANALYSIS_SOURCE = source<MeetingMinuteEntryRow>({
  sourceKey: "work.meeting-minute-entries",
  label: "会议纪要",
  description: "以当前查看人可见指定会议中的一条纪要为粒度。",
  rowsPath: "meeting.minuteEntries",
  fields: meetingMinuteEntryFields,
});
export const WORK_MEETING_PROPOSALS_ANALYSIS_SOURCE = source<MeetingProposalRow>({
  sourceKey: "work.meeting-proposals",
  label: "会议提案",
  description: "以当前查看人可见指定会议中的一条提案为粒度，保留原详情投票汇总和本人投票。",
  rowsPath: "meeting.proposals",
  fields: WORK_MEETING_PROPOSAL_FIELD_CLASSIFICATIONS,
});
export const WORK_MEETING_PROPOSAL_VOTES_ANALYSIS_SOURCE = source<MeetingProposalVoteRow>({
  sourceKey: "work.meeting-proposal-votes",
  label: "会议提案投票",
  description: "以当前查看人可见指定会议提案中的一票为粒度；匿名提案继续沿用原详情的隐藏结果。",
  rowsPath: "meeting.proposals.votes",
  fields: meetingProposalVoteFields,
});
export const WORK_MEETING_DECISIONS_ANALYSIS_SOURCE = source<MeetingDecisionRow>({
  sourceKey: "work.meeting-decisions",
  label: "会议决议",
  description: "以当前查看人可见指定会议中的一条决议为粒度。",
  rowsPath: "meeting.decisions",
  fields: meetingDecisionFields,
});
export const WORK_MEETING_ACTION_CANDIDATES_ANALYSIS_SOURCE = source<MeetingActionCandidateRow>({
  sourceKey: "work.meeting-action-candidates",
  label: "会议行动候选",
  description: "以当前查看人可见指定会议中的一条行动候选为粒度，并保留已落地工作对象关系。",
  rowsPath: "meeting.actionCandidates",
  fields: meetingActionCandidateFields,
});

export const WORK_MEETING_DETAIL_ANALYSIS_SOURCE_REGISTRATIONS = [
  WORK_MEETING_DETAILS_ANALYSIS_SOURCE,
  WORK_MEETING_DETAIL_PARTICIPANTS_ANALYSIS_SOURCE,
  WORK_MEETING_AGENDA_ITEMS_ANALYSIS_SOURCE,
  WORK_MEETING_MINUTE_ENTRIES_ANALYSIS_SOURCE,
  WORK_MEETING_PROPOSALS_ANALYSIS_SOURCE,
  WORK_MEETING_PROPOSAL_VOTES_ANALYSIS_SOURCE,
  WORK_MEETING_DECISIONS_ANALYSIS_SOURCE,
  WORK_MEETING_ACTION_CANDIDATES_ANALYSIS_SOURCE,
] as const;

export function iterateWorkMeetingDetailParticipantRows(meeting: WorkMeetingDetail) {
  return meeting.participants.map((participant) => ({ ...meetingContext(meeting), ...participant }));
}

export function iterateWorkMeetingAgendaItemRows(meeting: WorkMeetingDetail) {
  return meeting.agendaItems.map((item) => ({ ...meetingContext(meeting), ...item }));
}

export function iterateWorkMeetingMinuteEntryRows(meeting: WorkMeetingDetail) {
  return meeting.minuteEntries.map((entry) => ({ ...meetingContext(meeting), ...entry }));
}

export function iterateWorkMeetingProposalRows(meeting: WorkMeetingDetail) {
  return meeting.proposals.map((proposal) => ({
    ...meetingContext(meeting),
    ...proposal,
    tallyYes: proposal.tally.yes,
    tallyNo: proposal.tally.no,
    tallyAbstain: proposal.tally.abstain,
    tallyTotal: proposal.tally.total,
    myVoteChoice: proposal.myVote?.choice ?? null,
    myVoteNote: proposal.myVote?.note ?? null,
  }));
}

export function iterateWorkMeetingProposalVoteRows(meeting: WorkMeetingDetail) {
  return meeting.proposals.flatMap((proposal) => proposal.votes.map((vote) => ({
    ...meetingContext(meeting),
    proposalId: proposal.id,
    proposalTitle: proposal.title,
    proposalVoteVisibility: proposal.voteVisibility,
    ...vote,
  })));
}

export function iterateWorkMeetingDecisionRows(meeting: WorkMeetingDetail) {
  return meeting.decisions.map((decision) => ({ ...meetingContext(meeting), ...decision }));
}

export function iterateWorkMeetingActionCandidateRows(meeting: WorkMeetingDetail) {
  return meeting.actionCandidates.map((candidate) => ({ ...meetingContext(meeting), ...candidate }));
}

function meetingContext(meeting: WorkMeetingDetail): MeetingContext {
  return { meetingId: meeting.id, meetingTitle: meeting.title, meetingStartAt: meeting.startAt };
}
