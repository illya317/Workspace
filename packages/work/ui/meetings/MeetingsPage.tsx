/* eslint-disable max-lines */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { workspacePath } from "@workspace/core/routing";
import { DatabasePageFrame, EmptyStateCard, SelectField, Toast, ToolbarOptionGroup } from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";

type ToastState = { type: "success" | "error"; message: string } | null;

type MeetingType = {
  id: number;
  key: string;
  name: string;
  description: string | null;
  defaultVisibility: string;
};

type MeetingSummary = {
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

type MeetingParticipant = {
  id: number;
  userId: number;
  userName: string | null;
  role: string;
  canVote: boolean;
  attendanceStatus: string;
};

type MeetingPermission = {
  canView: boolean;
  canEdit: boolean;
  canManage: boolean;
  canDelete: boolean;
  canVote: boolean;
  canViewAll: boolean;
  participantRole: string | null;
};

type MeetingDetail = MeetingSummary & {
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
    tally: { yes: number; no: number; abstain: number; total: number };
    myVote: { choice: string; note: string } | null;
    votes: Array<{ id: number; voterUserId: number; voterName: string | null; choice: string; note: string; updatedAt: string }>;
    decisions: Array<{ id: number; title: string; kind: string }>;
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
    linkedProjectTaskId: number | null;
    linkedProjectTaskTitle: string | null;
    linkedProjectId: number | null;
    linkedProjectName: string | null;
  }>;
};

type CreateMeetingDraft = {
  typeId: string;
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  location: string;
  visibility: "participants_only" | "public";
  participantUserIds: string;
};

type ActionDraft = {
  workItemId: string;
  projectTaskId: string;
  projectId: string;
  targetType: string;
  targetId: string;
};

const ROLE_OPTIONS = [
  { value: "participant", label: "参会" },
  { value: "voter", label: "投票" },
  { value: "secretary", label: "记录" },
  { value: "owner", label: "主持" },
  { value: "observer", label: "旁听" },
];

const DECISION_KIND_OPTIONS = [
  { value: "decision", label: "决定" },
  { value: "resolution", label: "决议" },
  { value: "guidance", label: "指导" },
];

export default function MeetingsPage({ user }: { user: SessionUser }) {
  const [types, setTypes] = useState<MeetingType[]>([]);
  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [createDraft, setCreateDraft] = useState<CreateMeetingDraft>(() => emptyMeetingDraft());
  const [participantDraft, setParticipantDraft] = useState({ userId: "", role: "participant", canVote: false });
  const [agendaDraft, setAgendaDraft] = useState({ title: "", description: "" });
  const [minuteDraft, setMinuteDraft] = useState({ agendaItemId: "", content: "" });
  const [proposalDraft, setProposalDraft] = useState({ agendaItemId: "", title: "", content: "", voteVisibility: "named", minVotesRequired: "" });
  const [decisionDraft, setDecisionDraft] = useState({ agendaItemId: "", proposalId: "", kind: "decision", title: "", content: "", effectiveDate: "" });
  const [candidateDraft, setCandidateDraft] = useState({ agendaItemId: "", decisionId: "", title: "", description: "", targetKind: "work_item" });
  const [actionDrafts, setActionDrafts] = useState<Record<number, ActionDraft>>({});

  const filteredMeetings = useMemo(
    () => typeFilter === "all" ? meetings : meetings.filter((item) => String(item.typeId) === typeFilter),
    [meetings, typeFilter],
  );

  const loadMeetings = useCallback(async () => {
    setLoading(true);
    try {
      const query = typeFilter === "all" ? "" : `?typeId=${typeFilter}`;
      const data = await requestJson<{ types: MeetingType[]; meetings: MeetingSummary[] }>(`/api/modules/work/meetings${query}`);
      setTypes(data.types || []);
      setMeetings(data.meetings || []);
      setCreateDraft((current) => current.typeId ? current : { ...current, typeId: String(data.types?.[0]?.id || "") });
      setSelectedId((current) => {
        if (current && data.meetings.some((item) => item.id === current)) return current;
        return data.meetings[0]?.id ?? null;
      });
    } catch (err) {
      setToast({ type: "error", message: err instanceof Error ? err.message : "加载会议失败" });
    } finally {
      setLoading(false);
    }
  }, [typeFilter]);

  const loadDetail = useCallback(async (id: number) => {
    setDetailLoading(true);
    try {
      const data = await requestJson<{ meeting: MeetingDetail }>(`/api/modules/work/meetings/${id}`);
      setMeeting(data.meeting);
    } catch (err) {
      setToast({ type: "error", message: err instanceof Error ? err.message : "加载会议详情失败" });
      setMeeting(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => { void loadMeetings(); }, [loadMeetings]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else setMeeting(null);
  }, [loadDetail, selectedId]);

  async function mutate<T>(path: string, body: Record<string, unknown>, success: string, after?: (data: T) => void) {
    if (!meeting && !path.endsWith("/meetings")) return;
    setSaving(true);
    try {
      const data = await requestJson<T>(path, { method: "POST", body });
      after?.(data);
      if ((data as { meeting?: MeetingDetail }).meeting) setMeeting((data as { meeting: MeetingDetail }).meeting);
      setToast({ type: "success", message: success });
      await loadMeetings();
    } catch (err) {
      setToast({ type: "error", message: err instanceof Error ? err.message : success.replace("已", "失败：") });
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateMeeting() {
    if (!createDraft.title.trim() || !createDraft.typeId) return;
    setSaving(true);
    try {
      const data = await requestJson<{ meeting: MeetingDetail }>("/api/modules/work/meetings", {
        method: "POST",
        body: {
          typeId: createDraft.typeId,
          title: createDraft.title,
          description: createDraft.description,
          startAt: createDraft.startAt || null,
          endAt: createDraft.endAt || null,
          location: createDraft.location,
          visibility: createDraft.visibility,
          participantUserIds: parseIdList(createDraft.participantUserIds),
        },
      });
      setCreating(false);
      setCreateDraft(emptyMeetingDraft(String(types[0]?.id || "")));
      setMeeting(data.meeting);
      setSelectedId(data.meeting.id);
      setToast({ type: "success", message: "会议已创建" });
      await loadMeetings();
    } catch (err) {
      setToast({ type: "error", message: err instanceof Error ? err.message : "新建会议失败" });
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateMeeting(body: Record<string, unknown>, success: string) {
    if (!meeting) return;
    setSaving(true);
    try {
      const data = await requestJson<{ meeting: MeetingDetail }>(`/api/modules/work/meetings/${meeting.id}`, { method: "PUT", body });
      setMeeting(data.meeting);
      setToast({ type: "success", message: success });
      await loadMeetings();
    } catch (err) {
      setToast({ type: "error", message: err instanceof Error ? err.message : "保存会议失败" });
    } finally {
      setSaving(false);
    }
  }

  const selectedType = types.find((item) => item.id === Number(createDraft.typeId));
  const canEdit = Boolean(meeting?.permissions.canEdit);

  return (
    <DatabasePageFrame>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
          <ToolbarOptionGroup
            ariaLabel="会议类型"
            value={typeFilter}
            options={[{ value: "all", label: "全部会议" }, ...types.map((type) => ({ value: String(type.id), label: type.name }))]}
            onChange={setTypeFilter}
          />
          <div className="flex items-center gap-2">
            <button type="button" className={secondaryButtonClass} onClick={() => void loadMeetings()} disabled={loading || saving}>刷新</button>
            <button type="button" className={primaryButtonClass} onClick={() => setCreating(true)} disabled={saving}>新建会议</button>
          </div>
        </div>

        {creating && (
          <section className="rounded-lg border border-emerald-200 bg-white p-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <SelectBox label="会议类型" value={createDraft.typeId} options={types.map((type) => ({ value: String(type.id), label: type.name }))} onChange={(typeId) => setCreateDraft((draft) => ({ ...draft, typeId }))} />
              <InputBox label="会议主题" value={createDraft.title} onChange={(title) => setCreateDraft((draft) => ({ ...draft, title }))} />
              <InputBox label="地点" value={createDraft.location} onChange={(location) => setCreateDraft((draft) => ({ ...draft, location }))} />
              <InputBox label="开始时间" type="datetime-local" value={createDraft.startAt} onChange={(startAt) => setCreateDraft((draft) => ({ ...draft, startAt }))} />
              <InputBox label="结束时间" type="datetime-local" value={createDraft.endAt} onChange={(endAt) => setCreateDraft((draft) => ({ ...draft, endAt }))} />
              <SelectBox label="可见性" value={createDraft.visibility} options={[{ value: "participants_only", label: selectedType?.defaultVisibility === "public" ? "参会人可见" : "参会人可见" }, { value: "public", label: "模块内公开" }]} onChange={(visibility) => setCreateDraft((draft) => ({ ...draft, visibility: visibility as CreateMeetingDraft["visibility"] }))} />
              <InputBox label="参会用户 ID" value={createDraft.participantUserIds} onChange={(participantUserIds) => setCreateDraft((draft) => ({ ...draft, participantUserIds }))} />
              <InputBox label="说明" value={createDraft.description} onChange={(description) => setCreateDraft((draft) => ({ ...draft, description }))} className="xl:col-span-2" />
            </div>
            <FormActions saving={saving} submitLabel="保存会议" onSubmit={() => void handleCreateMeeting()} onCancel={() => setCreating(false)} disabled={!createDraft.title.trim() || !createDraft.typeId} />
          </section>
        )}

        <div className="grid gap-4 xl:grid-cols-[20rem_minmax(0,1fr)]">
          <MeetingList
            loading={loading}
            meetings={filteredMeetings}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          <main className="min-w-0">
            {!meeting ? (
              <EmptyStateCard compact={false}>{detailLoading ? "加载中..." : "暂无会议"}</EmptyStateCard>
            ) : (
              <div className="space-y-4">
                <MeetingHeader meeting={meeting} saving={saving} onUpdate={(body, success) => void handleUpdateMeeting(body, success)} />
                <div className="grid gap-4 2xl:grid-cols-2">
                  <Section title="参会人">
                    <ParticipantList participants={meeting.participants} />
                    {canEdit && (
                      <InlineForm>
                        <InputBox label="用户 ID" value={participantDraft.userId} onChange={(userId) => setParticipantDraft((draft) => ({ ...draft, userId }))} />
                        <SelectBox label="角色" value={participantDraft.role} options={ROLE_OPTIONS} onChange={(role) => setParticipantDraft((draft) => ({ ...draft, role, canVote: role === "owner" || role === "voter" }))} />
                        <label className="flex items-end gap-2 pb-2 text-sm text-slate-600">
                          <input type="checkbox" checked={participantDraft.canVote} onChange={(event) => setParticipantDraft((draft) => ({ ...draft, canVote: event.target.checked }))} />
                          可投票
                        </label>
                        <button type="button" className={primaryButtonClass} disabled={saving || !participantDraft.userId} onClick={() => void mutate<{ meeting: MeetingDetail }>(`/api/modules/work/meetings/${meeting.id}/participants`, participantDraft, "参会人已保存")}>保存参会人</button>
                      </InlineForm>
                    )}
                  </Section>

                  <Section title="议程">
                    <SimpleList emptyText="暂无议题" items={meeting.agendaItems.map((item) => ({
                      id: item.id,
                      title: item.title,
                      meta: item.description,
                    }))} />
                    {canEdit && (
                      <InlineForm>
                        <InputBox label="议题" value={agendaDraft.title} onChange={(title) => setAgendaDraft((draft) => ({ ...draft, title }))} />
                        <InputBox label="说明" value={agendaDraft.description} onChange={(description) => setAgendaDraft((draft) => ({ ...draft, description }))} />
                        <button
                          type="button"
                          className={primaryButtonClass}
                          disabled={saving || !agendaDraft.title.trim()}
                          onClick={() => void mutate<{ meeting: MeetingDetail }>(`/api/modules/work/meetings/${meeting.id}/agenda`, agendaDraft, "议题已新增", () => setAgendaDraft({ title: "", description: "" }))}
                        >
                          新增议题
                        </button>
                      </InlineForm>
                    )}
                  </Section>

                  <Section title="纪要">
                    <SimpleList emptyText="暂无纪要" items={meeting.minuteEntries.map((item) => ({
                      id: item.id,
                      title: agendaTitle(meeting, item.agendaItemId) || "会议纪要",
                      meta: item.content,
                    }))} />
                    {canEdit && (
                      <InlineForm>
                        <AgendaSelect meeting={meeting} value={minuteDraft.agendaItemId} onChange={(agendaItemId) => setMinuteDraft((draft) => ({ ...draft, agendaItemId }))} />
                        <InputBox label="内容" value={minuteDraft.content} onChange={(content) => setMinuteDraft((draft) => ({ ...draft, content }))} className="md:col-span-2" />
                        <button
                          type="button"
                          className={primaryButtonClass}
                          disabled={saving || !minuteDraft.content.trim()}
                          onClick={() => void mutate<{ meeting: MeetingDetail }>(`/api/modules/work/meetings/${meeting.id}/minutes`, normalizeOptionalIds(minuteDraft), "纪要已记录", () => setMinuteDraft({ agendaItemId: "", content: "" }))}
                        >
                          记录纪要
                        </button>
                      </InlineForm>
                    )}
                  </Section>

                  <Section title="表决">
                    <ProposalList
                      meeting={meeting}
                      saving={saving}
                      onVote={(proposalId, choice) => void mutate<{ meeting: MeetingDetail }>(`/api/modules/work/meetings/${meeting.id}/votes`, { action: "cast", proposalId, choice }, "投票已保存")}
                      onClose={(proposalId) => void mutate<{ meeting: MeetingDetail }>(`/api/modules/work/meetings/${meeting.id}/votes`, { action: "close", proposalId }, "表决已关闭")}
                      onDecision={(proposal) => {
                        setDecisionDraft({
                          agendaItemId: proposal.agendaItemId ? String(proposal.agendaItemId) : "",
                          proposalId: String(proposal.id),
                          kind: "resolution",
                          title: proposal.title,
                          content: proposal.content,
                          effectiveDate: "",
                        });
                      }}
                    />
                    {canEdit && (
                      <InlineForm>
                        <AgendaSelect meeting={meeting} value={proposalDraft.agendaItemId} onChange={(agendaItemId) => setProposalDraft((draft) => ({ ...draft, agendaItemId }))} />
                        <InputBox label="表决事项" value={proposalDraft.title} onChange={(title) => setProposalDraft((draft) => ({ ...draft, title }))} />
                        <SelectBox label="展示方式" value={proposalDraft.voteVisibility} options={[{ value: "named", label: "实名" }, { value: "anonymous", label: "匿名展示" }]} onChange={(voteVisibility) => setProposalDraft((draft) => ({ ...draft, voteVisibility }))} />
                        <InputBox label="最低人数" value={proposalDraft.minVotesRequired} onChange={(minVotesRequired) => setProposalDraft((draft) => ({ ...draft, minVotesRequired }))} />
                        <InputBox label="内容" value={proposalDraft.content} onChange={(content) => setProposalDraft((draft) => ({ ...draft, content }))} className="md:col-span-2" />
                        <button
                          type="button"
                          className={primaryButtonClass}
                          disabled={saving || !proposalDraft.title.trim()}
                          onClick={() => void mutate<{ meeting: MeetingDetail }>(`/api/modules/work/meetings/${meeting.id}/votes`, { action: "create", ...normalizeOptionalIds(proposalDraft) }, "表决已创建", () => setProposalDraft({ agendaItemId: "", title: "", content: "", voteVisibility: "named", minVotesRequired: "" }))}
                        >
                          创建表决
                        </button>
                      </InlineForm>
                    )}
                  </Section>

                  <Section title="决议 / 指导">
                    <DecisionList decisions={meeting.decisions} />
                    {canEdit && (
                      <InlineForm>
                        <AgendaSelect meeting={meeting} value={decisionDraft.agendaItemId} onChange={(agendaItemId) => setDecisionDraft((draft) => ({ ...draft, agendaItemId }))} />
                        <SelectBox label="类型" value={decisionDraft.kind} options={DECISION_KIND_OPTIONS} onChange={(kind) => setDecisionDraft((draft) => ({ ...draft, kind }))} />
                        <InputBox label="生效日期" type="date" value={decisionDraft.effectiveDate} onChange={(effectiveDate) => setDecisionDraft((draft) => ({ ...draft, effectiveDate }))} />
                        <InputBox label="标题" value={decisionDraft.title} onChange={(title) => setDecisionDraft((draft) => ({ ...draft, title }))} />
                        <InputBox label="内容" value={decisionDraft.content} onChange={(content) => setDecisionDraft((draft) => ({ ...draft, content }))} className="md:col-span-2" />
                        <button
                          type="button"
                          className={primaryButtonClass}
                          disabled={saving || !decisionDraft.title.trim()}
                          onClick={() => void mutate<{ meeting: MeetingDetail }>(`/api/modules/work/meetings/${meeting.id}/decisions`, normalizeOptionalIds(decisionDraft), "决议已保存", () => setDecisionDraft({ agendaItemId: "", proposalId: "", kind: "decision", title: "", content: "", effectiveDate: "" }))}
                        >
                          保存决议
                        </button>
                      </InlineForm>
                    )}
                  </Section>

                  <Section title="行动候选">
                    <CandidateList
                      meeting={meeting}
                      actionDrafts={actionDrafts}
                      saving={saving}
                      onDraftChange={(candidateId, draft) => setActionDrafts((current) => ({ ...current, [candidateId]: draft }))}
                      onAction={(candidateId, action, draft) => void mutate<{ meeting: MeetingDetail }>(`/api/modules/work/meetings/${meeting.id}/action-candidates`, actionPayload(candidateId, action, draft, user), "行动候选已处理")}
                    />
                    {canEdit && (
                      <InlineForm>
                        <AgendaSelect meeting={meeting} value={candidateDraft.agendaItemId} onChange={(agendaItemId) => setCandidateDraft((draft) => ({ ...draft, agendaItemId }))} />
                        <DecisionSelect meeting={meeting} value={candidateDraft.decisionId} onChange={(decisionId) => setCandidateDraft((draft) => ({ ...draft, decisionId }))} />
                        <SelectBox label="目标" value={candidateDraft.targetKind} options={[{ value: "work_item", label: "工作计划" }, { value: "project_task", label: "项目任务" }]} onChange={(targetKind) => setCandidateDraft((draft) => ({ ...draft, targetKind }))} />
                        <InputBox label="候选事项" value={candidateDraft.title} onChange={(title) => setCandidateDraft((draft) => ({ ...draft, title }))} />
                        <InputBox label="说明" value={candidateDraft.description} onChange={(description) => setCandidateDraft((draft) => ({ ...draft, description }))} className="md:col-span-2" />
                        <button
                          type="button"
                          className={primaryButtonClass}
                          disabled={saving || !candidateDraft.title.trim()}
                          onClick={() => void mutate<{ meeting: MeetingDetail }>(`/api/modules/work/meetings/${meeting.id}/action-candidates`, normalizeOptionalIds(candidateDraft), "行动候选已新增", () => setCandidateDraft({ agendaItemId: "", decisionId: "", title: "", description: "", targetKind: "work_item" }))}
                        >
                          新增候选
                        </button>
                      </InlineForm>
                    )}
                  </Section>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
      <Toast type={toast?.type} message={toast?.message || ""} show={!!toast} onClose={() => setToast(null)} />
    </DatabasePageFrame>
  );
}

function MeetingList({
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
    <aside className="min-w-0 rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">会议列表</div>
      <div className="max-h-[calc(100vh-14rem)] overflow-y-auto p-2">
        {loading ? (
          <div className="px-3 py-8 text-center text-sm text-slate-400">加载中...</div>
        ) : meetings.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-slate-400">暂无会议</div>
        ) : meetings.map((meeting) => (
          <button
            key={meeting.id}
            type="button"
            onClick={() => onSelect(meeting.id)}
            className={`mb-2 w-full rounded-md border px-3 py-2 text-left transition ${selectedId === meeting.id ? "border-emerald-300 bg-emerald-50" : "border-transparent hover:border-slate-200 hover:bg-slate-50"}`}
          >
            <div className="flex min-w-0 items-center justify-between gap-2">
              <span className="truncate text-sm font-medium text-slate-900">{meeting.title}</span>
              <StatusPill status={meeting.status} />
            </div>
            <div className="mt-1 truncate text-xs text-slate-500">{meeting.typeName} · {formatDateTime(meeting.startAt) || "未定时间"}</div>
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-slate-500">
              <span className="rounded bg-slate-100 px-1.5 py-0.5">议题 {meeting.counts.agendaItems}</span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5">表决 {meeting.counts.proposals}</span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5">决议 {meeting.counts.decisions}</span>
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}

function MeetingHeader({
  meeting,
  saving,
  onUpdate,
}: {
  meeting: MeetingDetail;
  saving: boolean;
  onUpdate: (body: Record<string, unknown>, success: string) => void;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">{meeting.typeName}</span>
            <StatusPill status={meeting.status} />
            <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">{meeting.visibility === "public" ? "模块内公开" : "参会人可见"}</span>
          </div>
          <h2 className="truncate text-xl font-semibold text-slate-950">{meeting.title}</h2>
          <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-500">
            <span>{formatDateTime(meeting.startAt) || "未定时间"}</span>
            {meeting.location && <span>{meeting.location}</span>}
            <span>主持：{meeting.ownerName || "未设置"}</span>
            <span>记录：{meeting.secretaryName || "未设置"}</span>
          </div>
          {meeting.description && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{meeting.description}</p>}
        </div>
        {meeting.permissions.canEdit && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondaryButtonClass} disabled={saving || meeting.status === "in_progress"} onClick={() => onUpdate({ status: "in_progress" }, "会议已开始")}>开始</button>
            <button type="button" className={secondaryButtonClass} disabled={saving || meeting.status === "closed"} onClick={() => onUpdate({ status: "closed" }, "会议已关闭")}>关闭</button>
            <button type="button" className={secondaryButtonClass} disabled={saving || meeting.visibility === "participants_only"} onClick={() => onUpdate({ visibility: "participants_only" }, "可见性已更新")}>参会可见</button>
            <button type="button" className={secondaryButtonClass} disabled={saving || meeting.visibility === "public"} onClick={() => onUpdate({ visibility: "public" }, "可见性已更新")}>公开</button>
          </div>
        )}
      </div>
    </section>
  );
}

function ParticipantList({ participants }: { participants: MeetingParticipant[] }) {
  if (participants.length === 0) return <EmptyLine text="暂无参会人" />;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {participants.map((participant) => (
        <div key={participant.id} className="rounded-md border border-slate-100 px-3 py-2">
          <div className="truncate text-sm font-medium text-slate-800">{participant.userName || `用户 ${participant.userId}`}</div>
          <div className="mt-1 text-xs text-slate-500">{roleLabel(participant.role)} · {participant.canVote ? "可投票" : "不可投票"}</div>
        </div>
      ))}
    </div>
  );
}

function ProposalList({
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
  return (
    <div className="space-y-3">
      {meeting.proposals.map((proposal) => (
        <div key={proposal.id} className="rounded-md border border-slate-100 p-3">
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
          {proposal.votes.length > 0 && (
            <div className="mt-2 grid gap-1 text-xs text-slate-500">
              {proposal.votes.map((vote) => <span key={vote.id}>{vote.voterName || `用户 ${vote.voterUserId}`}：{voteChoiceLabel(vote.choice)}</span>)}
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {meeting.permissions.canVote && proposal.status === "open" && (
              <>
                <button type="button" className={smallButtonClass(proposal.myVote?.choice === "yes")} disabled={saving} onClick={() => onVote(proposal.id, "yes")}>赞成</button>
                <button type="button" className={smallButtonClass(proposal.myVote?.choice === "no")} disabled={saving} onClick={() => onVote(proposal.id, "no")}>反对</button>
                <button type="button" className={smallButtonClass(proposal.myVote?.choice === "abstain")} disabled={saving} onClick={() => onVote(proposal.id, "abstain")}>弃权</button>
              </>
            )}
            {meeting.permissions.canEdit && proposal.status === "open" && <button type="button" className={secondaryButtonClass} disabled={saving} onClick={() => onClose(proposal.id)}>关闭表决</button>}
            {meeting.permissions.canEdit && proposal.status === "passed" && <button type="button" className={secondaryButtonClass} disabled={saving} onClick={() => onDecision(proposal)}>生成决议</button>}
          </div>
        </div>
      ))}
    </div>
  );
}

function DecisionList({ decisions }: { decisions: MeetingDetail["decisions"] }) {
  if (decisions.length === 0) return <EmptyLine text="暂无决议" />;
  return (
    <div className="space-y-2">
      {decisions.map((decision) => (
        <div key={decision.id} className="rounded-md border border-slate-100 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">{decisionKindLabel(decision.kind)}</span>
            <span className="truncate text-sm font-medium text-slate-900">{decision.title}</span>
          </div>
          {decision.content && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{decision.content}</p>}
          <div className="mt-2 text-xs text-slate-400">ID {decision.id}{decision.effectiveDate ? ` · ${decision.effectiveDate}` : ""}</div>
        </div>
      ))}
    </div>
  );
}

function CandidateList({
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
  return (
    <div className="space-y-3">
      {meeting.actionCandidates.map((candidate) => {
        const draft = actionDrafts[candidate.id] || emptyActionDraft();
        return (
          <div key={candidate.id} className="rounded-md border border-slate-100 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-900">{candidate.title}</div>
                {candidate.description && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-500">{candidate.description}</p>}
              </div>
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${candidate.status === "linked" ? "bg-emerald-50 text-emerald-700" : candidate.status === "ignored" ? "bg-slate-100 text-slate-500" : "bg-amber-50 text-amber-700"}`}>{candidateStatusLabel(candidate.status)}</span>
            </div>
            {candidate.status === "linked" && (
              <div className="mt-2 text-xs text-emerald-700">
                {candidate.linkedWorkItemTitle ? `工作项：${candidate.linkedWorkItemTitle}` : candidate.linkedProjectTaskTitle ? `项目任务：${candidate.linkedProjectTaskTitle}` : "已链接"}
              </div>
            )}
            {meeting.permissions.canEdit && candidate.status === "candidate" && (
              <div className="mt-3 grid gap-2 md:grid-cols-4">
                <InputBox label="工作项 ID" value={draft.workItemId} onChange={(workItemId) => onDraftChange(candidate.id, { ...draft, workItemId })} />
                <InputBox label="项目任务 ID" value={draft.projectTaskId} onChange={(projectTaskId) => onDraftChange(candidate.id, { ...draft, projectTaskId })} />
                <InputBox label="项目 ID" value={draft.projectId} onChange={(projectId) => onDraftChange(candidate.id, { ...draft, projectId })} />
                <InputBox label="工作计划目标" value={draft.targetId} onChange={(targetId) => onDraftChange(candidate.id, { ...draft, targetId })} />
                <div className="flex flex-wrap items-end gap-2 md:col-span-4">
                  <button type="button" className={secondaryButtonClass} disabled={saving || !draft.workItemId} onClick={() => onAction(candidate.id, "linkWorkItem", draft)}>链接工作项</button>
                  <button type="button" className={secondaryButtonClass} disabled={saving} onClick={() => onAction(candidate.id, "createWorkItem", draft)}>创建工作项</button>
                  <button type="button" className={secondaryButtonClass} disabled={saving || !draft.projectTaskId} onClick={() => onAction(candidate.id, "linkProjectTask", draft)}>链接项目任务</button>
                  <button type="button" className={secondaryButtonClass} disabled={saving || !draft.projectId} onClick={() => onAction(candidate.id, "createProjectTask", draft)}>创建项目任务</button>
                  <button type="button" className={dangerButtonClass} disabled={saving} onClick={() => onAction(candidate.id, "ignore", draft)}>忽略</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function InlineForm({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 border-t border-slate-100 pt-3 md:grid-cols-3">{children}</div>;
}

function InputBox({
  label,
  value,
  onChange,
  type = "text",
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  className?: string;
}) {
  return (
    <label className={`block min-w-0 text-sm ${className}`}>
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-400"
      />
    </label>
  );
}

function SelectBox({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="min-w-0 text-sm">
      <SelectField label={label} value={value} options={options} onChange={onChange} className="w-full" selectClassName="w-full" searchable={options.length > 6} />
    </div>
  );
}

function AgendaSelect({ meeting, value, onChange }: { meeting: MeetingDetail; value: string; onChange: (value: string) => void }) {
  return (
    <SelectBox
      label="关联议题"
      value={value}
      options={[{ value: "", label: "不关联" }, ...meeting.agendaItems.map((item) => ({ value: String(item.id), label: item.title }))]}
      onChange={onChange}
    />
  );
}

function DecisionSelect({ meeting, value, onChange }: { meeting: MeetingDetail; value: string; onChange: (value: string) => void }) {
  return (
    <SelectBox
      label="关联决议"
      value={value}
      options={[{ value: "", label: "不关联" }, ...meeting.decisions.map((item) => ({ value: String(item.id), label: item.title }))]}
      onChange={onChange}
    />
  );
}

function FormActions({
  saving,
  submitLabel,
  disabled,
  onSubmit,
  onCancel,
}: {
  saving: boolean;
  submitLabel: string;
  disabled: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-3 flex justify-end gap-2">
      <button type="button" className={secondaryButtonClass} onClick={onCancel} disabled={saving}>取消</button>
      <button type="button" className={primaryButtonClass} onClick={onSubmit} disabled={saving || disabled}>{submitLabel}</button>
    </div>
  );
}

function SimpleList({ items, emptyText }: { items: Array<{ id: number; title: string; meta?: string | null }>; emptyText: string }) {
  if (items.length === 0) return <EmptyLine text={emptyText} />;
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.id} className="rounded-md border border-slate-100 px-3 py-2">
          <div className="text-sm font-medium text-slate-800">{item.title}</div>
          {item.meta && <div className="mt-1 whitespace-pre-wrap text-sm text-slate-500">{item.meta}</div>}
        </div>
      ))}
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <div className="rounded-md border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-400">{text}</div>;
}

function StatusPill({ status }: { status: string }) {
  const className = status === "closed"
    ? "bg-slate-100 text-slate-600"
    : status === "in_progress"
      ? "bg-sky-50 text-sky-700"
      : status === "passed"
        ? "bg-emerald-50 text-emerald-700"
        : status === "rejected"
          ? "bg-rose-50 text-rose-700"
          : "bg-amber-50 text-amber-700";
  return <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${className}`}>{statusLabel(status)}</span>;
}

async function requestJson<T>(path: string, init?: { method?: string; body?: Record<string, unknown> }): Promise<T> {
  const res = await fetch(workspacePath(path), {
    method: init?.method || "GET",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "请求失败");
  return data as T;
}

function emptyMeetingDraft(typeId = ""): CreateMeetingDraft {
  return {
    typeId,
    title: "",
    description: "",
    startAt: "",
    endAt: "",
    location: "",
    visibility: "participants_only",
    participantUserIds: "",
  };
}

function emptyActionDraft(): ActionDraft {
  return { workItemId: "", projectTaskId: "", projectId: "", targetType: "personal", targetId: "" };
}

function parseIdList(value: string) {
  return value
    .split(/,|，|\s/)
    .map((item) => Number(item.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
}

function normalizeOptionalIds<T extends Record<string, string>>(draft: T) {
  const next: Record<string, unknown> = { ...draft };
  for (const field of ["agendaItemId", "decisionId", "proposalId", "minVotesRequired"]) {
    if (field in next) next[field] = next[field] ? Number(next[field]) : null;
  }
  if ("effectiveDate" in next && !next.effectiveDate) next.effectiveDate = null;
  return next;
}

function actionPayload(candidateId: number, action: string, draft: ActionDraft, user: SessionUser) {
  return {
    action,
    candidateId,
    workItemId: draft.workItemId ? Number(draft.workItemId) : undefined,
    projectTaskId: draft.projectTaskId ? Number(draft.projectTaskId) : undefined,
    projectId: draft.projectId ? Number(draft.projectId) : undefined,
    targetType: draft.targetType || "personal",
    targetId: draft.targetId ? Number(draft.targetId) : user.id,
  };
}

function agendaTitle(meeting: MeetingDetail, agendaItemId: number | null) {
  if (!agendaItemId) return "";
  return meeting.agendaItems.find((item) => item.id === agendaItemId)?.title || "";
}

function formatDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function statusLabel(status: string) {
  if (status === "scheduled") return "已排期";
  if (status === "in_progress") return "进行中";
  if (status === "closed") return "已关闭";
  if (status === "passed") return "通过";
  if (status === "rejected") return "未通过";
  if (status === "open") return "表决中";
  return status || "未知";
}

function roleLabel(role: string) {
  return ROLE_OPTIONS.find((item) => item.value === role)?.label || role;
}

function voteChoiceLabel(choice: string) {
  if (choice === "yes") return "赞成";
  if (choice === "no") return "反对";
  return "弃权";
}

function decisionKindLabel(kind: string) {
  return DECISION_KIND_OPTIONS.find((item) => item.value === kind)?.label || kind;
}

function candidateStatusLabel(status: string) {
  if (status === "linked") return "已链接";
  if (status === "ignored") return "已忽略";
  return "候选";
}

const primaryButtonClass = "rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300";
const secondaryButtonClass = "rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300";
const dangerButtonClass = "rounded-md border border-rose-200 bg-white px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:text-slate-300";

function smallButtonClass(active: boolean) {
  return active
    ? "rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
    : "rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300";
}
