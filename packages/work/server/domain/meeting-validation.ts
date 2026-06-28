import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";

export const MEETING_VISIBILITIES = ["participants_only", "public"] as const;
export const MEETING_STATUSES = ["scheduled", "in_progress", "closed"] as const;
export const MEETING_PARTICIPANT_ROLES = ["owner", "secretary", "voter", "participant", "observer"] as const;
export const MEETING_VOTE_VISIBILITIES = ["named", "anonymous"] as const;
export const MEETING_VOTE_CHOICES = ["yes", "no", "abstain"] as const;
export const MEETING_PROPOSAL_STATUSES = ["open", "passed", "rejected", "closed"] as const;
export const MEETING_DECISION_KINDS = ["decision", "resolution", "guidance"] as const;
export const MEETING_ACTION_TARGET_KINDS = ["work_plan", "work_item", "project_task"] as const;
export const MEETING_ACTION_STATUSES = ["candidate", "linked", "ignored"] as const;

export type MeetingVisibility = (typeof MEETING_VISIBILITIES)[number];
export type MeetingStatus = (typeof MEETING_STATUSES)[number];
export type MeetingParticipantRole = (typeof MEETING_PARTICIPANT_ROLES)[number];
export type MeetingVoteVisibility = (typeof MEETING_VOTE_VISIBILITIES)[number];
export type MeetingVoteChoice = (typeof MEETING_VOTE_CHOICES)[number];
export type MeetingDecisionKind = (typeof MEETING_DECISION_KINDS)[number];
export type MeetingActionTargetKind = (typeof MEETING_ACTION_TARGET_KINDS)[number];

export interface MeetingCreateCommand {
  typeId: number;
  seriesId: number | null;
  title: string;
  description: string;
  startAt: Date | null;
  endAt: Date | null;
  location: string;
  visibility: MeetingVisibility;
  ownerUserId: number | null;
  secretaryUserId: number | null;
  participantUserIds: number[];
}

export interface MeetingUpdateCommand {
  title?: string;
  description?: string;
  startAt?: Date | null;
  endAt?: Date | null;
  location?: string;
  visibility?: MeetingVisibility;
  status?: MeetingStatus;
  ownerUserId?: number | null;
  secretaryUserId?: number | null;
}

export interface MeetingParticipantCommand {
  userId: number;
  role: MeetingParticipantRole;
  canVote: boolean;
  attendanceStatus: string;
}

export interface MeetingAgendaCommand {
  title: string;
  description: string;
  presenterUserId: number | null;
  sortOrder: number;
}

export interface MeetingMinuteCommand {
  agendaItemId: number | null;
  content: string;
  kind: string;
}

export interface MeetingProposalCommand {
  agendaItemId: number | null;
  title: string;
  content: string;
  voteVisibility: MeetingVoteVisibility;
  minVotesRequired: number | null;
}

export interface MeetingVoteCommand {
  proposalId: number;
  choice: MeetingVoteChoice;
  note: string;
}

export interface MeetingDecisionCommand {
  agendaItemId: number | null;
  proposalId: number | null;
  kind: MeetingDecisionKind;
  title: string;
  content: string;
  effectiveDate: Date | null;
}

export interface MeetingActionCandidateCommand {
  agendaItemId: number | null;
  decisionId: number | null;
  title: string;
  description: string;
  targetKind: MeetingActionTargetKind;
}

export interface MeetingDeleteCommand {
  meetingId: number;
}

export interface MeetingProposalCloseCommand {
  proposalId: number;
}

export interface MeetingActionCandidateLinkCommand {
  candidateId: number;
  action: "ignore" | "linkWorkPlan" | "createWorkPlan" | "linkWorkItem" | "createWorkItem" | "linkProjectTask" | "createProjectTask";
}

function requiredText(value: unknown, label: string) {
  const text = String(value ?? "").trim();
  return text ? okCommand(text) : failCommand(`${label}不能为空`);
}

function optionalText(value: unknown) {
  return String(value ?? "").trim();
}

function optionalDate(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return okCommand(null);
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return failCommand(`${label}无效`);
  return okCommand(date);
}

function optionalPositiveId(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return okCommand(null);
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return failCommand(`${label}无效`);
  return okCommand(id);
}

function requiredPositiveId(value: unknown, label: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return failCommand(`${label}无效`);
  return okCommand(id);
}

function enumValue<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number], label: string) {
  if (value === null || value === undefined || value === "") return okCommand(fallback);
  const text = String(value).trim();
  return (allowed as readonly string[]).includes(text) ? okCommand(text as T[number]) : failCommand(`${label}无效`);
}

function optionalEnumValue<T extends readonly string[]>(value: unknown, allowed: T, label: string) {
  if (value === undefined) return okCommand(undefined);
  if (value === null || value === "") return okCommand(null);
  const text = String(value).trim();
  return (allowed as readonly string[]).includes(text) ? okCommand(text as T[number]) : failCommand(`${label}无效`);
}

function numberList(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return okCommand([]);
  const raw = Array.isArray(value) ? value : String(value).split(/,|，/);
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const item of raw) {
    if (item === null || item === undefined || item === "") continue;
    const id = Number(item);
    if (!Number.isInteger(id) || id <= 0) return failCommand(`${label}无效`);
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return okCommand(ids);
}

export function validateMeetingCreate(input: Record<string, unknown>): DomainValidationResult<MeetingCreateCommand> {
  const typeId = requiredPositiveId(input.typeId, "会议类型");
  if (!typeId.ok) return typeId;
  const seriesId = optionalPositiveId(input.seriesId, "会议系列");
  if (!seriesId.ok) return seriesId;
  const title = requiredText(input.title, "会议主题");
  if (!title.ok) return title;
  const startAt = optionalDate(input.startAt, "开始时间");
  if (!startAt.ok) return startAt;
  const endAt = optionalDate(input.endAt, "结束时间");
  if (!endAt.ok) return endAt;
  if (startAt.data && endAt.data && endAt.data < startAt.data) return failCommand("会议结束不能早于开始");
  const visibility = enumValue(input.visibility, MEETING_VISIBILITIES, "participants_only", "可见性");
  if (!visibility.ok) return visibility;
  const ownerUserId = optionalPositiveId(input.ownerUserId, "主持人");
  if (!ownerUserId.ok) return ownerUserId;
  const secretaryUserId = optionalPositiveId(input.secretaryUserId, "记录人");
  if (!secretaryUserId.ok) return secretaryUserId;
  const participantUserIds = numberList(input.participantUserIds, "参会人");
  if (!participantUserIds.ok) return participantUserIds;

  return okCommand({
    typeId: typeId.data,
    seriesId: seriesId.data,
    title: title.data,
    description: optionalText(input.description),
    startAt: startAt.data,
    endAt: endAt.data,
    location: optionalText(input.location),
    visibility: visibility.data,
    ownerUserId: ownerUserId.data,
    secretaryUserId: secretaryUserId.data,
    participantUserIds: participantUserIds.data,
  });
}

export function validateMeetingUpdate(input: Record<string, unknown>): DomainValidationResult<MeetingUpdateCommand> {
  const data: MeetingUpdateCommand = {};
  if (input.title !== undefined) {
    const title = requiredText(input.title, "会议主题");
    if (!title.ok) return title;
    data.title = title.data;
  }
  if (input.description !== undefined) data.description = optionalText(input.description);
  if (input.location !== undefined) data.location = optionalText(input.location);
  for (const field of ["startAt", "endAt"] as const) {
    if (input[field] === undefined) continue;
    const date = optionalDate(input[field], field === "startAt" ? "开始时间" : "结束时间");
    if (!date.ok) return date;
    data[field] = date.data;
  }
  if (data.startAt && data.endAt && data.endAt < data.startAt) return failCommand("会议结束不能早于开始");
  const visibility = optionalEnumValue(input.visibility, MEETING_VISIBILITIES, "可见性");
  if (!visibility.ok) return visibility;
  if (visibility.data !== undefined && visibility.data !== null) data.visibility = visibility.data;
  const status = optionalEnumValue(input.status, MEETING_STATUSES, "会议状态");
  if (!status.ok) return status;
  if (status.data !== undefined && status.data !== null) data.status = status.data;
  for (const field of ["ownerUserId", "secretaryUserId"] as const) {
    if (input[field] === undefined) continue;
    const id = optionalPositiveId(input[field], field === "ownerUserId" ? "主持人" : "记录人");
    if (!id.ok) return id;
    data[field] = id.data;
  }
  return okCommand(data);
}

export function validateMeetingParticipant(input: Record<string, unknown>): DomainValidationResult<MeetingParticipantCommand> {
  const userId = requiredPositiveId(input.userId, "参会用户");
  if (!userId.ok) return userId;
  const role = enumValue(input.role, MEETING_PARTICIPANT_ROLES, "participant", "会议角色");
  if (!role.ok) return role;
  return okCommand({
    userId: userId.data,
    role: role.data,
    canVote: input.canVote === undefined ? role.data === "owner" || role.data === "voter" : Boolean(input.canVote),
    attendanceStatus: optionalText(input.attendanceStatus) || "invited",
  });
}

export function validateMeetingAgenda(input: Record<string, unknown>): DomainValidationResult<MeetingAgendaCommand> {
  const title = requiredText(input.title, "议题");
  if (!title.ok) return title;
  const presenterUserId = optionalPositiveId(input.presenterUserId, "汇报人");
  if (!presenterUserId.ok) return presenterUserId;
  const sortOrder = input.sortOrder === undefined || input.sortOrder === null || input.sortOrder === "" ? 0 : Number(input.sortOrder);
  if (!Number.isFinite(sortOrder)) return failCommand("排序无效");
  return okCommand({
    title: title.data,
    description: optionalText(input.description),
    presenterUserId: presenterUserId.data,
    sortOrder,
  });
}

export function validateMeetingMinute(input: Record<string, unknown>): DomainValidationResult<MeetingMinuteCommand> {
  const agendaItemId = optionalPositiveId(input.agendaItemId, "议题");
  if (!agendaItemId.ok) return agendaItemId;
  const content = requiredText(input.content, "纪要内容");
  if (!content.ok) return content;
  return okCommand({
    agendaItemId: agendaItemId.data,
    content: content.data,
    kind: optionalText(input.kind) || "note",
  });
}

export function validateMeetingProposal(input: Record<string, unknown>): DomainValidationResult<MeetingProposalCommand> {
  const agendaItemId = optionalPositiveId(input.agendaItemId, "议题");
  if (!agendaItemId.ok) return agendaItemId;
  const title = requiredText(input.title, "表决事项");
  if (!title.ok) return title;
  const voteVisibility = enumValue(input.voteVisibility, MEETING_VOTE_VISIBILITIES, "named", "投票可见性");
  if (!voteVisibility.ok) return voteVisibility;
  const minVotesRequired = optionalPositiveId(input.minVotesRequired, "最低投票人数");
  if (!minVotesRequired.ok) return minVotesRequired;
  return okCommand({
    agendaItemId: agendaItemId.data,
    title: title.data,
    content: optionalText(input.content),
    voteVisibility: voteVisibility.data,
    minVotesRequired: minVotesRequired.data,
  });
}

export function validateMeetingVote(input: Record<string, unknown>): DomainValidationResult<MeetingVoteCommand> {
  const proposalId = requiredPositiveId(input.proposalId, "表决事项");
  if (!proposalId.ok) return proposalId;
  const choice = enumValue(input.choice, MEETING_VOTE_CHOICES, "abstain", "投票选择");
  if (!choice.ok) return choice;
  return okCommand({ proposalId: proposalId.data, choice: choice.data, note: optionalText(input.note) });
}

export function validateMeetingDelete(input: Record<string, unknown>): DomainValidationResult<MeetingDeleteCommand> {
  const meetingId = requiredPositiveId(input.meetingId, "会议");
  if (!meetingId.ok) return meetingId;
  return okCommand({ meetingId: meetingId.data });
}

export function validateMeetingProposalClose(input: Record<string, unknown>): DomainValidationResult<MeetingProposalCloseCommand> {
  const proposalId = requiredPositiveId(input.proposalId, "表决事项");
  if (!proposalId.ok) return proposalId;
  return okCommand({ proposalId: proposalId.data });
}

export function validateMeetingActionCandidateLink(input: Record<string, unknown>): DomainValidationResult<MeetingActionCandidateLinkCommand> {
  const candidateId = requiredPositiveId(input.candidateId, "行动候选");
  if (!candidateId.ok) return candidateId;
  const action = enumValue(input.action, ["ignore", "linkWorkPlan", "createWorkPlan", "linkWorkItem", "createWorkItem", "linkProjectTask", "createProjectTask"] as const, "ignore", "行动候选动作");
  if (!action.ok) return action;
  return okCommand({ candidateId: candidateId.data, action: action.data });
}

export function validateMeetingDecision(input: Record<string, unknown>): DomainValidationResult<MeetingDecisionCommand> {
  const agendaItemId = optionalPositiveId(input.agendaItemId, "议题");
  if (!agendaItemId.ok) return agendaItemId;
  const proposalId = optionalPositiveId(input.proposalId, "表决事项");
  if (!proposalId.ok) return proposalId;
  const kind = enumValue(input.kind, MEETING_DECISION_KINDS, "decision", "决议类型");
  if (!kind.ok) return kind;
  const title = requiredText(input.title, "决议标题");
  if (!title.ok) return title;
  const effectiveDate = optionalDate(input.effectiveDate, "生效日期");
  if (!effectiveDate.ok) return effectiveDate;
  return okCommand({
    agendaItemId: agendaItemId.data,
    proposalId: proposalId.data,
    kind: kind.data,
    title: title.data,
    content: optionalText(input.content),
    effectiveDate: effectiveDate.data,
  });
}

export function validateMeetingActionCandidate(input: Record<string, unknown>): DomainValidationResult<MeetingActionCandidateCommand> {
  const agendaItemId = optionalPositiveId(input.agendaItemId, "议题");
  if (!agendaItemId.ok) return agendaItemId;
  const decisionId = optionalPositiveId(input.decisionId, "会议决议");
  if (!decisionId.ok) return decisionId;
  const title = requiredText(input.title, "行动候选");
  if (!title.ok) return title;
  const targetKind = enumValue(input.targetKind, MEETING_ACTION_TARGET_KINDS, "work_plan", "候选目标");
  if (!targetKind.ok) return targetKind;
  return okCommand({
    agendaItemId: agendaItemId.data,
    decisionId: decisionId.data,
    title: title.data,
    description: optionalText(input.description),
    targetKind: targetKind.data,
  });
}
