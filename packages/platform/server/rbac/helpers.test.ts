import assert from "node:assert/strict";
import test from "node:test";

import { getUserDepartmentIds, getUserPositionIds } from "./helpers";

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

test("position inheritance uses the Shanghai date immediately after local midnight", async () => {
  const calls: FindManyCall[] = [];
  await getUserPositionIds(
    7,
    recordingClient(calls) as never,
    new Date("2026-07-15T16:30:00.000Z"),
  );

  assert.deepEqual(calls[0]?.where.AND, [
    { OR: [{ startDate: null }, { startDate: "" }, { startDate: { lte: "2026-07-16" } }] },
    { OR: [{ endDate: null }, { endDate: "" }, { endDate: { gte: "2026-07-16" } }] },
  ]);
  assert.deepEqual(calls[0]?.where.position?.OR, [
    { endDate: null },
    { endDate: { gte: new Date("2026-07-15T16:00:00.000Z") } },
  ]);
});

test("department end date remains active through its full Shanghai business date", async () => {
  const calls: FindManyCall[] = [];
  await getUserDepartmentIds(
    7,
    recordingClient(calls) as never,
    new Date("2026-07-16T15:59:59.999Z"),
  );

  assert.deepEqual(calls[0]?.where.department?.OR, [
    { endDate: null },
    { endDate: { gte: new Date("2026-07-15T16:00:00.000Z") } },
  ]);
});

test("department end date expires when the next Shanghai business date starts", async () => {
  const calls: FindManyCall[] = [];
  await getUserDepartmentIds(
    7,
    recordingClient(calls) as never,
    new Date("2026-07-16T16:00:00.000Z"),
  );

  assert.deepEqual(calls[0]?.where.department?.OR, [
    { endDate: null },
    { endDate: { gte: new Date("2026-07-16T16:00:00.000Z") } },
  ]);
});
