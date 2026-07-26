import assert from "node:assert/strict";
import test from "node:test";

import { createWorkspaceAnalysisSourceCatalog } from "@workspace/platform/server/workspace-analysis-source-registry";

import {
  WORK_MEETING_DETAIL_ANALYSIS_SOURCE_REGISTRATIONS,
  WORK_MEETING_DETAIL_FIELD_CLASSIFICATIONS,
  WORK_MEETING_PROPOSAL_FIELD_CLASSIFICATIONS,
  iterateWorkMeetingActionCandidateRows,
  iterateWorkMeetingAgendaItemRows,
  iterateWorkMeetingDecisionRows,
  iterateWorkMeetingDetailParticipantRows,
  iterateWorkMeetingMinuteEntryRows,
  iterateWorkMeetingProposalRows,
  iterateWorkMeetingProposalVoteRows,
  type WorkMeetingDetail,
} from "./workspace-analysis-meeting-detail-sources";

test("meeting detail sources are parameter-bound single-meeting facts with inherited read authorization", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog(WORK_MEETING_DETAIL_ANALYSIS_SOURCE_REGISTRATIONS);

  assert.deepEqual(catalog.list().map((source) => source.sourceKey), [
    "work.meeting-action-candidates",
    "work.meeting-agenda-items",
    "work.meeting-decisions",
    "work.meeting-detail-participants",
    "work.meeting-details",
    "work.meeting-minute-entries",
    "work.meeting-proposal-votes",
    "work.meeting-proposals",
  ]);
  for (const source of catalog.list()) {
    assert.deepEqual(source.authorization, {
      resourceKey: "work.meetings",
      requiredActions: ["read"],
      projection: "default",
      enforcement: "gateway",
    });
    assert.deepEqual(source.parameters, [{
      key: "meetingId",
      label: "会议",
      description: "必选会议稳定标识；执行时由原会议详情服务复核当前查看人的对象可见性。",
      kind: "integer",
      required: true,
    }]);
    assert.equal(source.scopeBindings.personal?.mode, "viewer");
    assert.equal(source.scopeBindings.department?.mode, "viewer");
    assert.equal(source.scopeBindings.project?.mode, "viewer");
    assert.equal(catalog.resolve(source.sourceKey, 1)?.adapter.path, "/api/modules/work/meetings/[id]");
  }
  assert.equal(catalog.get("work.meeting-details", 1)?.limits.maxRows, 1);
  assert.equal(catalog.get("work.meeting-detail-participants", 1)?.limits.maxRows, 500);
  assert.equal(catalog.get("work.meeting-agenda-items", 1)?.limits.maxRows, 500);
  catalog.validateReferences();
});

test("meeting detail and proposal DTOs classify every nested or control-plane field", () => {
  assert.equal(WORK_MEETING_DETAIL_FIELD_CLASSIFICATIONS.permissions.classification, "omit");
  assert.equal(WORK_MEETING_DETAIL_FIELD_CLASSIFICATIONS.permissions.reason, "controlPlane");
  assert.equal(WORK_MEETING_DETAIL_FIELD_CLASSIFICATIONS.counts.reason, "derivedDuplicate");
  assert.deepEqual(
    ["participants", "agendaItems", "minuteEntries", "proposals", "decisions", "actionCandidates"].map((key) => (
      WORK_MEETING_DETAIL_FIELD_CLASSIFICATIONS[key as keyof typeof WORK_MEETING_DETAIL_FIELD_CLASSIFICATIONS].classification
    )),
    ["childSource", "childSource", "childSource", "childSource", "childSource", "childSource"],
  );
  assert.equal(WORK_MEETING_PROPOSAL_FIELD_CLASSIFICATIONS.tally.classification, "omit");
  assert.equal(WORK_MEETING_PROPOSAL_FIELD_CLASSIFICATIONS.myVote.classification, "omit");
  assert.equal(WORK_MEETING_PROPOSAL_FIELD_CLASSIFICATIONS.votes.classification, "childSource");
  assert.equal(WORK_MEETING_PROPOSAL_FIELD_CLASSIFICATIONS.decisions.reason, "derivedDuplicate");
});

test("meeting detail iterators preserve public scalars and never reconstruct hidden votes", () => {
  const meeting = detailFixture();

  assert.equal(iterateWorkMeetingDetailParticipantRows(meeting)[0]?.userName, "张三");
  assert.deepEqual(iterateWorkMeetingAgendaItemRows(meeting)[0], {
    meetingId: 51,
    meetingTitle: "月度经营会",
    meetingStartAt: "2026-07-01T01:00:00.000Z",
    id: 501,
    title: "成本复盘",
    description: "复盘材料",
    presenterUserId: 9,
    sortOrder: 1,
    status: "open",
  });
  assert.equal(iterateWorkMeetingMinuteEntryRows(meeting)[0]?.content, "成本同比上升");
  assert.deepEqual(iterateWorkMeetingProposalRows(meeting).map((row) => ({
    id: row.id,
    tallyYes: row.tallyYes,
    tallyNo: row.tallyNo,
    tallyAbstain: row.tallyAbstain,
    tallyTotal: row.tallyTotal,
    myVoteChoice: row.myVoteChoice,
    myVoteNote: row.myVoteNote,
  })), [
    { id: 701, tallyYes: 2, tallyNo: 0, tallyAbstain: 1, tallyTotal: 3, myVoteChoice: "yes", myVoteNote: "同意" },
    { id: 702, tallyYes: 1, tallyNo: 1, tallyAbstain: 0, tallyTotal: 2, myVoteChoice: null, myVoteNote: null },
  ]);
  assert.deepEqual(iterateWorkMeetingProposalVoteRows(meeting).map((row) => row.id), [801]);
  assert.equal(iterateWorkMeetingProposalVoteRows(meeting).some((row) => row.proposalId === 702), false);
  assert.equal(iterateWorkMeetingDecisionRows(meeting)[0]?.proposalId, 701);
  assert.equal(iterateWorkMeetingActionCandidateRows(meeting)[0]?.linkedWorkPlanId, 1001);
});

function detailFixture(): WorkMeetingDetail {
  return {
    id: 51,
    title: "月度经营会",
    startAt: "2026-07-01T01:00:00.000Z",
    participants: [{ id: 401, userId: 9, userName: "张三", role: "owner", canVote: true, attendanceStatus: "present" }],
    agendaItems: [{ id: 501, meetingId: 51, title: "成本复盘", description: "复盘材料", presenterUserId: 9, sortOrder: 1, status: "open" }],
    minuteEntries: [{ id: 601, meetingId: 51, agendaItemId: 501, content: "成本同比上升", kind: "minute", createdAt: "2026-07-01T02:00:00.000Z" }],
    proposals: [
      {
        id: 701,
        meetingId: 51,
        agendaItemId: 501,
        title: "调整采购策略",
        content: "议案正文",
        status: "closed",
        voteVisibility: "named",
        minVotesRequired: 2,
        closedAt: "2026-07-01T03:00:00.000Z",
        tally: { yes: 2, no: 0, abstain: 1, total: 3 },
        myVote: { choice: "yes", note: "同意" },
        votes: [{ id: 801, voterUserId: 9, voterName: "张三", choice: "yes", note: "同意", updatedAt: "2026-07-01T02:30:00.000Z" }],
        decisions: [{ id: 901, title: "批准调整", kind: "decision" }],
      },
      {
        id: 702,
        meetingId: 51,
        agendaItemId: 501,
        title: "匿名议案",
        content: null,
        status: "open",
        voteVisibility: "anonymous",
        minVotesRequired: null,
        closedAt: null,
        tally: { yes: 1, no: 1, abstain: 0, total: 2 },
        myVote: null,
        votes: [],
        decisions: [],
      },
    ],
    decisions: [{ id: 901, meetingId: 51, agendaItemId: 501, proposalId: 701, kind: "decision", title: "批准调整", content: "立即执行", status: "effective", effectiveDate: "2026-07-02", decidedAt: "2026-07-01T03:00:00.000Z" }],
    actionCandidates: [{ id: 1001, meetingId: 51, agendaItemId: 501, decisionId: 901, title: "建立执行计划", description: "跟进采购", targetKind: "work_plan", status: "linked", linkedWorkItemId: null, linkedWorkItemTitle: null, linkedWorkPlanId: 1001, linkedWorkPlanTitle: "采购优化" }],
  } as unknown as WorkMeetingDetail;
}
