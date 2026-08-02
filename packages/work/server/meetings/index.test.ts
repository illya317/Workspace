import assert from "node:assert/strict";
import test, { mock } from "node:test";

const createCalls: Record<string, unknown>[] = [];
const linkCalls: Record<string, unknown>[] = [];

mock.module("./application", {
  namedExports: {
    castMeetingVote: async () => ({ ok: true, data: {} }),
    closeMeetingProposal: async () => ({ ok: true, data: {} }),
    createMeeting: async () => ({ ok: true, data: {} }),
    createMeetingActionCandidate: async (input: Record<string, unknown>) => {
      createCalls.push(input);
      return { ok: true, data: { operation: "create" } };
    },
    createMeetingAgendaItem: async () => ({ ok: true, data: {} }),
    createMeetingDecision: async () => ({ ok: true, data: {} }),
    createMeetingMinuteEntry: async () => ({ ok: true, data: {} }),
    createMeetingProposal: async () => ({ ok: true, data: {} }),
    deleteMeeting: async () => ({ ok: true, data: {} }),
    getMeetingDetail: async () => ({ ok: true, data: {} }),
    linkMeetingActionCandidate: async (input: Record<string, unknown>) => {
      linkCalls.push(input);
      return { ok: true, data: { operation: "link" } };
    },
    listMeetings: async () => ({ ok: true, data: {} }),
    updateMeeting: async () => ({ ok: true, data: {} }),
    upsertMeetingParticipant: async () => ({ ok: true, data: {} }),
  },
} as never);

const meetingCapability = await import("./index");

test("meeting capability exposes only route-level intents", () => {
  assert.deepEqual(Object.keys(meetingCapability).sort(), [
    "buildMeetingActionCandidateCommand",
    "castMeetingVote",
    "closeMeetingProposal",
    "createMeeting",
    "createMeetingAgendaItem",
    "createMeetingDecision",
    "createMeetingMinuteEntry",
    "createMeetingProposal",
    "deleteMeeting",
    "executeMeetingActionCandidateCommand",
    "getMeetingDetail",
    "listMeetings",
    "updateMeeting",
    "upsertMeetingParticipant",
  ]);
});

test("meeting action-candidate intent validates and dispatches create and link commands", async () => {
  createCalls.length = 0;
  linkCalls.length = 0;

  const create = meetingCapability.buildMeetingActionCandidateCommand({
    userId: 7,
    meetingId: 51,
    body: { title: "建立执行计划" },
  });
  assert.deepEqual(create, {
    ok: true,
    data: {
      kind: "create",
      userId: 7,
      meetingId: 51,
      body: { title: "建立执行计划" },
    },
  });
  if (!create.ok) return;
  assert.deepEqual(await meetingCapability.executeMeetingActionCandidateCommand(create.data), {
    ok: true,
    data: { operation: "create" },
  });
  assert.deepEqual(createCalls, [{ userId: 7, meetingId: 51, body: { title: "建立执行计划" } }]);

  const link = meetingCapability.buildMeetingActionCandidateCommand({
    userId: 7,
    meetingId: 51,
    body: { action: "linkWorkPlan", candidateId: 88, workPlanId: 99 },
  });
  assert.equal(link.ok, true);
  if (!link.ok) return;
  assert.deepEqual(await meetingCapability.executeMeetingActionCandidateCommand(link.data), {
    ok: true,
    data: { operation: "link" },
  });
  assert.deepEqual(linkCalls, [{
    userId: 7,
    meetingId: 51,
    candidateId: 88,
    body: { action: "linkWorkPlan", candidateId: 88, workPlanId: 99 },
  }]);

  assert.deepEqual(meetingCapability.buildMeetingActionCandidateCommand({
    userId: 7,
    meetingId: 51,
    body: { action: "ignore" },
  }), {
    ok: false,
    issue: { message: "行动候选 ID 无效", status: 400, field: undefined },
  });
});
