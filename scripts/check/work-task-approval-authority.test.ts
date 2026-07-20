import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { serviceOk } from "../../packages/platform/server/api";

const writes: Array<Record<string, unknown>> = [];

mock.module("server-only", { namedExports: {} } as never);
mock.module("next/navigation", {
  namedExports: {
    notFound: () => undefined,
    redirect: () => undefined,
    usePathname: () => "",
    useRouter: () => ({}),
    useSearchParams: () => new URLSearchParams(),
  },
} as never);
mock.module("../../packages/work/server/works", {
  namedExports: {
    createWorkItem: async (input: Record<string, unknown>) => {
      writes.push(input);
      return serviceOk({ id: 51 });
    },
    updateWorkItem: async () => {
      throw new Error("update is not expected in this test");
    },
  },
} as never);

async function commitPreparedWorkTaskPayload(
  input: Parameters<typeof import("../../packages/work/server/task-approval-commit")["commitPreparedWorkTaskPayload"]>[0],
) {
  const commitModule = await import("../../packages/work/server/task-approval-commit");
  return commitModule.commitPreparedWorkTaskPayload(input);
}

async function issueApprovalCommitAuthorization(input: {
  requestId: number;
  requestVersion: number;
  businessActionKey: string;
}) {
  const authorityModule = await import("@workspace/platform/server/approval-commit-authorization");
  return authorityModule.issueApprovalCommitAuthorization(input);
}

const payload = {
  entityType: "item" as const,
  targetType: "department" as const,
  targetId: 3,
  workId: null,
  data: { content: "Prepare budget" },
};

test("direct work-task commits preserve direct service-layer authorization", async () => {
  writes.length = 0;
  const result = await commitPreparedWorkTaskPayload({
    actorUserId: 7,
    submitterUserId: 7,
    operation: "create",
    payload: payload as never,
    authorization: "direct",
  });

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.mutationAuthorization, "direct");
});

test("work-task approved commit rejects a capability bound to another request version", async () => {
  writes.length = 0;
  const authorization = await issueApprovalCommitAuthorization({
    requestId: 41,
    requestVersion: 8,
    businessActionKey: "work.tasks.item.create",
  });
  const result = await commitPreparedWorkTaskPayload({
    actorUserId: 11,
    submitterUserId: 7,
    operation: "create",
    payload: payload as never,
    authorization: "workflow-approved",
    approvalAuthorization: authorization,
    approvalRequest: {
      id: 41,
      version: 9,
      businessActionKey: "work.tasks.item.create",
    },
  });

  assert.equal(result.ok, false);
  assert.equal(writes.length, 0);
});

test("work-task approved commit consumes a matching engine capability", async () => {
  writes.length = 0;
  const authorization = await issueApprovalCommitAuthorization({
    requestId: 41,
    requestVersion: 8,
    businessActionKey: "work.tasks.item.create",
  });
  const input = {
    actorUserId: 11,
    submitterUserId: 7,
    operation: "create" as const,
    payload: payload as never,
    authorization: "workflow-approved" as const,
    approvalAuthorization: authorization,
    approvalRequest: {
      id: 41,
      version: 8,
      businessActionKey: "work.tasks.item.create",
    },
  };

  const result = await commitPreparedWorkTaskPayload(input);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.mutationAuthorization, "workflow-approved");

  const replay = await commitPreparedWorkTaskPayload(input);
  assert.equal(replay.ok, false);
  assert.equal(writes.length, 1);
});
