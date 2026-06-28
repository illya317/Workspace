"use client";

import { PageSurface, createPageFieldsBlock, createPageInlineFieldsBlock, type PageSurfaceBlockSpec } from "@workspace/core/ui";
import type { SessionUser } from "@workspace/platform/types";
import type { ActionDraft, MeetingDetail } from "./meeting-types";
import { AgendaSelect, DecisionSelect, InlineForm, InputBox, PageBlockSurface, Section, SelectBox, SimpleList } from "./MeetingControls";
import { CandidateList, DecisionList, MeetingHeader, ParticipantList, ProposalList } from "./MeetingPanels";
import { DECISION_KIND_OPTIONS, ROLE_OPTIONS } from "./meeting-types";
import { actionPayload, agendaTitle, normalizeOptionalIds } from "./meeting-utils";

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

export function useMeetingDetailBlock({
  meeting,
  saving,
  user,
  actionDrafts,
  participantDraft,
  agendaDraft,
  minuteDraft,
  proposalDraft,
  decisionDraft,
  candidateDraft,
  onUpdate,
  onMutate,
  onActionDraftsChange,
  onParticipantDraftChange,
  onAgendaDraftChange,
  onMinuteDraftChange,
  onProposalDraftChange,
  onDecisionDraftChange,
  onCandidateDraftChange,
}: MeetingDetailPanelProps): PageSurfaceBlockSpec {
  const canEdit = meeting.permissions.canEdit;

  return {
    kind: "panel",
    key: "meeting-detail",
    bodyClassName: "p-4",
    blocks: [{
      kind: "form",
      key: "meeting-detail-content",
      surface: {
        kind: "fields",
        fields: [{
          kind: "note",
          key: "meeting-detail-composition",
          content: <div className="space-y-4">
      <MeetingHeader meeting={meeting} saving={saving} onUpdate={onUpdate} />
      <div className="grid 2xl:grid-cols-2" style={{ gap: "1rem" }}>
        <Section title="参会人">
          <ParticipantList participants={meeting.participants} />
          {canEdit && <InlineForm>
              <InputBox label="用户 ID" value={participantDraft.userId} onChange={userId => onParticipantDraftChange({
            ...participantDraft,
            userId,
          })} />
              <SelectBox label="角色" value={participantDraft.role} options={ROLE_OPTIONS} onChange={role => onParticipantDraftChange({
            ...participantDraft,
            role,
            canVote: role === "owner" || role === "voter",
          })} />
              <PageBlockSurface className="self-end" block={createPageFieldsBlock("can-vote", [{ key: "canVote", label: "可投票", spec: { valueType: "boolean", control: "boolean", presentation: "checkbox" }, value: participantDraft.canVote, onChange: checked => onParticipantDraftChange({
                ...participantDraft,
                canVote: Boolean(checked),
              }) }], { className: "self-end" })} />
              <PageBlockSurface className="self-end" block={createPageFieldsBlock("save-participant", [], { className: "self-end", actions: [{ key: "save-participant", label: "保存参会人", variant: "primary", size: "sm", disabled: saving || !participantDraft.userId, onClick: () => void onMutate<{
              meeting: MeetingDetail;
            }>(`/api/modules/work/meetings/${meeting.id}/participants`, participantDraft, "参会人已保存") }] })} />
            </InlineForm>}
        </Section>

        <Section title="议程">
          <SimpleList emptyText="暂无议题" items={meeting.agendaItems.map(item => ({
          id: item.id,
          title: item.title,
          meta: item.description,
        }))} />
          {canEdit && <InlineForm>
              <InputBox label="议题" value={agendaDraft.title} onChange={title => onAgendaDraftChange({
            ...agendaDraft,
            title,
          })} />
              <InputBox label="说明" value={agendaDraft.description} onChange={description => onAgendaDraftChange({
            ...agendaDraft,
            description,
          })} />
              <PageBlockSurface className="self-end" block={createPageFieldsBlock("add-agenda", [], { className: "self-end", actions: [{ key: "add-agenda", label: "新增议题", variant: "primary", size: "sm", disabled: saving || !agendaDraft.title.trim(), onClick: () => void onMutate<{
              meeting: MeetingDetail;
            }>(`/api/modules/work/meetings/${meeting.id}/agenda`, agendaDraft, "议题已新增", () => onAgendaDraftChange({
              title: "",
              description: "",
            })) }] })} />
            </InlineForm>}
        </Section>

        <Section title="纪要">
          <SimpleList emptyText="暂无纪要" items={meeting.minuteEntries.map(item => ({
          id: item.id,
          title: agendaTitle(meeting, item.agendaItemId) || "会议纪要",
          meta: item.content,
        }))} />
          {canEdit && <InlineForm>
              <AgendaSelect meeting={meeting} value={minuteDraft.agendaItemId} onChange={agendaItemId => onMinuteDraftChange({
            ...minuteDraft,
            agendaItemId,
          })} />
              <InputBox label="内容" value={minuteDraft.content} onChange={content => onMinuteDraftChange({
            ...minuteDraft,
            content,
          })} className="md:col-span-2" />
              <PageBlockSurface className="self-end" block={createPageFieldsBlock("add-minute", [], { className: "self-end", actions: [{ key: "add-minute", label: "记录纪要", variant: "primary", size: "sm", disabled: saving || !minuteDraft.content.trim(), onClick: () => void onMutate<{
              meeting: MeetingDetail;
            }>(`/api/modules/work/meetings/${meeting.id}/minutes`, normalizeOptionalIds(minuteDraft), "纪要已记录", () => onMinuteDraftChange({
              agendaItemId: "",
              content: "",
            })) }] })} />
            </InlineForm>}
        </Section>

        <Section title="表决">
          <ProposalList meeting={meeting} saving={saving} onVote={(proposalId, choice) => void onMutate<{
          meeting: MeetingDetail;
        }>(`/api/modules/work/meetings/${meeting.id}/votes`, {
          action: "cast",
          proposalId,
          choice,
        }, "投票已保存")} onClose={proposalId => void onMutate<{
          meeting: MeetingDetail;
        }>(`/api/modules/work/meetings/${meeting.id}/votes`, {
          action: "close",
          proposalId,
        }, "表决已关闭")} onDecision={proposal => {
          onDecisionDraftChange({
            agendaItemId: proposal.agendaItemId ? String(proposal.agendaItemId) : "",
            proposalId: String(proposal.id),
            kind: "resolution",
            title: proposal.title,
            content: proposal.content,
            effectiveDate: "",
          });
        }} />
          {canEdit && <InlineForm>
              <AgendaSelect meeting={meeting} value={proposalDraft.agendaItemId} onChange={agendaItemId => onProposalDraftChange({
            ...proposalDraft,
            agendaItemId,
          })} />
              <InputBox label="表决事项" value={proposalDraft.title} onChange={title => onProposalDraftChange({
            ...proposalDraft,
            title,
          })} />
              <SelectBox label="展示方式" value={proposalDraft.voteVisibility} options={[{
            value: "named",
            label: "实名",
          }, {
            value: "anonymous",
            label: "匿名展示",
          }]} onChange={voteVisibility => onProposalDraftChange({
            ...proposalDraft,
            voteVisibility,
          })} />
              <InputBox label="最低人数" value={proposalDraft.minVotesRequired} onChange={minVotesRequired => onProposalDraftChange({
            ...proposalDraft,
            minVotesRequired,
          })} />
              <InputBox label="内容" value={proposalDraft.content} onChange={content => onProposalDraftChange({
            ...proposalDraft,
            content,
          })} className="md:col-span-2" />
              <PageBlockSurface className="self-end" block={createPageFieldsBlock("create-proposal", [], { className: "self-end", actions: [{ key: "create-proposal", label: "创建表决", variant: "primary", size: "sm", disabled: saving || !proposalDraft.title.trim(), onClick: () => void onMutate<{
              meeting: MeetingDetail;
            }>(`/api/modules/work/meetings/${meeting.id}/votes`, {
              action: "create",
              ...normalizeOptionalIds(proposalDraft),
            }, "表决已创建", () => onProposalDraftChange({
              agendaItemId: "",
              title: "",
              content: "",
              voteVisibility: "named",
              minVotesRequired: "",
            })) }] })} />
            </InlineForm>}
        </Section>

        <Section title="决议 / 指导">
          <DecisionList decisions={meeting.decisions} />
          {canEdit && <InlineForm>
              <AgendaSelect meeting={meeting} value={decisionDraft.agendaItemId} onChange={agendaItemId => onDecisionDraftChange({
            ...decisionDraft,
            agendaItemId,
          })} />
              <SelectBox label="类型" value={decisionDraft.kind} options={DECISION_KIND_OPTIONS} onChange={kind => onDecisionDraftChange({
            ...decisionDraft,
            kind,
          })} />
              <InputBox label="生效日期" kind="date" value={decisionDraft.effectiveDate} onChange={effectiveDate => onDecisionDraftChange({
            ...decisionDraft,
            effectiveDate,
          })} />
              <InputBox label="标题" value={decisionDraft.title} onChange={title => onDecisionDraftChange({
            ...decisionDraft,
            title,
          })} />
              <InputBox label="内容" value={decisionDraft.content} onChange={content => onDecisionDraftChange({
            ...decisionDraft,
            content,
          })} className="md:col-span-2" />
              <PageBlockSurface className="self-end" block={createPageInlineFieldsBlock("save-decision", [], { className: "self-end", actions: [{ key: "save-decision", label: "保存决议", variant: "primary", size: "sm", disabled: saving || !decisionDraft.title.trim(), onClick: () => void onMutate<{
              meeting: MeetingDetail;
            }>(`/api/modules/work/meetings/${meeting.id}/decisions`, normalizeOptionalIds(decisionDraft), "决议已保存", () => onDecisionDraftChange({
              agendaItemId: "",
              proposalId: "",
              kind: "decision",
              title: "",
              content: "",
              effectiveDate: "",
            })) }] })} />
            </InlineForm>}
        </Section>

        <Section title="行动候选">
          <CandidateList meeting={meeting} actionDrafts={actionDrafts} saving={saving} onDraftChange={(candidateId, draft) => onActionDraftsChange({
          ...actionDrafts,
          [candidateId]: draft,
        })} onAction={(candidateId, action, draft) => void onMutate<{
          meeting: MeetingDetail;
        }>(`/api/modules/work/meetings/${meeting.id}/action-candidates`, actionPayload(candidateId, action, draft, user), "行动候选已处理")} />
          {canEdit && <InlineForm>
              <AgendaSelect meeting={meeting} value={candidateDraft.agendaItemId} onChange={agendaItemId => onCandidateDraftChange({
            ...candidateDraft,
            agendaItemId,
          })} />
              <DecisionSelect meeting={meeting} value={candidateDraft.decisionId} onChange={decisionId => onCandidateDraftChange({
            ...candidateDraft,
            decisionId,
          })} />
              <SelectBox label="目标" value={candidateDraft.targetKind} options={[{
            value: "work_item",
            label: "工作计划",
          }, {
            value: "project_task",
            label: "项目任务",
          }]} onChange={targetKind => onCandidateDraftChange({
            ...candidateDraft,
            targetKind,
          })} />
              <InputBox label="候选事项" value={candidateDraft.title} onChange={title => onCandidateDraftChange({
            ...candidateDraft,
            title,
          })} />
              <InputBox label="说明" value={candidateDraft.description} onChange={description => onCandidateDraftChange({
            ...candidateDraft,
            description,
          })} className="md:col-span-2" />
              <PageBlockSurface className="self-end" block={createPageInlineFieldsBlock("add-candidate", [], { className: "self-end", actions: [{ key: "add-candidate", label: "新增候选", variant: "primary", size: "sm", disabled: saving || !candidateDraft.title.trim(), onClick: () => void onMutate<{
              meeting: MeetingDetail;
            }>(`/api/modules/work/meetings/${meeting.id}/action-candidates`, normalizeOptionalIds(candidateDraft), "行动候选已新增", () => onCandidateDraftChange({
              agendaItemId: "",
              decisionId: "",
              title: "",
              description: "",
              targetKind: "work_item",
            })) }] })} />
            </InlineForm>}
        </Section>
      </div>
    </div>,
        }],
      },
    }],
  };
}

export function MeetingDetailPanel(props: MeetingDetailPanelProps) {
  const block = useMeetingDetailBlock(props);
  return <PageSurface embedded kind="detail" blocks={[block]} />;
}
