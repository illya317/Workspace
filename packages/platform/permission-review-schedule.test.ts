import assert from "node:assert/strict";
import test from "node:test";
import { nextPermissionReviewRunAt } from "./permission-review-schedule";

test("schedules tenant-local 08:00 on the same day before the deadline", () => {
  const next = nextPermissionReviewRunAt(
    new Date("2026-07-25T07:59:00.000Z"),
    "08:00",
    "Etc/UTC",
  );
  assert.equal(next.toISOString(), "2026-07-25T08:00:00.000Z");
});

test("schedules the next business day when 08:00 has arrived", () => {
  const next = nextPermissionReviewRunAt(
    new Date("2026-07-25T08:00:00.000Z"),
    "08:00",
    "Etc/UTC",
  );
  assert.equal(next.toISOString(), "2026-07-26T08:00:00.000Z");
});

test("keeps a stable local time across a DST transition", () => {
  const next = nextPermissionReviewRunAt(
    new Date("2026-03-08T13:00:00.000Z"),
    "08:00",
    "America/New_York",
  );
  assert.equal(next.toISOString(), "2026-03-09T12:00:00.000Z");
});
