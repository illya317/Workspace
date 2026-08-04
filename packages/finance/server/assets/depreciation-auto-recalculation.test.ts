import assert from "node:assert/strict";
import test from "node:test";

import { runAssetDepreciationAutoRecalculation } from "./depreciation-auto-recalculation";

type FakePeriod = { companyCode: string; year: number; month: number };

function fakeDatabase(periods: FakePeriod[], captured: { where: unknown }) {
  return {
    financePeriod: {
      findMany: async (args: { where: unknown }) => {
        captured.where = args.where;
        return periods;
      },
    },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

test("recalculates every open period up to the current month and isolates failures", async () => {
  const periods: FakePeriod[] = [
    { companyCode: "01", year: 2026, month: 6 },
    { companyCode: "01", year: 2026, month: 7 },
    { companyCode: "02", year: 2026, month: 7 },
  ];
  const captured = { where: undefined as unknown };
  const calls: FakePeriod[] = [];
  const results = await runAssetDepreciationAutoRecalculation(new Date("2026-08-04T02:30:00+08:00"), {
    database: fakeDatabase(periods, captured),
    recalculate: async (scope: FakePeriod) => {
      calls.push(scope);
      if (scope.companyCode === "01" && scope.month === 6) throw new Error("已过账，不能覆盖重算");
    },
    log: () => undefined,
  });

  const where = captured.where as {
    isClosed: boolean;
    OR: [{ year: { lt: number } }, { year: number; month: { lte: number } }];
  };
  assert.equal(where.isClosed, false);
  assert.deepEqual(where.OR, [
    { year: { lt: 2026 } },
    { year: 2026, month: { lte: 8 } },
  ]);
  assert.equal(calls.length, 3);
  assert.deepEqual(results, [
    { companyCode: "01", year: 2026, month: 6, status: "failed", message: "已过账，不能覆盖重算" },
    { companyCode: "01", year: 2026, month: 7, status: "recalculated" },
    { companyCode: "02", year: 2026, month: 7, status: "recalculated" },
  ]);
});

test("future periods are excluded from the schedule scope", async () => {
  const captured = { where: undefined as unknown };
  const results = await runAssetDepreciationAutoRecalculation(new Date("2026-01-15T10:00:00+08:00"), {
    database: fakeDatabase([], captured),
    recalculate: async () => {
      throw new Error("不应被调用");
    },
    log: () => undefined,
  });
  const where = captured.where as { OR: [{ year: { lt: number } }, { year: number; month: { lte: number } }] };
  assert.deepEqual(where.OR, [
    { year: { lt: 2026 } },
    { year: 2026, month: { lte: 1 } },
  ]);
  assert.deepEqual(results, []);
});
