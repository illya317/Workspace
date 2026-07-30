import assert from "node:assert/strict";
import test from "node:test";

import { organizationArchiveLifecycleMetaFromRequest } from "./organization-structure-route-meta";

test("archive command derives expected sequence from the business payload", () => {
  const meta = organizationArchiveLifecycleMetaFromRequest(new Request("http://workspace.test", {
    headers: { "Idempotency-Key": "archive-department-42" },
  }), {
    archived: true,
    version: 7,
  });
  assert.equal(meta.kind, "end-date");
  assert.equal(meta.expectedSequence, 7);
  assert.equal(meta.idempotencyKey, "archive-department-42");
  assert.equal(meta.reason, "直接执行组织结构变更");
});

test("If-Match remains authoritative for integrations and restore is a schedule", () => {
  const meta = organizationArchiveLifecycleMetaFromRequest(new Request("http://workspace.test", {
    headers: {
      "If-Match": "9",
      "Idempotency-Key": "restore-position-42",
    },
  }), {
    archived: false,
    version: 7,
  });
  assert.equal(meta.kind, "schedule");
  assert.equal(meta.expectedSequence, 9);
  assert.equal(meta.idempotencyKey, "restore-position-42");
  assert.equal(meta.reason, null);
});
