import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  workspaceBusinessDate,
  workspaceBusinessDayStart,
} from "./business-date";

process.env.WORKSPACE_CONFIG_DIR = path.resolve("scripts/check/fixtures/tenant-workspace");

test("Workspace business date follows the configured tenant time zone", () => {
  assert.equal(workspaceBusinessDate(new Date("2026-07-15T23:59:59.999Z")), "2026-07-15");
  assert.equal(workspaceBusinessDate(new Date("2026-07-16T00:00:00.000Z")), "2026-07-16");
});

test("Workspace business day start is stable through the configured tenant date", () => {
  const expected = "2026-07-16T00:00:00.000Z";
  assert.equal(workspaceBusinessDayStart(new Date("2026-07-16T00:30:00.000Z")).toISOString(), expected);
  assert.equal(workspaceBusinessDayStart(new Date("2026-07-16T23:59:59.999Z")).toISOString(), expected);
  assert.equal(
    workspaceBusinessDayStart(new Date("2026-07-17T00:00:00.000Z")).toISOString(),
    "2026-07-17T00:00:00.000Z",
  );
});
