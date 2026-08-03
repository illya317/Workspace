import assert from "node:assert/strict";
import test from "node:test";
import { resolveWorkSpaceTarget } from "./work-space-session";
import type { WorkTaskSpace } from "./types";

const spaces = [
  { targetType: "personal", targetId: 7 },
  { targetType: "department", targetId: 12 },
  { targetType: "project", targetId: 21 },
] as WorkTaskSpace[];

test("requested work target wins during initial session resolution", () => {
  assert.deepEqual(
    resolveWorkSpaceTarget(spaces, { targetType: "project", targetId: 21 }, { targetType: "department", targetId: 12 }),
    { target: { targetType: "project", targetId: 21 }, requestedTargetUnavailable: false },
  );
});

test("refresh preserves the current target instead of returning to the initial route", () => {
  assert.deepEqual(
    resolveWorkSpaceTarget(spaces, null, { targetType: "department", targetId: 12 }),
    { target: { targetType: "department", targetId: 12 }, requestedTargetUnavailable: false },
  );
});

test("an unavailable requested target falls back to the current accessible target", () => {
  assert.deepEqual(
    resolveWorkSpaceTarget(spaces, { targetType: "project", targetId: 99 }, { targetType: "department", targetId: 12 }),
    { target: { targetType: "department", targetId: 12 }, requestedTargetUnavailable: true },
  );
});

test("an empty session has no target", () => {
  assert.deepEqual(resolveWorkSpaceTarget([], { targetType: "personal", targetId: 7 }, null), {
    target: null,
    requestedTargetUnavailable: true,
  });
});
