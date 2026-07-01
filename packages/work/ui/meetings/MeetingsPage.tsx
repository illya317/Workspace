"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createFormSection, createMessageSection, createPageBody, PageSurface, useFeedback } from "@workspace/core/ui";
import type { SurfaceToolbarItems } from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import { useMeetingDetailSection } from "./MeetingDetailPanel";
import { meetingCreateFields } from "./meeting-create-fields";
import type { ActionDraft, CreateMeetingDraft, MeetingDetail, MeetingSummary, MeetingType } from "./meeting-types";
import { emptyMeetingDraft, formatDateTime, parseIdList, requestJson } from "./meeting-utils";

export default function MeetingsPage({
  user,
  canCreate,
}: {
  user: SessionUser;
  canCreate: boolean;
}) {
  const [types, setTypes] = useState<MeetingType[]>([]);
  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [sideOpen, setSideOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { notify } = useFeedback();
  const setToast = useCallback((toast: { type: "success" | "error"; message: string }) => {
    notify(toast.message, toast.type);
  }, [notify]);
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
    targetKind: "work_plan",
  });
  const [actionDrafts, setActionDrafts] = useState<Record<number, ActionDraft>>({});

  const filteredMeetings = useMemo(() => typeFilter ? meetings.filter(item => String(item.typeId) === typeFilter) : [], [meetings, typeFilter]);
  const meetingDetailSection = useMeetingDetailSection({
    meeting: meeting ?? emptyMeetingDetail(),
    saving,
    user,
    actionDrafts,
    participantDraft,
    agendaDraft,
    minuteDraft,
    proposalDraft,
    decisionDraft,
    candidateDraft,
    onUpdate: (body, success) => void handleUpdateMeeting(body, success),
    onMutate: mutate,
    onActionDraftsChange: setActionDrafts,
    onParticipantDraftChange: setParticipantDraft,
    onAgendaDraftChange: setAgendaDraft,
    onMinuteDraftChange: setMinuteDraft,
    onProposalDraftChange: setProposalDraft,
    onDecisionDraftChange: setDecisionDraft,
    onCandidateDraftChange: setCandidateDraft,
  });

  const loadMeetings = useCallback(async () => {
    setLoading(true);
    try {
      const query = typeFilter ? `?typeId=${typeFilter}` : "";
      const data = await requestJson<{
        types: MeetingType[];
        meetings: MeetingSummary[];
      }>(`/api/modules/work/meetings${query}`);
      const nextTypes = data.types || [];
      setTypes(nextTypes);
      setMeetings(data.meetings || []);
      setTypeFilter(current => current && nextTypes.some(type => String(type.id) === current)
        ? current
        : String(nextTypes[0]?.id || ""));
      setCreateDraft(current => current.typeId ? current : {
        ...current,
        typeId: String(nextTypes[0]?.id || ""),
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
  }, [setToast, typeFilter]);

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
  }, [setToast]);

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
    if (!canCreate) return;
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

  const toolbarItems: SurfaceToolbarItems = [{
    kind: "option-group",
    key: "type-filter",
    ariaLabel: "会议类型",
    presentation: "segmented",
    value: typeFilter,
    options: types.map(type => ({
      value: String(type.id),
      label: type.name,
    })),
    onChange: setTypeFilter,
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

  return (
    <PageSurface kind="standard"
      toolbar={{ items: toolbarItems }}
      body={{
        kind: "section",
        layout: "split",
        left: {
          kind: "selector",
          selector: {
            kind: "list",
            title: "会议列表",
            loading,
            loadingText: "加载中...",
            emptyText: "暂无会议",
            items: filteredMeetings,
            selectedId,
            onSelect: (item: MeetingSummary) => setSelectedId(item.id),
            getKey: (item: MeetingSummary) => item.id,
            renderItem: (item: MeetingSummary) => ({
              title: item.title,
              subtitle: `${item.typeName} · ${formatDateTime(item.startAt) || "未定时间"}`,
              trailing: item.status,
              meta: [`议题 ${item.counts.agendaItems}`, `表决 ${item.counts.proposals}`, `决议 ${item.counts.decisions}`],
            }),
          },
        },
        right: createPageBody([
          ...(creating && canCreate ? [createFormSection("create-meeting", {
              kind: "fields" as const,
              content: {
                items: meetingCreateFields(createDraft, types, setCreateDraft),
                layout: { columns: 3 as const },
              },
              commands: [
                { key: "cancel", label: "取消", icon: "cancel", disabled: saving, onClick: () => setCreating(false) },
                { key: "create", label: saving ? "创建中..." : "创建会议", icon: "add", variant: "primary" as const, disabled: saving || !createDraft.title.trim() || !createDraft.typeId, onClick: () => void handleCreateMeeting() },
              ],
            })] : []),
          meeting
            ? meetingDetailSection
            : createMessageSection("meeting-empty", {
                content: detailLoading ? "加载中..." : "暂无会议",
                tone: "muted"
              }),
        ], {
        commands: canCreate ? [{
          key: "create",
          label: creating ? "收起新建" : "新建会议",
          icon: "add",
          variant: creating ? "secondary" : "primary",
          disabled: saving,
          onClick: () => setCreating((current) => !current),
        }] : undefined,
        }),
        sideOpen,
        drawerOpen,
        onSideOpenChange: setSideOpen,
        onDrawerOpenChange: setDrawerOpen,
        sideLabel: "会议列表",
        splitRatio: [2, 8],
      }}
    />
  );
}

function emptyMeetingDetail(): MeetingDetail {
  return {
    id: 0,
    typeId: 0,
    typeName: "",
    title: "",
    description: "",
    startAt: null,
    endAt: null,
    location: "",
    visibility: "participants_only",
    status: "",
    ownerUserId: null,
    ownerName: null,
    secretaryUserId: null,
    secretaryName: null,
    participantCount: 0,
    counts: {
      agendaItems: 0,
      minuteEntries: 0,
      proposals: 0,
      decisions: 0,
      actionCandidates: 0,
    },
    participants: [],
    permissions: {
      canView: false,
      canEdit: false,
      canManage: false,
      canDelete: false,
      canVote: false,
      canApprove: false,
      canViewAll: false,
      participantRole: null,
    },
    seriesId: null,
    seriesTitle: null,
    agendaItems: [],
    minuteEntries: [],
    proposals: [],
    decisions: [],
    actionCandidates: [],
  };
}
