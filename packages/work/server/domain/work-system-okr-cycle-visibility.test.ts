import assert from "node:assert/strict";
import test from "node:test";
import { selectVisibleSystemOkrCycles } from "./work-system-okr-cycle-visibility";

type TestCycle = {
  id: number;
  code: string;
  periodType: string;
  startDate: Date;
  endDate: Date;
};

test("system OKR cycles open every child period under an open parent", () => {
  const cycles = [
    ...yearCycles(2026, 1),
    ...yearCycles(2027, 20),
    ...yearCycles(2028, 39),
  ];

  const visible = selectVisibleSystemOkrCycles(cycles, utcDate("2026-07-23"));

  assert.deepEqual(codesOfType(visible, "yearly"), ["2026", "2027"]);
  assert.deepEqual(codesOfType(visible, "half_year"), ["2026-H1", "2026-H2", "2027-H1", "2027-H2"]);
  assert.deepEqual(codesOfType(visible, "quarterly"), [
    "2026-Q1", "2026-Q2", "2026-Q3", "2026-Q4",
    "2027-Q1", "2027-Q2", "2027-Q3", "2027-Q4",
  ]);
  assert.equal(codesOfType(visible, "monthly").length, 24);
  assert.deepEqual(periodCounts(visible.filter((item) => item.code.startsWith("2027"))), {
    yearly: 1,
    half_year: 2,
    quarterly: 4,
    monthly: 12,
  });
  assert.equal(visible.some((item) => item.code.startsWith("2028")), false);
});

function cycle(id: number, code: string, periodType: string, startDate: string, endDate: string): TestCycle {
  return { id, code, periodType, startDate: utcDate(startDate), endDate: utcDate(endDate) };
}

function yearCycles(year: number, firstId: number) {
  const rows: TestCycle[] = [cycle(firstId, String(year), "yearly", `${year}-01-01`, `${year}-12-31`)];
  for (const half of [1, 2]) {
    const startMonth = half === 1 ? 1 : 7;
    const endMonth = half === 1 ? 6 : 12;
    rows.push(cycle(rows.length + firstId, `${year}-H${half}`, "half_year", date(year, startMonth, 1), date(year, endMonth, daysInMonth(year, endMonth))));
  }
  for (let quarter = 1; quarter <= 4; quarter += 1) {
    const startMonth = (quarter - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    rows.push(cycle(rows.length + firstId, `${year}-Q${quarter}`, "quarterly", date(year, startMonth, 1), date(year, endMonth, daysInMonth(year, endMonth))));
  }
  for (let month = 1; month <= 12; month += 1) {
    rows.push(cycle(rows.length + firstId, `${year}-${pad2(month)}`, "monthly", date(year, month, 1), date(year, month, daysInMonth(year, month))));
  }
  return rows;
}

function date(year: number, month: number, day: number) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function utcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function codesOfType(cycles: TestCycle[], periodType: string) {
  return cycles
    .filter((cycle) => cycle.periodType === periodType)
    .map((cycle) => cycle.code)
    .sort();
}

function periodCounts(cycles: TestCycle[]) {
  return Object.fromEntries(["yearly", "half_year", "quarterly", "monthly"].map((periodType) => [
    periodType,
    cycles.filter((cycle) => cycle.periodType === periodType).length,
  ]));
}
