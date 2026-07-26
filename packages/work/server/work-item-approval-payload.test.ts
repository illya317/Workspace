import assert from "node:assert/strict";
import test from "node:test";

import { normalizeApprovalPayload } from "./task-approval-normalize";

test("Work item approval normalization retains the optimistic timestamp", () => {
  const result = normalizeApprovalPayload({
    entityType: "item",
    targetType: "department",
    targetId: 3,
    workId: 17,
    expectedUpdatedAt: "2026-07-21T02:03:04.005Z",
    data: { content: "更新后的工作项" },
  });

  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) return;
  assert.equal(result.data.entityType, "item");
  if (result.data.entityType !== "item") return;
  assert.equal(result.data.expectedUpdatedAt, "2026-07-21T02:03:04.005Z");
});

test("Work item approval normalization rejects an invalid optimistic timestamp", () => {
  const result = normalizeApprovalPayload({
    entityType: "item",
    targetType: "department",
    targetId: 3,
    workId: 17,
    expectedUpdatedAt: "not-a-timestamp",
    data: { content: "更新后的工作项" },
  });

  assert.deepEqual(result, { ok: false, error: "工作项版本无效", status: 400 });
});

test("Work item approval normalization rejects non-canonical date-only revisions", () => {
  const result = normalizeApprovalPayload({
    entityType: "item",
    targetType: "department",
    targetId: 3,
    workId: 17,
    expectedUpdatedAt: "2026-07-21",
    data: { content: "更新后的工作项" },
  });

  assert.deepEqual(result, { ok: false, error: "工作项版本无效", status: 400 });
});
