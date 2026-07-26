import assert from "node:assert/strict";
import test from "node:test";

import { getUserDepartmentIds, getUserPositionIds } from "./helpers";
import { workspaceBusinessDate, workspaceBusinessDayStart } from "../business-date";

type FindManyCall = {
  where: {
    AND: Array<{ OR: Array<Record<string, unknown>> }>;
    position?: { OR: Array<Record<string, unknown>> };
    department?: { OR: Array<Record<string, unknown>> };
  };
};

function recordingClient(calls: FindManyCall[]) {
  return {
    eDP: {
      findMany: async (args: FindManyCall) => {
        calls.push(args);
        return [];
      },
    },
  };
}

test("position inheritance uses the configured business date", async () => {
  const calls: FindManyCall[] = [];
  const now = new Date("2026-07-15T16:30:00.000Z");
  const businessDate = workspaceBusinessDate(now);
  await getUserPositionIds(
    7,
    recordingClient(calls) as never,
    now,
  );

  assert.deepEqual(calls[0]?.where.AND, [
    { OR: [{ startDate: null }, { startDate: "" }, { startDate: { lte: businessDate } }] },
    { OR: [{ endDate: null }, { endDate: "" }, { endDate: { gte: businessDate } }] },
  ]);
  assert.deepEqual(calls[0]?.where.position?.OR, [
    { endDate: null },
    { endDate: { gte: workspaceBusinessDayStart(now) } },
  ]);
});

test("department end date remains active through its full configured business date", async () => {
  const calls: FindManyCall[] = [];
  const now = new Date("2026-07-16T15:59:59.999Z");
  await getUserDepartmentIds(
    7,
    recordingClient(calls) as never,
    now,
  );

  assert.deepEqual(calls[0]?.where.department?.OR, [
    { endDate: null },
    { endDate: { gte: workspaceBusinessDayStart(now) } },
  ]);
});

test("department end date expires when the next configured business date starts", async () => {
  const calls: FindManyCall[] = [];
  const now = new Date("2026-07-16T16:00:00.000Z");
  await getUserDepartmentIds(
    7,
    recordingClient(calls) as never,
    now,
  );

  assert.deepEqual(calls[0]?.where.department?.OR, [
    { endDate: null },
    { endDate: { gte: workspaceBusinessDayStart(now) } },
  ]);
});
