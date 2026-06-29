"use client";

import { createActionsSection, createFieldsSection, createPageBody, createSelectorPanelSection, PageSurface, type BodySurfaceBadgeSpec } from "@workspace/core/ui";
import type { ActionDraft, MeetingDetail, MeetingParticipant, MeetingSummary } from "./meeting-types";
import { EmptyLine, InputBox, PageBodySectionSurface, StatusPill } from "./MeetingControls";
import { candidateStatusLabel, decisionKindLabel, emptyActionDraft, formatDateTime, roleLabel, voteChoiceLabel } from "./meeting-utils";

export function MeetingList({
  loading,
  meetings,
  selectedId,
  onSelect,
}: {
  loading: boolean;
  meetings: MeetingSummary[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <div
      className="min-w-0"
    >
      <PageSurface kind="standard"
        embedded
        body={createPageBody([
          createSelectorPanelSection<MeetingSummary>("meeting-list", {
            title: "会议列表",

            loading,
            loadingText: "加载中...",
            emptyText: "暂无会议",
            items: meetings,
            selectedId,
            onSelect: (meeting) => onSelect(meeting.id),
            getKey: (meeting) => meeting.id,

            renderItem: (meeting) => ({
              title: meeting.title,
              subtitle: `${meeting.typeName} · ${formatDateTime(meeting.startAt) || "未定时间"}`,
              trailing: <StatusPill status={meeting.status} />,
              meta: [`议题 ${meeting.counts.agendaItems}`, `表决 ${meeting.counts.proposals}`, `决议 ${meeting.counts.decisions}`],
            }),
          }),
        ])}
      />
    </div>
  );
}

export function MeetingHeader({
  meeting,
  saving,
  onUpdate,
}: {
  meeting: MeetingDetail;
  saving: boolean;
  onUpdate: (body: Record<string, unknown>, success: string) => void;
}) {
  const badges: BodySurfaceBadgeSpec[] = [
    { key: "type", label: meeting.typeName, tone: "success" },
    { key: "status", label: <StatusPill status={meeting.status} /> },
    { key: "visibility", label: meeting.visibility === "public" ? "模块内公开" : "参会人可见", tone: "muted" },
  ];
  const actions = meeting.permissions.canEdit ? [
    { key: "start", label: "开始", variant: "secondary" as const, size: "sm" as const, disabled: saving || meeting.status === "in_progress", onClick: () => onUpdate({ status: "in_progress" }, "会议已开始") },
    { key: "close", label: "关闭", variant: "secondary" as const, size: "sm" as const, disabled: saving || meeting.status === "closed", onClick: () => onUpdate({ status: "closed" }, "会议已关闭") },
    { key: "participants-only", label: "参会可见", variant: "secondary" as const, size: "sm" as const, disabled: saving || meeting.visibility === "participants_only", onClick: () => onUpdate({ visibility: "participants_only" }, "可见性已更新") },
    { key: "public", label: "公开", variant: "secondary" as const, size: "sm" as const, disabled: saving || meeting.visibility === "public", onClick: () => onUpdate({ visibility: "public" }, "可见性已更新") },
  ] : undefined;
  return <PageSurface kind="standard"
    embedded
    body={createPageBody([{
      ...createFieldsSection("meeting-header", [
        { kind: "readonly", key: "time", label: "时间", value: formatDateTime(meeting.startAt) || "未定时间" },
        { kind: "readonly", key: "location", label: "地点", value: meeting.location || "未设置" },
        { kind: "readonly", key: "owner", label: "主持", value: meeting.ownerName || "未设置" },
        { kind: "readonly", key: "secretary", label: "记录", value: meeting.secretaryName || "未设置" },
        { kind: "readonly", key: "description", label: "说明", span: "wide", value: meeting.description || "未填写" },
      ], { kind: "detail", layout: { columns: 2 } }),
      header: { title: meeting.title, badges, actions },
    }])}
  />;
}

export function ParticipantList({
  participants,
}: {
  participants: MeetingParticipant[];
}) {
  if (participants.length === 0) return <EmptyLine text="暂无参会人" />;
  return <div className="grid gap-2 sm:grid-cols-2">
      {participants.map(participant => <div key={participant.id} className="rounded-md border border-slate-100 px-3 py-2">
          <div className="truncate text-sm font-medium text-slate-800">{participant.userName || `用户 ${participant.userId}`}</div>
          <div className="mt-1 text-xs text-slate-500">{roleLabel(participant.role)} · {participant.canVote ? "可投票" : "不可投票"}</div>
        </div>)}
    </div>;
}

export function ProposalList({
  meeting,
  saving,
  onVote,
  onClose,
  onDecision,
}: {
  meeting: MeetingDetail;
  saving: boolean;
  onVote: (proposalId: number, choice: string) => void;
  onClose: (proposalId: number) => void;
  onDecision: (proposal: MeetingDetail["proposals"][number]) => void;
}) {
  if (meeting.proposals.length === 0) return <EmptyLine text="暂无表决" />;
  return <div className="space-y-3">
      {meeting.proposals.map(proposal => <div key={proposal.id} className="rounded-md border border-slate-100 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-slate-900">{proposal.title}</div>
              {proposal.content && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-500">{proposal.content}</p>}
            </div>
            <StatusPill status={proposal.status} />
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
            <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-700">赞成 {proposal.tally.yes}</span>
            <span className="rounded bg-rose-50 px-2 py-1 text-rose-700">反对 {proposal.tally.no}</span>
            <span className="rounded bg-slate-100 px-2 py-1 text-slate-600">弃权 {proposal.tally.abstain}</span>
            <span className="rounded bg-slate-100 px-2 py-1 text-slate-600">{proposal.voteVisibility === "anonymous" ? "匿名展示" : "实名展示"}</span>
          </div>
          {proposal.votes.length > 0 && <div className="mt-2 grid gap-1 text-xs text-slate-500">
              {proposal.votes.map(vote => <span key={vote.id}>{vote.voterName || `用户 ${vote.voterUserId}`}：{voteChoiceLabel(vote.choice)}</span>)}
            </div>}
          <PageBodySectionSurface className="mt-3" block={createActionsSection("proposal-actions", [
            ...(meeting.permissions.canVote && proposal.status === "open" ? [
              { key: "yes", label: "赞成", variant: proposal.myVote?.choice === "yes" ? "primary" as const : "secondary" as const, size: "sm" as const, disabled: saving, onClick: () => onVote(proposal.id, "yes") },
              { key: "no", label: "反对", variant: proposal.myVote?.choice === "no" ? "primary" as const : "secondary" as const, size: "sm" as const, disabled: saving, onClick: () => onVote(proposal.id, "no") },
              { key: "abstain", label: "弃权", variant: proposal.myVote?.choice === "abstain" ? "primary" as const : "secondary" as const, size: "sm" as const, disabled: saving, onClick: () => onVote(proposal.id, "abstain") },
            ] : []),
            ...(meeting.permissions.canEdit && proposal.status === "open" ? [{ key: "close", label: "关闭表决", variant: "secondary" as const, size: "sm" as const, disabled: saving, onClick: () => onClose(proposal.id) }] : []),
            ...(meeting.permissions.canEdit && proposal.status === "passed" ? [{ key: "decision", label: "生成决议", variant: "secondary" as const, size: "sm" as const, disabled: saving, onClick: () => onDecision(proposal) }] : []),
          ])} />
        </div>)}
    </div>;
}

export function DecisionList({
  decisions,
}: {
  decisions: MeetingDetail["decisions"];
}) {
  if (decisions.length === 0) return <EmptyLine text="暂无决议" />;
  return <div className="space-y-2">
      {decisions.map(decision => <div key={decision.id} className="rounded-md border border-slate-100 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">{decisionKindLabel(decision.kind)}</span>
            <span className="truncate text-sm font-medium text-slate-900">{decision.title}</span>
          </div>
          {decision.content && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{decision.content}</p>}
          <div className="mt-2 text-xs text-slate-400">ID {decision.id}{decision.effectiveDate ? ` · ${decision.effectiveDate}` : ""}</div>
        </div>)}
    </div>;
}

export function CandidateList({
  meeting,
  actionDrafts,
  saving,
  onDraftChange,
  onAction,
}: {
  meeting: MeetingDetail;
  actionDrafts: Record<number, ActionDraft>;
  saving: boolean;
  onDraftChange: (candidateId: number, draft: ActionDraft) => void;
  onAction: (candidateId: number, action: string, draft: ActionDraft) => void;
}) {
  if (meeting.actionCandidates.length === 0) return <EmptyLine text="暂无行动候选" />;
  return <div className="space-y-3">
      {meeting.actionCandidates.map(candidate => {
      const draft = actionDrafts[candidate.id] || emptyActionDraft();
      return <div key={candidate.id} className="rounded-md border border-slate-100 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-900">{candidate.title}</div>
                {candidate.description && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-500">{candidate.description}</p>}
              </div>
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${candidate.status === "linked" ? "bg-emerald-50 text-emerald-700" : candidate.status === "ignored" ? "bg-slate-100 text-slate-500" : "bg-amber-50 text-amber-700"}`}>{candidateStatusLabel(candidate.status)}</span>
            </div>
            {candidate.status === "linked" && <div className="mt-2 text-xs text-emerald-700">
                {candidate.linkedWorkPlanTitle ? `OKR 计划：${candidate.linkedWorkPlanTitle}` : candidate.linkedProjectTaskTitle ? `项目任务：${candidate.linkedProjectTaskTitle}` : candidate.linkedWorkItemTitle ? `工作项：${candidate.linkedWorkItemTitle}` : "已链接"}
              </div>}
            {meeting.permissions.canEdit && candidate.status === "candidate" && <div className="mt-3 grid gap-2 md:grid-cols-4">
                <InputBox label="OKR 计划 ID" value={draft.workPlanId} onChange={workPlanId => onDraftChange(candidate.id, {
            ...draft,
            workPlanId,
          })} />
                <InputBox label="项目任务 ID" value={draft.projectTaskId} onChange={projectTaskId => onDraftChange(candidate.id, {
            ...draft,
            projectTaskId,
          })} />
                <InputBox label="项目 ID" value={draft.projectId} onChange={projectId => onDraftChange(candidate.id, {
            ...draft,
            projectId,
          })} />
                <InputBox label="工作计划目标" value={draft.targetId} onChange={targetId => onDraftChange(candidate.id, {
            ...draft,
            targetId,
          })} />
                <PageBodySectionSurface className="md:col-span-4" block={createActionsSection("candidate-actions", [
                  { key: "linkWorkPlan", label: "链接 OKR 计划", variant: "secondary", size: "sm", disabled: saving || !draft.workPlanId, onClick: () => onAction(candidate.id, "linkWorkPlan", draft) },
                  { key: "createWorkPlan", label: "创建 OKR 计划", variant: "secondary", size: "sm", disabled: saving, onClick: () => onAction(candidate.id, "createWorkPlan", draft) },
                  { key: "linkProjectTask", label: "链接项目任务", variant: "secondary", size: "sm", disabled: saving || !draft.projectTaskId, onClick: () => onAction(candidate.id, "linkProjectTask", draft) },
                  { key: "createProjectTask", label: "创建项目任务", variant: "secondary", size: "sm", disabled: saving || !draft.projectId, onClick: () => onAction(candidate.id, "createProjectTask", draft) },
                  { key: "ignore", label: "忽略", variant: "danger", size: "sm", disabled: saving, onClick: () => onAction(candidate.id, "ignore", draft) },
                ])} />
              </div>}
          </div>;
    })}
    </div>;
}
