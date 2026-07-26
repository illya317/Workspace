import assert from "node:assert/strict";
import test from "node:test";
import { matchesWorkPlanStatusFilter } from "./work-status-filter";

test("shows an active plan under completed when it contains completed items", () => {
  assert.equal(matchesWorkPlanStatusFilter({
    status: "active",
    isArchived: false,
    itemStatusCounts: { active: 2, done: 1, archived: 0 },
  }, "done"), true);
});

test("shows a plan under archived when it contains archived items", () => {
  assert.equal(matchesWorkPlanStatusFilter({
    status: "active",
    isArchived: false,
    itemStatusCounts: { active: 2, done: 0, archived: 1 },
  }, "archived"), true);
});

test("hides a plan when neither it nor any item matches the filter", () => {
  assert.equal(matchesWorkPlanStatusFilter({
    status: "active",
    isArchived: false,
    itemStatusCounts: { active: 2, done: 0, archived: 0 },
  }, "done"), false);
});
