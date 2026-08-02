import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { createWorkspaceAnalysisSourceCatalog } from "@workspace/platform/server/workspace-analysis-source-registry";
import {
  WorkspaceAnalysisRuntimeError,
  type WorkspaceAnalysisSourceLoadRequest,
} from "@workspace/platform/server/workspace-analysis-runtime";

import { WORK_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS } from "../workspace-analysis-sources";
import type { WorkMeetingDetail } from "./analysis-sources";

mock.module("server-only", { namedExports: {} } as never);

const detailCalls: Record<string, unknown>[] = [];
let detailResult: { ok: true; data: { meeting: WorkMeetingDetail } } | { ok: false; error: string; status: number } = {
  ok: true,
  data: { meeting: detailFixture() },
};
mock.module("../workspace-analysis-source-access", {
  namedExports: {
    buildWorkWorkspaceAnalysisSourceCatalog: () => createWorkspaceAnalysisSourceCatalog(WORK_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS),
    canDiscoverWorkWorkspaceAnalysisSource: async () => true,
  },
} as never);
mock.module("../department-collaboration-route-command", {
  namedExports: { executeListDepartmentCollaborationsCommand: async () => ({ ok: true, data: { collaborations: [] } }) },
} as never);
mock.module("../work-kpi-route-command", {
  namedExports: {
    executeListKpiDefinitionsCommand: async () => ({ ok: true, data: { definitions: [] } }),
  },
} as never);
mock.module("../work-plan-route-command", {
  namedExports: { executeListWorkPlansCommand: async () => ({ ok: true, data: { plans: [] } }) },
} as never);
mock.module("../works", { namedExports: { getWorkItems: async () => [] } } as never);
mock.module("../project-members", { namedExports: { listProjectMembers: async () => ({ entries: [], total: 0 }) } } as never);
mock.module("../projects", { namedExports: {
  listProjectGantt: async () => ({ projects: [], tasks: [] }),
  listProjects: async () => ({ projects: [], total: 0 }),
} } as never);
mock.module("./application", { namedExports: {
  getMeetingDetail: async (input: Record<string, unknown>) => {
    detailCalls.push(input);
    return detailResult;
  },
  listMeetings: async () => { throw new Error("detail sources must not use the take:200 meeting list as authorization"); },
} } as never);
mock.module("../work-task-route-command", { namedExports: {
  executeAssignedDepartmentWorkItemsRouteCommand: async () => ({ ok: false, error: "unused" }),
  executeWorkPeriodCollectionRouteCommand: async () => ({ ok: false, error: "unused" }),
  executeWorkReportCollectionRouteCommand: async () => ({ ok: false, error: "unused" }),
} } as never);

const { loadWorkWorkspaceAnalysisSource } = await import("../workspace-analysis-source-executor");

test("meeting detail sources bind one meetingId and preserve every public stable child collection", async () => {
  detailCalls.length = 0;
  detailResult = { ok: true, data: { meeting: detailFixture() } };

  const cases = [
    ["work.meeting-details", ["id", "seriesTitle"], [{ id: 51, seriesTitle: "月度经营会" }]],
    ["work.meeting-detail-participants", ["meetingId", "id", "userName"], [{ meetingId: 51, id: 401, userName: "张三" }]],
    ["work.meeting-agenda-items", ["meetingId", "id", "title"], [{ meetingId: 51, id: 501, title: "成本复盘" }]],
    ["work.meeting-minute-entries", ["meetingId", "id", "content"], [{ meetingId: 51, id: 601, content: "成本同比上升" }]],
    ["work.meeting-proposals", ["meetingId", "id", "tallyYes", "myVoteChoice"], [{ meetingId: 51, id: 701, tallyYes: 2, myVoteChoice: "yes" }]],
    ["work.meeting-proposal-votes", ["meetingId", "proposalId", "id", "choice"], [{ meetingId: 51, proposalId: 701, id: 801, choice: "yes" }]],
    ["work.meeting-decisions", ["meetingId", "id", "proposalId"], [{ meetingId: 51, id: 901, proposalId: 701 }]],
    ["work.meeting-action-candidates", ["meetingId", "id", "linkedWorkPlanId"], [{ meetingId: 51, id: 1001, linkedWorkPlanId: 2001 }]],
  ] as const;

  for (const [sourceKey, fields, expectedRows] of cases) {
    const result = await loadWorkWorkspaceAnalysisSource(request({ sourceKey, fields }));
    assert.deepEqual(result.rows, expectedRows);
  }
  assert.deepEqual(detailCalls, cases.map(() => ({ userId: 7, meetingId: 51 })));
});

test("meeting detail executor delegates denial to the original object visibility service", async () => {
  detailCalls.length = 0;
  detailResult = { ok: false, error: "无权限", status: 403 };

  await assert.rejects(
    () => loadWorkWorkspaceAnalysisSource(request({ sourceKey: "work.meeting-decisions", fields: ["id"] })),
    (error: unknown) => error instanceof WorkspaceAnalysisRuntimeError && error.code === "source_forbidden",
  );
  assert.deepEqual(detailCalls, [{ userId: 7, meetingId: 51 }]);
});

function request(input: {
  sourceKey: string;
  fields: readonly string[];
}): WorkspaceAnalysisSourceLoadRequest {
  return {
    requesterId: 7,
    targetType: "department",
    targetId: 999,
    ownerUnitId: "work",
    sourceKey: input.sourceKey,
    sourceVersion: 1,
    fields: [...input.fields],
    parameters: { meetingId: 51 },
    limits: { maxRows: 1, maxGroups: 20, pageSize: 1, maxPages: 1, maxBytes: 100_000, timeoutMs: 1_000 },
    signal: new AbortController().signal,
  };
}

function detailFixture(): WorkMeetingDetail {
  return {
    id: 51,
    typeId: 1,
    typeName: "周期经营会议",
    title: "月度经营会",
    description: "",
    startAt: "2026-07-01T01:00:00.000Z",
    endAt: "2026-07-01T03:00:00.000Z",
    location: "一号会议室",
    visibility: "private",
    status: "closed",
    ownerUserId: 7,
    ownerName: "张三",
    secretaryUserId: 8,
    secretaryName: "李四",
    participantCount: 1,
    counts: { agendaItems: 1, minuteEntries: 1, proposals: 1, decisions: 1, actionCandidates: 1 },
    participants: [{ id: 401, userId: 7, userName: "张三", role: "owner", canVote: true, attendanceStatus: "present" }],
    permissions: { canView: true, canEdit: true, canManage: true, canDelete: true, canVote: true, canApprove: true, canViewAll: false, participantRole: "owner" },
    seriesId: 11,
    seriesTitle: "月度经营会",
    agendaItems: [{ id: 501, meetingId: 51, title: "成本复盘", description: "复盘材料", presenterUserId: 7, sortOrder: 1, status: "open" }],
    minuteEntries: [{ id: 601, meetingId: 51, agendaItemId: 501, content: "成本同比上升", kind: "minute", createdAt: "2026-07-01T02:00:00.000Z" }],
    proposals: [{ id: 701, meetingId: 51, agendaItemId: 501, title: "调整采购策略", content: "议案正文", status: "closed", voteVisibility: "named", minVotesRequired: 2, closedAt: "2026-07-01T03:00:00.000Z", tally: { yes: 2, no: 0, abstain: 0, total: 2 }, myVote: { choice: "yes", note: "同意" }, votes: [{ id: 801, voterUserId: 7, voterName: "张三", choice: "yes", note: "同意", updatedAt: "2026-07-01T02:30:00.000Z" }], decisions: [{ id: 901, title: "批准调整", kind: "decision" }] }],
    decisions: [{ id: 901, meetingId: 51, agendaItemId: 501, proposalId: 701, kind: "decision", title: "批准调整", content: "立即执行", status: "effective", effectiveDate: "2026-07-02", decidedAt: "2026-07-01T03:00:00.000Z" }],
    actionCandidates: [{ id: 1001, meetingId: 51, agendaItemId: 501, decisionId: 901, title: "建立执行计划", description: "跟进采购", targetKind: "work_plan", status: "linked", linkedWorkItemId: null, linkedWorkItemTitle: null, linkedWorkPlanId: 2001, linkedWorkPlanTitle: "采购优化" }],
  };
}
