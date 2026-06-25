"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BlockCreatePanel, DatabasePageFrame, EmptyStateCard, Toolbar, ToolbarOptionGroup, Toast } from "@workspace/core/ui";
import type { ToolbarItem } from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import { InputBox, SelectBox } from "./MeetingControls";
import { MeetingDetailPanel } from "./MeetingDetailPanel";
import { MeetingList } from "./MeetingPanels";
import type { ActionDraft, CreateMeetingDraft, MeetingDetail, MeetingSummary, MeetingType, ToastState } from "./meeting-types";
import { emptyMeetingDraft, parseIdList, requestJson } from "./meeting-utils";

export default function MeetingsPage({
  user,
}: {
  user: SessionUser;
}) {
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
  const [participantDraft, setParticipantDraft] = useState({
    userId: "",
    role: "participant",
    canVote: false,
  });
  const [agendaDraft, setAgendaDraft] = useState({
    title: "",
    description: "",
  });
  const [minuteDraft, setMinuteDraft] = useState({
    agendaItemId: "",
    content: "",
  });
  const [proposalDraft, setProposalDraft] = useState({
    agendaItemId: "",
    title: "",
    content: "",
    voteVisibility: "named",
    minVotesRequired: "",
  });
  const [decisionDraft, setDecisionDraft] = useState({
    agendaItemId: "",
    proposalId: "",
    kind: "decision",
    title: "",
    content: "",
    effectiveDate: "",
  });
  const [candidateDraft, setCandidateDraft] = useState({
    agendaItemId: "",
    decisionId: "",
    title: "",
    description: "",
    targetKind: "work_item",
  });
  const [actionDrafts, setActionDrafts] = useState<Record<number, ActionDraft>>({});

  const filteredMeetings = useMemo(() => typeFilter === "all" ? meetings : meetings.filter(item => String(item.typeId) === typeFilter), [meetings, typeFilter]);
  const selectedType = types.find(item => item.id === Number(createDraft.typeId));

  const loadMeetings = useCallback(async () => {
    setLoading(true);
    try {
      const query = typeFilter === "all" ? "" : `?typeId=${typeFilter}`;
      const data = await requestJson<{
        types: MeetingType[];
        meetings: MeetingSummary[];
      }>(`/api/modules/work/meetings${query}`);
      setTypes(data.types || []);
      setMeetings(data.meetings || []);
      setCreateDraft(current => current.typeId ? current : {
        ...current,
        typeId: String(data.types?.[0]?.id || ""),
      });
      setSelectedId(current => {
        if (current && data.meetings.some(item => item.id === current)) return current;
        return data.meetings[0]?.id ?? null;
      });
    } catch (err) {
      setToast({
        type: "error",
        message: err instanceof Error ? err.message : "加载会议失败",
      });
    } finally {
      setLoading(false);
    }
  }, [typeFilter]);

  const loadDetail = useCallback(async (id: number) => {
    setDetailLoading(true);
    try {
      const data = await requestJson<{
        meeting: MeetingDetail;
      }>(`/api/modules/work/meetings/${id}`);
      setMeeting(data.meeting);
    } catch (err) {
      setToast({
        type: "error",
        message: err instanceof Error ? err.message : "加载会议详情失败",
      });
      setMeeting(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMeetings();
  }, [loadMeetings]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else setMeeting(null);
  }, [loadDetail, selectedId]);

  async function mutate<T>(path: string, body: Record<string, unknown>, success: string, after?: (data: T) => void) {
    if (!meeting && !path.endsWith("/meetings")) return;
    setSaving(true);
    try {
      const data = await requestJson<T>(path, {
        method: "POST",
        body,
      });
      after?.(data);
      if ((data as { meeting?: MeetingDetail }).meeting) setMeeting((data as { meeting: MeetingDetail }).meeting);
      setToast({
        type: "success",
        message: success,
      });
      await loadMeetings();
    } catch (err) {
      setToast({
        type: "error",
        message: err instanceof Error ? err.message : success.replace("已", "失败："),
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateMeeting() {
    if (!createDraft.title.trim() || !createDraft.typeId) return;
    setSaving(true);
    try {
      const data = await requestJson<{
        meeting: MeetingDetail;
      }>("/api/modules/work/meetings", {
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
      setToast({
        type: "success",
        message: "会议已创建",
      });
      await loadMeetings();
    } catch (err) {
      setToast({
        type: "error",
        message: err instanceof Error ? err.message : "新建会议失败",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateMeeting(body: Record<string, unknown>, success: string) {
    if (!meeting) return;
    setSaving(true);
    try {
      const data = await requestJson<{
        meeting: MeetingDetail;
      }>(`/api/modules/work/meetings/${meeting.id}`, {
        method: "PUT",
        body,
      });
      setMeeting(data.meeting);
      setToast({
        type: "success",
        message: success,
      });
      await loadMeetings();
    } catch (err) {
      setToast({
        type: "error",
        message: err instanceof Error ? err.message : "保存会议失败",
      });
    } finally {
      setSaving(false);
    }
  }

  const toolbarItems: ToolbarItem[] = [{
    kind: "custom",
    key: "type-filter",
    section: "filter",
    content: <ToolbarOptionGroup ariaLabel="会议类型" value={typeFilter} options={[{
      value: "all",
      label: "全部会议",
    }, ...types.map(type => ({
      value: String(type.id),
      label: type.name,
    }))]} onChange={setTypeFilter} />,
  }, {
    kind: "action-group",
    key: "refresh",
    actions: [{
      key: "refresh",
      kind: "refresh",
      label: "刷新",
      disabled: loading || saving,
      onClick: () => void loadMeetings(),
    }],
  }];

  return <DatabasePageFrame>
      <BlockCreatePanel
        title="会议"
        canCreate
        creating={creating}
        disabled={saving}
        submitting={saving}
        submitDisabled={saving || !createDraft.title.trim() || !createDraft.typeId}
        addLabel="新建会议"
        submitLabel="保存会议"
        onStartCreate={() => setCreating(true)}
        onCancelCreate={() => setCreating(false)}
        onSubmitCreate={() => void handleCreateMeeting()}
        createContent={<MeetingCreateFields
          createDraft={createDraft}
          selectedType={selectedType}
          types={types}
          onChange={setCreateDraft}
        />}
        bodyClassName="p-4"
      >
        <div className="space-y-4">
          <Toolbar items={toolbarItems} />
          <div className="grid gap-4 xl:grid-cols-[20rem_minmax(0,1fr)]">
            <MeetingList loading={loading} meetings={filteredMeetings} selectedId={selectedId} onSelect={setSelectedId} />
            <main className="min-w-0">
              {!meeting ? (
                <EmptyStateCard compact={false}>{detailLoading ? "加载中..." : "暂无会议"}</EmptyStateCard>
              ) : (
                <MeetingDetailPanel
                  meeting={meeting}
                  saving={saving}
                  user={user}
                  actionDrafts={actionDrafts}
                  participantDraft={participantDraft}
                  agendaDraft={agendaDraft}
                  minuteDraft={minuteDraft}
                  proposalDraft={proposalDraft}
                  decisionDraft={decisionDraft}
                  candidateDraft={candidateDraft}
                  onUpdate={(body, success) => void handleUpdateMeeting(body, success)}
                  onMutate={mutate}
                  onActionDraftsChange={setActionDrafts}
                  onParticipantDraftChange={setParticipantDraft}
                  onAgendaDraftChange={setAgendaDraft}
                  onMinuteDraftChange={setMinuteDraft}
                  onProposalDraftChange={setProposalDraft}
                  onDecisionDraftChange={setDecisionDraft}
                  onCandidateDraftChange={setCandidateDraft}
                />
              )}
            </main>
          </div>
        </div>
      </BlockCreatePanel>
      <Toast type={toast?.type} message={toast?.message || ""} show={!!toast} onClose={() => setToast(null)} />
    </DatabasePageFrame>;
}

function MeetingCreateFields({
  createDraft,
  selectedType,
  types,
  onChange,
}: {
  createDraft: CreateMeetingDraft;
  selectedType?: MeetingType;
  types: MeetingType[];
  onChange: (draft: CreateMeetingDraft) => void;
}) {
  return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <SelectBox label="会议类型" value={createDraft.typeId} options={types.map(type => ({
    value: String(type.id),
    label: type.name,
  }))} onChange={typeId => onChange({
    ...createDraft,
    typeId,
  })} />
      <InputBox label="会议主题" value={createDraft.title} onChange={title => onChange({
    ...createDraft,
    title,
  })} />
      <InputBox label="地点" value={createDraft.location} onChange={location => onChange({
    ...createDraft,
    location,
  })} />
      <InputBox label="开始时间" kind="datetime" value={createDraft.startAt} onChange={startAt => onChange({
    ...createDraft,
    startAt,
  })} />
      <InputBox label="结束时间" kind="datetime" value={createDraft.endAt} onChange={endAt => onChange({
    ...createDraft,
    endAt,
  })} />
      <SelectBox label="可见性" value={createDraft.visibility} options={[{
    value: "participants_only",
    label: selectedType?.defaultVisibility === "public" ? "参会人可见" : "参会人可见",
  }, {
    value: "public",
    label: "模块内公开",
  }]} onChange={visibility => onChange({
    ...createDraft,
    visibility: visibility as CreateMeetingDraft["visibility"],
  })} />
      <InputBox label="参会用户 ID" value={createDraft.participantUserIds} onChange={participantUserIds => onChange({
    ...createDraft,
    participantUserIds,
  })} />
      <InputBox label="说明" value={createDraft.description} onChange={description => onChange({
    ...createDraft,
    description,
  })} className="xl:col-span-2" />
    </div>;
}
