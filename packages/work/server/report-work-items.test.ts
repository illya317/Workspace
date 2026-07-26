import assert from "node:assert/strict";
import test, { mock } from "node:test";

type MockModule = (specifier: string, options: { namedExports: Record<string, unknown> }) => void;
const mockModule = (mock as unknown as { module: MockModule }).module.bind(mock);
let reportPlans: unknown[] = [];

mockModule("@workspace/platform/server/prisma", {
  namedExports: {
    prisma: {
      workPlan: { findMany: async () => reportPlans },
    },
  },
});
mockModule("./access", {
  namedExports: { getUserEmployeeIds: async () => [] },
});
mockModule("./report-routine-periods", {
  namedExports: { routineTaskVisibleInPeriod: () => false },
});

const { lightReportTaskKinds, listReportWorkItems } = await import("./report-work-items");

const currentPeriod = {
  startDate: new Date("2026-07-13T00:00:00.000Z"),
  endDate: new Date("2026-07-19T00:00:00.000Z"),
};
const nextPeriod = {
  startDate: new Date("2026-07-20T00:00:00.000Z"),
  endDate: new Date("2026-07-26T00:00:00.000Z"),
};

test("unfinished cross-week task remains in the next-week plan", () => {
  assert.deepEqual(lightReportTaskKinds({
    status: "active",
    actualStartDate: null,
    actualEndDate: null,
    plannedStartDate: new Date("2026-07-17T00:00:00.000Z"),
    plannedEndDate: new Date("2026-07-21T00:00:00.000Z"),
  }, currentPeriod, nextPeriod), ["next"]);
});

test("weekly reports keep unfinished tasks after their parent plan period", async () => {
  reportPlans = [{
    id: 10,
    kind: "okr",
    title: "Expired plan",
    sortOrder: 1,
    actualStartDate: new Date("2026-07-01T00:00:00.000Z"),
    actualEndDate: new Date("2026-07-05T00:00:00.000Z"),
    okrCycle: null,
    items: [{
      id: 20,
      itemType: "task",
      content: "Still unfinished",
      status: "active",
      completedAt: null,
      ownerEmployeeId: null,
      routineTaskType: null,
      routineRecurrenceType: null,
      routineRecurrenceTime: null,
      routineRecurrenceWeekday: null,
      routineRecurrenceMonthDay: null,
      routineRecurrenceQuarterDay: null,
      routineRecurrenceYearMonth: null,
      routineRecurrenceYearDay: null,
      actualStartDate: null,
      actualEndDate: null,
      plannedStartDate: new Date("2026-07-01T00:00:00.000Z"),
      plannedEndDate: new Date("2026-07-05T00:00:00.000Z"),
      parentWorkItemId: null,
      parentWorkItem: null,
      sortOrder: 1,
    }],
  }];

  const items = await listReportWorkItems("department", 1, currentPeriod, "final", { periodType: "weekly" });

  assert.equal(items.length, 1);
  assert.equal(items[0]?.reportItemKind, "next");
  assert.equal(items[0]?.content, "Still unfinished");
});

test("overdue unfinished tasks keep rolling forward but later tasks wait for their start period", () => {
  assert.deepEqual(lightReportTaskKinds({
    status: "paused",
    actualStartDate: null,
    actualEndDate: null,
    plannedStartDate: new Date("2026-07-01T00:00:00.000Z"),
    plannedEndDate: new Date("2026-07-05T00:00:00.000Z"),
  }, currentPeriod, nextPeriod), ["next"]);
  assert.deepEqual(lightReportTaskKinds({
    status: null,
    actualStartDate: null,
    actualEndDate: null,
    plannedStartDate: new Date("2026-08-01T00:00:00.000Z"),
    plannedEndDate: new Date("2026-08-05T00:00:00.000Z"),
  }, currentPeriod, nextPeriod), []);
});

test("monthly reports do not show unfinished tasks before their planned start month", () => {
  const marchPeriod = {
    startDate: new Date("2025-03-01T00:00:00.000Z"),
    endDate: new Date("2025-03-31T00:00:00.000Z"),
  };
  const aprilPeriod = {
    startDate: new Date("2025-04-01T00:00:00.000Z"),
    endDate: new Date("2025-04-30T00:00:00.000Z"),
  };
  assert.deepEqual(lightReportTaskKinds({
    status: "active",
    actualStartDate: null,
    actualEndDate: null,
    plannedStartDate: new Date("2026-07-01T00:00:00.000Z"),
    plannedEndDate: new Date("2026-07-31T00:00:00.000Z"),
  }, marchPeriod, aprilPeriod), []);
  assert.deepEqual(lightReportTaskKinds({
    status: "active",
    actualStartDate: null,
    actualEndDate: null,
    plannedStartDate: new Date("2025-04-30T00:00:00.000Z"),
    plannedEndDate: new Date("2025-05-15T00:00:00.000Z"),
  }, marchPeriod, aprilPeriod), ["next"]);
});

test("completed tasks appear only in their completion period", () => {
  assert.deepEqual(lightReportTaskKinds({
    status: "done",
    actualStartDate: new Date("2026-07-15T00:00:00.000Z"),
    actualEndDate: new Date("2026-07-17T00:00:00.000Z"),
    plannedStartDate: new Date("2026-07-15T00:00:00.000Z"),
    plannedEndDate: new Date("2026-07-17T00:00:00.000Z"),
  }, currentPeriod, nextPeriod), ["current"]);
  assert.deepEqual(lightReportTaskKinds({
    status: "done",
    actualStartDate: new Date("2026-07-10T00:00:00.000Z"),
    actualEndDate: new Date("2026-07-12T00:00:00.000Z"),
    plannedStartDate: new Date("2026-07-10T00:00:00.000Z"),
    plannedEndDate: new Date("2026-07-12T00:00:00.000Z"),
  }, currentPeriod, nextPeriod), []);
});
