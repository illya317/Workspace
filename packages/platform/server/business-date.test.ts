import assert from "node:assert/strict";
import test from "node:test";

import {
  workspaceBusinessDate,
  workspaceBusinessDayStart,
} from "./business-date";

test("Workspace business date switches at Shanghai midnight", () => {
  assert.equal(workspaceBusinessDate(new Date("2026-07-15T15:59:59.999Z")), "2026-07-15");
  assert.equal(workspaceBusinessDate(new Date("2026-07-15T16:00:00.000Z")), "2026-07-16");
});

test("Workspace business day start is stable through the whole Shanghai date", () => {
  const expected = "2026-07-15T16:00:00.000Z";
  assert.equal(workspaceBusinessDayStart(new Date("2026-07-15T16:30:00.000Z")).toISOString(), expected);
  assert.equal(workspaceBusinessDayStart(new Date("2026-07-16T15:59:59.999Z")).toISOString(), expected);
  assert.equal(
    workspaceBusinessDayStart(new Date("2026-07-16T16:00:00.000Z")).toISOString(),
    "2026-07-16T16:00:00.000Z",
  );
});
