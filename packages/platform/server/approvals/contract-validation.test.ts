import assert from "node:assert/strict";
import test from "node:test";

import { serviceOk } from "../api";
import type { ApprovalAdapter, ApprovalPreparedPayload } from "./types";
import { validatePreparedApprovalAtPhase } from "./contract-validation";

type Payload = { name: string };

function prepared(overrides: Partial<ApprovalPreparedPayload<Payload>> = {}) {
  return {
    resourceKey: "hr.roster",
    scopeId: null,
    subjectId: null,
    businessActionKey: "hr.roster.department.create",
    payload: { name: "Operations" },
    ...overrides,
  } satisfies ApprovalPreparedPayload<Payload>;
}

function adapter(validatePayload: ApprovalAdapter<Payload>["validatePayload"]) {
  return { validatePayload } as ApprovalAdapter<Payload>;
}

test("configured draft validation canonicalizes prepared payload before persistence", async () => {
  let calls = 0;
  const result = await validatePreparedApprovalAtPhase({
    adapter: adapter(({ payload }) => {
      calls += 1;
      const value = payload as Payload;
      return serviceOk(prepared({ payload: { name: value.name.trim() } }));
    }),
    phase: "draft",
    actorUserId: 7,
    operation: "create",
    prepared: prepared({ payload: { name: "  Operations  " } }),
    businessActionKey: "hr.roster.department.create",
    sourceActionContractVersion: 1,
  });

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.prepared.payload.name, "Operations");
  assert.equal(calls, 1);
});

test("approval revalidation rejects resource and scope identity drift", async () => {
  const result = await validatePreparedApprovalAtPhase({
    adapter: adapter(() => serviceOk(prepared({ resourceKey: "docs.editor" }))),
    phase: "submit",
    actorUserId: 7,
    operation: "create",
    prepared: prepared(),
    businessActionKey: "hr.roster.department.create",
    sourceActionContractVersion: 1,
    expectedIdentity: {
      resourceKey: "hr.roster",
      scopeId: null,
      subjectId: null,
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /权限资源/);
});

test("approval revalidation fails closed when the stored contract version is stale", async () => {
  let calls = 0;
  const result = await validatePreparedApprovalAtPhase({
    adapter: adapter(() => {
      calls += 1;
      return serviceOk(prepared());
    }),
    phase: "commit",
    actorUserId: 7,
    operation: "create",
    prepared: prepared(),
    businessActionKey: "hr.roster.department.create",
    sourceActionContractVersion: 99,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 409);
    assert.match(result.error, /版本已变化/);
  }
  assert.equal(calls, 0);
});

test("generic ApprovalRequest engine rejects a non-configurable ActionContract", async () => {
  const directOnlyActionKey = ["hr", "roster", "position", "create"].join(".");
  const result = await validatePreparedApprovalAtPhase({
    adapter: adapter(() => serviceOk(prepared())),
    phase: "draft",
    actorUserId: 7,
    operation: "create",
    prepared: prepared({ businessActionKey: directOnlyActionKey }),
    businessActionKey: directOnlyActionKey,
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /可执行 ActionContract/);
});
