"use client";

import {
  createActionsSection,
  createFieldsSection,
  createInlineFieldsSection,
  createListSection,
  createPageBody,
  createPanelSection,
  createSectionsSection,
  PageSurface,
  type BodySurfaceBadgeSpec,
  type BodySurfaceCommandSpec,
  type BodySurfaceSectionSpec,
  type FormSurfaceItemSpec,
} from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import type { ActionDraft, MeetingDetail } from "./meeting-types";
import { DECISION_KIND_OPTIONS, ROLE_OPTIONS } from "./meeting-types";
import {
  actionPayload,
  agendaTitle,
  candidateStatusLabel,
  decisionKindLabel,
  emptyActionDraft,
  formatDateTime,
  normalizeOptionalIds,
  roleLabel,
  statusLabel,
  voteChoiceLabel,
} from "./meeting-utils";

type MutateMeeting = <T>(
  path: string,
  body: Record<string, unknown>,
  success: string,
  after?: (data: T) => void,
) => Promise<void>;

type MeetingDetailPanelProps = {
  meeting: MeetingDetail;
  saving: boolean;
  user: SessionUser;
  actionDrafts: Record<number, ActionDraft>;
  participantDraft: { userId: string; role: string; canVote: boolean };
  agendaDraft: { title: string; description: string };
  minuteDraft: { agendaItemId: string; content: string };
  proposalDraft: { agendaItemId: string; title: string; content: string; voteVisibility: string; minVotesRequired: string };
  decisionDraft: { agendaItemId: string; proposalId: string; kind: string; title: string; content: string; effectiveDate: string };
  candidateDraft: { agendaItemId: string; decisionId: string; title: string; description: string; targetKind: string };
  onUpdate: (body: Record<string, unknown>, success: string) => void;
  onMutate: MutateMeeting;
  onActionDraftsChange: (next: Record<number, ActionDraft>) => void;
  onParticipantDraftChange: (next: { userId: string; role: string; canVote: boolean }) => void;
  onAgendaDraftChange: (next: { title: string; description: string }) => void;
  onMinuteDraftChange: (next: { agendaItemId: string; content: string }) => void;
  onProposalDraftChange: (next: { agendaItemId: string; title: string; content: string; voteVisibility: string; minVotesRequired: string }) => void;
  onDecisionDraftChange: (next: { agendaItemId: string; proposalId: string; kind: string; title: string; content: string; effectiveDate: string }) => void;
  onCandidateDraftChange: (next: { agendaItemId: string; decisionId: string; title: string; description: string; targetKind: string }) => void;
};

function textField(key: string, label: string, value: string, onChange: (value: string) => void, options: {
  kind?: "text" | "number" | "date";
  multiline?: boolean;
} = {}): FormSurfaceItemSpec {
  const { kind = "text", multiline = false } = options;
  return {
    key,
    label,
    spec: {
      valueType: kind === "number" ? "number" : kind === "date" ? "date" : "string",
      control: kind === "number" ? "number" : kind === "date" ? "temporal" : "text",
      precision: kind === "date" ? "date" : undefined,
      multiline,
    },
    value,
    onChange: (next) => onChange(String(next ?? "")),
    rows: multiline ? 2 : undefined,
    placeholder: kind === "date" ? "选择日期" : `输入${label}`,
  };
}

function selectField(key: string, label: string, value: string, options: Array<{ value: string; label: string }>, onChange: (value: string) => void): FormSurfaceItemSpec {
  return {
    key,
    label,
    spec: {
      valueType: "string",
      control: "choice",
      options: { source: "static", mode: options.length > 8 ? "autocomplete" : "dropdown", items: options, visibleCount: 5 },
    },
    value,
    onChange: (next) => onChange(String(next ?? "")),
    placeholder: "未设置",
  };
}

function agendaOptions(meeting: MeetingDetail) {
  return [
    { value: "", label: "不关联" },
    ...meeting.agendaItems.map((item) => ({ value: String(item.id), label: item.title })),
  ];
}

function decisionOptions(meeting: MeetingDetail) {
  return [
    { value: "", label: "不关联" },
    ...meeting.decisions.map((item) => ({ value: String(item.id), label: item.title })),
  ];
}

function createMeetingHeaderSection(meeting: MeetingDetail, saving: boolean, onUpdate: MeetingDetailPanelProps["onUpdate"]): BodySurfaceSectionSpec {
  const badges: BodySurfaceBadgeSpec[] = [
    { key: "type", label: meeting.typeName, tone: "success" },
    { key: "status", label: statusLabel(meeting.status), tone: meeting.status === "closed" ? "muted" : "info" },
    { key: "visibility", label: meeting.visibility === "public" ? "模块内公开" : "参会人可见", tone: "muted" },
  ];
  const actions: BodySurfaceCommandSpec[] | undefined = meeting.permissions.canEdit ? [
    { key: "start", label: "开始", variant: "secondary", size: "sm", disabled: saving || meeting.status === "in_progress", onClick: () => onUpdate({ status: "in_progress" }, "会议已开始") },
    { key: "close", label: "关闭", variant: "secondary", size: "sm", disabled: saving || meeting.status === "closed", onClick: () => onUpdate({ status: "closed" }, "会议已关闭") },
    { key: "participants-only", label: "参会可见", variant: "secondary", size: "sm", disabled: saving || meeting.visibility === "participants_only", onClick: () => onUpdate({ visibility: "participants_only" }, "可见性已更新") },
    { key: "public", label: "公开", variant: "secondary", size: "sm", disabled: saving || meeting.visibility === "public", onClick: () => onUpdate({ visibility: "public" }, "可见性已更新") },
  ] : undefined;

  return {
    ...createFieldsSection("meeting-header", [
      { kind: "readonly", key: "time", label: "时间", value: formatDateTime(meeting.startAt) || "未定时间" },
      { kind: "readonly", key: "location", label: "地点", value: meeting.location || "未设置" },
      { kind: "readonly", key: "owner", label: "主持", value: meeting.ownerName || "未设置" },
      { kind: "readonly", key: "secretary", label: "记录", value: meeting.secretaryName || "未设置" },
      { kind: "readonly", key: "description", label: "说明", span: "wide", value: meeting.description || "未填写" },
    ], { kind: "detail", layout: { columns: 2 } }),
    header: { title: meeting.title, badges, actions },
  };
}

function createParticipantsSection(props: MeetingDetailPanelProps): BodySurfaceSectionSpec {
  const { meeting, saving, participantDraft, onParticipantDraftChange, onMutate } = props;
  const canEdit = meeting.permissions.canEdit;
  return createPanelSection("participants", {
    title: "参会人",
    sections: [
      createListSection("participant-list", {
        empty: { content: "暂无参会人", compact: true },
        items: meeting.participants.map((participant) => ({
          key: participant.id,
          title: participant.userName || `用户 ${participant.userId}`,
          description: `${roleLabel(participant.role)} · ${participant.canVote ? "可投票" : "不可投票"}`,
        })),
      }),
      ...(canEdit ? [createInlineFieldsSection("participant-form", [
        textField("userId", "用户 ID", participantDraft.userId, (userId) => onParticipantDraftChange({ ...participantDraft, userId })),
        selectField("role", "角色", participantDraft.role, ROLE_OPTIONS, (role) => onParticipantDraftChange({ ...participantDraft, role, canVote: role === "owner" || role === "voter" })),
        {
          key: "canVote",
          label: "可投票",
          spec: { valueType: "boolean", control: "boolean", presentation: "checkbox" },
          value: participantDraft.canVote,
          onChange: (checked) => onParticipantDraftChange({ ...participantDraft, canVote: Boolean(checked) }),
        },
      ], {
        commands: [{ key: "save-participant", label: "保存参会人", variant: "primary", size: "sm", disabled: saving || !participantDraft.userId, onClick: () => void onMutate<{ meeting: MeetingDetail }>(`/api/modules/work/meetings/${meeting.id}/participants`, participantDraft, "参会人已保存") }],
      })] : []),
    ],
  });
}

function createAgendaSection(props: MeetingDetailPanelProps): BodySurfaceSectionSpec {
  const { meeting, saving, agendaDraft, onAgendaDraftChange, onMutate } = props;
  return createPanelSection("agenda", {
    title: "议程",
    sections: [
      createListSection("agenda-list", {
        empty: { content: "暂无议题", compact: true },
        items: meeting.agendaItems.map((item) => ({ key: item.id, title: item.title, description: item.description })),
      }),
      ...(meeting.permissions.canEdit ? [createInlineFieldsSection("agenda-form", [
        textField("title", "议题", agendaDraft.title, (title) => onAgendaDraftChange({ ...agendaDraft, title })),
        textField("description", "说明", agendaDraft.description, (description) => onAgendaDraftChange({ ...agendaDraft, description })),
      ], {
        commands: [{ key: "add-agenda", label: "新增议题", variant: "primary", size: "sm", disabled: saving || !agendaDraft.title.trim(), onClick: () => void onMutate<{ meeting: MeetingDetail }>(`/api/modules/work/meetings/${meeting.id}/agenda`, agendaDraft, "议题已新增", () => onAgendaDraftChange({ title: "", description: "" })) }],
      })] : []),
    ],
  });
}

function createMinutesSection(props: MeetingDetailPanelProps): BodySurfaceSectionSpec {
  const { meeting, saving, minuteDraft, onMinuteDraftChange, onMutate } = props;
  return createPanelSection("minutes", {
    title: "纪要",
    sections: [
      createListSection("minute-list", {
        empty: { content: "暂无纪要", compact: true },
        items: meeting.minuteEntries.map((item) => ({ key: item.id, title: agendaTitle(meeting, item.agendaItemId) || "会议纪要", description: item.content })),
      }),
      ...(meeting.permissions.canEdit ? [createInlineFieldsSection("minute-form", [
        selectField("agendaItemId", "关联议题", minuteDraft.agendaItemId, agendaOptions(meeting), (agendaItemId) => onMinuteDraftChange({ ...minuteDraft, agendaItemId })),
        textField("content", "内容", minuteDraft.content, (content) => onMinuteDraftChange({ ...minuteDraft, content }), { multiline: true }),
      ], {
        commands: [{ key: "add-minute", label: "记录纪要", variant: "primary", size: "sm", disabled: saving || !minuteDraft.content.trim(), onClick: () => void onMutate<{ meeting: MeetingDetail }>(`/api/modules/work/meetings/${meeting.id}/minutes`, normalizeOptionalIds(minuteDraft), "纪要已记录", () => onMinuteDraftChange({ agendaItemId: "", content: "" })) }],
      })] : []),
    ],
  });
}

function createProposalsSection(props: MeetingDetailPanelProps): BodySurfaceSectionSpec {
  const { meeting, saving, proposalDraft, onDecisionDraftChange, onProposalDraftChange, onMutate } = props;
  return createPanelSection("proposals", {
    title: "表决",
    sections: [
      createListSection("proposal-list", {
        empty: { content: "暂无表决", compact: true },
        items: meeting.proposals.map((proposal) => ({
          key: proposal.id,
          title: proposal.title,
          description: proposal.content,
          badges: [
            { key: "status", label: statusLabel(proposal.status), tone: proposal.status === "passed" ? "success" : proposal.status === "rejected" ? "danger" : "warning" },
            { key: "yes", label: `赞成 ${proposal.tally.yes}`, tone: "success" },
            { key: "no", label: `反对 ${proposal.tally.no}`, tone: "danger" },
            { key: "abstain", label: `弃权 ${proposal.tally.abstain}`, tone: "muted" },
          ],
          meta: proposal.votes.length ? proposal.votes.map((vote) => `${vote.voterName || `用户 ${vote.voterUserId}`}：${voteChoiceLabel(vote.choice)}`).join(" · ") : undefined,
          actions: [
            ...(meeting.permissions.canVote && proposal.status === "open" ? [
              { key: "yes", label: "赞成", variant: proposal.myVote?.choice === "yes" ? "primary" as const : "secondary" as const, size: "sm" as const, disabled: saving, onClick: () => void onMutate<{ meeting: MeetingDetail }>(`/api/modules/work/meetings/${meeting.id}/votes`, { action: "cast", proposalId: proposal.id, choice: "yes" }, "投票已保存") },
              { key: "no", label: "反对", variant: proposal.myVote?.choice === "no" ? "primary" as const : "secondary" as const, size: "sm" as const, disabled: saving, onClick: () => void onMutate<{ meeting: MeetingDetail }>(`/api/modules/work/meetings/${meeting.id}/votes`, { action: "cast", proposalId: proposal.id, choice: "no" }, "投票已保存") },
              { key: "abstain", label: "弃权", variant: proposal.myVote?.choice === "abstain" ? "primary" as const : "secondary" as const, size: "sm" as const, disabled: saving, onClick: () => void onMutate<{ meeting: MeetingDetail }>(`/api/modules/work/meetings/${meeting.id}/votes`, { action: "cast", proposalId: proposal.id, choice: "abstain" }, "投票已保存") },
            ] : []),
            ...(meeting.permissions.canEdit && proposal.status === "open" ? [{ key: "close", label: "关闭表决", variant: "secondary" as const, size: "sm" as const, disabled: saving, onClick: () => void onMutate<{ meeting: MeetingDetail }>(`/api/modules/work/meetings/${meeting.id}/votes`, { action: "close", proposalId: proposal.id }, "表决已关闭") }] : []),
            ...(meeting.permissions.canEdit && proposal.status === "passed" ? [{ key: "decision", label: "生成决议", variant: "secondary" as const, size: "sm" as const, disabled: saving, onClick: () => onDecisionDraftChange({ agendaItemId: proposal.agendaItemId ? String(proposal.agendaItemId) : "", proposalId: String(proposal.id), kind: "resolution", title: proposal.title, content: proposal.content, effectiveDate: "" }) }] : []),
          ],
        })),
      }),
      ...(meeting.permissions.canEdit ? [createInlineFieldsSection("proposal-form", [
        selectField("agendaItemId", "关联议题", proposalDraft.agendaItemId, agendaOptions(meeting), (agendaItemId) => onProposalDraftChange({ ...proposalDraft, agendaItemId })),
        textField("title", "表决事项", proposalDraft.title, (title) => onProposalDraftChange({ ...proposalDraft, title })),
        selectField("voteVisibility", "展示方式", proposalDraft.voteVisibility, [{ value: "named", label: "实名" }, { value: "anonymous", label: "匿名展示" }], (voteVisibility) => onProposalDraftChange({ ...proposalDraft, voteVisibility })),
        textField("minVotesRequired", "最低人数", proposalDraft.minVotesRequired, (minVotesRequired) => onProposalDraftChange({ ...proposalDraft, minVotesRequired }), { kind: "number" }),
        textField("content", "内容", proposalDraft.content, (content) => onProposalDraftChange({ ...proposalDraft, content }), { multiline: true }),
      ], {
        commands: [{ key: "create-proposal", label: "创建表决", variant: "primary", size: "sm", disabled: saving || !proposalDraft.title.trim(), onClick: () => void onMutate<{ meeting: MeetingDetail }>(`/api/modules/work/meetings/${meeting.id}/votes`, { action: "create", ...normalizeOptionalIds(proposalDraft) }, "表决已创建", () => onProposalDraftChange({ agendaItemId: "", title: "", content: "", voteVisibility: "named", minVotesRequired: "" })) }],
      })] : []),
    ],
  });
}

function createDecisionsSection(props: MeetingDetailPanelProps): BodySurfaceSectionSpec {
  const { meeting, saving, decisionDraft, onDecisionDraftChange, onMutate } = props;
  return createPanelSection("decisions", {
    title: "决议 / 指导",
    sections: [
      createListSection("decision-list", {
        empty: { content: "暂无决议", compact: true },
        items: meeting.decisions.map((decision) => ({
          key: decision.id,
          title: decision.title,
          description: decision.content,
          badges: [{ key: "kind", label: decisionKindLabel(decision.kind), tone: "info" }],
          meta: `ID ${decision.id}${decision.effectiveDate ? ` · ${decision.effectiveDate}` : ""}`,
        })),
      }),
      ...(meeting.permissions.canEdit ? [createInlineFieldsSection("decision-form", [
        selectField("agendaItemId", "关联议题", decisionDraft.agendaItemId, agendaOptions(meeting), (agendaItemId) => onDecisionDraftChange({ ...decisionDraft, agendaItemId })),
        selectField("kind", "类型", decisionDraft.kind, DECISION_KIND_OPTIONS, (kind) => onDecisionDraftChange({ ...decisionDraft, kind })),
        textField("effectiveDate", "生效日期", decisionDraft.effectiveDate, (effectiveDate) => onDecisionDraftChange({ ...decisionDraft, effectiveDate }), { kind: "date" }),
        textField("title", "标题", decisionDraft.title, (title) => onDecisionDraftChange({ ...decisionDraft, title })),
        textField("content", "内容", decisionDraft.content, (content) => onDecisionDraftChange({ ...decisionDraft, content }), { multiline: true }),
      ], {
        commands: [{ key: "save-decision", label: "保存决议", variant: "primary", size: "sm", disabled: saving || !decisionDraft.title.trim(), onClick: () => void onMutate<{ meeting: MeetingDetail }>(`/api/modules/work/meetings/${meeting.id}/decisions`, normalizeOptionalIds(decisionDraft), "决议已保存", () => onDecisionDraftChange({ agendaItemId: "", proposalId: "", kind: "decision", title: "", content: "", effectiveDate: "" })) }],
      })] : []),
    ],
  });
}

function createCandidatesSection(props: MeetingDetailPanelProps): BodySurfaceSectionSpec {
  const { meeting, saving, user, actionDrafts, candidateDraft, onActionDraftsChange, onCandidateDraftChange, onMutate } = props;
  return createPanelSection("candidates", {
    title: "行动候选",
    sections: [
      createListSection("candidate-list", {
        empty: { content: "暂无行动候选", compact: true },
        items: meeting.actionCandidates.map((candidate) => {
          const draft = actionDrafts[candidate.id] || emptyActionDraft();
          return {
            key: candidate.id,
            title: candidate.title,
            description: candidate.description,
            badges: [{ key: "status", label: candidateStatusLabel(candidate.status), tone: candidate.status === "linked" ? "success" : candidate.status === "ignored" ? "muted" : "warning" }],
            meta: candidate.status === "linked"
              ? candidate.linkedWorkPlanTitle ? `OKR 计划：${candidate.linkedWorkPlanTitle}` : candidate.linkedProjectTaskTitle ? `项目任务：${candidate.linkedProjectTaskTitle}` : candidate.linkedWorkItemTitle ? `工作项：${candidate.linkedWorkItemTitle}` : "已链接"
              : undefined,
            sections: meeting.permissions.canEdit && candidate.status === "candidate" ? [
              {
                ...createInlineFieldsSection(`candidate-${candidate.id}-draft`, [
                  textField("workPlanId", "OKR 计划 ID", draft.workPlanId, (workPlanId) => onActionDraftsChange({ ...actionDrafts, [candidate.id]: { ...draft, workPlanId } })),
                  textField("projectTaskId", "项目任务 ID", draft.projectTaskId, (projectTaskId) => onActionDraftsChange({ ...actionDrafts, [candidate.id]: { ...draft, projectTaskId } })),
                  textField("projectId", "项目 ID", draft.projectId, (projectId) => onActionDraftsChange({ ...actionDrafts, [candidate.id]: { ...draft, projectId } })),
                  textField("targetId", "工作计划目标", draft.targetId, (targetId) => onActionDraftsChange({ ...actionDrafts, [candidate.id]: { ...draft, targetId } })),
                ]),
                framed: false,
              },
              {
                ...createActionsSection(`candidate-${candidate.id}-actions`, [
                  { key: "linkWorkPlan", label: "链接 OKR 计划", variant: "secondary", size: "sm", disabled: saving || !draft.workPlanId, onClick: () => void onMutate<{ meeting: MeetingDetail }>(`/api/modules/work/meetings/${meeting.id}/action-candidates`, actionPayload(candidate.id, "linkWorkPlan", draft, user), "行动候选已处理") },
                  { key: "createWorkPlan", label: "创建 OKR 计划", variant: "secondary", size: "sm", disabled: saving, onClick: () => void onMutate<{ meeting: MeetingDetail }>(`/api/modules/work/meetings/${meeting.id}/action-candidates`, actionPayload(candidate.id, "createWorkPlan", draft, user), "行动候选已处理") },
                  { key: "linkProjectTask", label: "链接项目任务", variant: "secondary", size: "sm", disabled: saving || !draft.projectTaskId, onClick: () => void onMutate<{ meeting: MeetingDetail }>(`/api/modules/work/meetings/${meeting.id}/action-candidates`, actionPayload(candidate.id, "linkProjectTask", draft, user), "行动候选已处理") },
                  { key: "createProjectTask", label: "创建项目任务", variant: "secondary", size: "sm", disabled: saving || !draft.projectId, onClick: () => void onMutate<{ meeting: MeetingDetail }>(`/api/modules/work/meetings/${meeting.id}/action-candidates`, actionPayload(candidate.id, "createProjectTask", draft, user), "行动候选已处理") },
                  { key: "ignore", label: "忽略", variant: "danger", size: "sm", disabled: saving, onClick: () => void onMutate<{ meeting: MeetingDetail }>(`/api/modules/work/meetings/${meeting.id}/action-candidates`, actionPayload(candidate.id, "ignore", draft, user), "行动候选已处理") },
                ]),
                framed: false,
              },
            ] : undefined,
          };
        }),
      }),
      ...(meeting.permissions.canEdit ? [createInlineFieldsSection("candidate-form", [
        selectField("agendaItemId", "关联议题", candidateDraft.agendaItemId, agendaOptions(meeting), (agendaItemId) => onCandidateDraftChange({ ...candidateDraft, agendaItemId })),
        selectField("decisionId", "关联决议", candidateDraft.decisionId, decisionOptions(meeting), (decisionId) => onCandidateDraftChange({ ...candidateDraft, decisionId })),
        selectField("targetKind", "目标", candidateDraft.targetKind, [{ value: "work_plan", label: "OKR 计划" }, { value: "project_task", label: "项目任务" }], (targetKind) => onCandidateDraftChange({ ...candidateDraft, targetKind })),
        textField("title", "候选事项", candidateDraft.title, (title) => onCandidateDraftChange({ ...candidateDraft, title })),
        textField("description", "说明", candidateDraft.description, (description) => onCandidateDraftChange({ ...candidateDraft, description }), { multiline: true }),
      ], {
        commands: [{ key: "add-candidate", label: "新增候选", variant: "primary", size: "sm", disabled: saving || !candidateDraft.title.trim(), onClick: () => void onMutate<{ meeting: MeetingDetail }>(`/api/modules/work/meetings/${meeting.id}/action-candidates`, normalizeOptionalIds(candidateDraft), "行动候选已新增", () => onCandidateDraftChange({ agendaItemId: "", decisionId: "", title: "", description: "", targetKind: "work_plan" })) }],
      })] : []),
    ],
  });
}

export function useMeetingDetailSection(props: MeetingDetailPanelProps): BodySurfaceSectionSpec {
  return createSectionsSection("meeting-detail", {
    sections: [
      createMeetingHeaderSection(props.meeting, props.saving, props.onUpdate),
      createSectionsSection("meeting-detail-grid", {
        layout: "grid",
        sections: [
          createParticipantsSection(props),
          createAgendaSection(props),
          createMinutesSection(props),
          createProposalsSection(props),
          createDecisionsSection(props),
          createCandidatesSection(props),
        ],
      }),
    ],
  });
}

export function MeetingDetailPanel(props: MeetingDetailPanelProps) {
  const section = useMeetingDetailSection(props);
  return <PageSurface kind="standard" embedded body={createPageBody([section])} />;
}
