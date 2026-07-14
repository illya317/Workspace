import assert from "node:assert/strict";
import test, { mock } from "node:test";

import type { ApprovalRequestRecord } from "@workspace/platform/server/approvals";
import type { WorkTaskApprovalPayload } from "./task-approval-helpers";

type MockModule = (specifier: string, options: { namedExports: Record<string, unknown> }) => void;
const mockModule = (mock as unknown as { module: MockModule }).module.bind(mock);

let approved = true;
let permissionCalls: Array<{ userId: number; targetType: string; targetId: number }> = [];
let userEnumerationCalls = 0;

mockModule("@workspace/platform/server/approvals/workflow-node-handlers", {
  namedExports: {
    resolveWorkflowNodeHandlerUserIds: async (
      _request: unknown,
      input: { resolvePermission: () => Promise<number[]> },
    ) => {
      await input.resolvePermission();
      return input.resolvePermission();
    },
  },
});
mockModule("@workspace/platform/server/business-space-natural-users", {
  namedExports: {
    listDepartmentResponsibleUserIds: async () => [],
    listDirectManagerUserIds: async () => [],
  },
});
mockModule("@workspace/platform/server/prisma", {
  namedExports: {
    prisma: {
      user: {
        findMany: async () => {
          userEnumerationCalls += 1;
          return [];
        },
      },
    },
  },
});
mockModule("./access", {
  namedExports: {
    canApproveWorkTaskAction: async (userId: number, targetType: string, targetId: number) => {
      permissionCalls.push({ userId, targetType, targetId });
      return approved;
    },
  },
});
mockModule("./task-approval-helpers", {
  namedExports: {
    approvalControlTarget: (payload: WorkTaskApprovalPayload) => ({
      targetType: payload.targetType,
      targetId: payload.targetId,
    }),
  },
});

const { canProcessWorkTaskRequest } = await import("./task-approval-handlers");

function request(activeWorkflowNodeKey: string | null, targetId = 8) {
  return {
    handlerSource: "permission",
    activeWorkflowNodeKey,
    latestPayload: {
      targetType: "department",
      targetId,
      entityType: "item",
      data: {},
      workId: null,
    },
  } as ApprovalRequestRecord<WorkTaskApprovalPayload>;
}

function reset() {
  approved = true;
  permissionCalls = [];
  userEnumerationCalls = 0;
}

test("checks only the current actor for permission-based requests", async () => {
  reset();
  assert.equal(await canProcessWorkTaskRequest(42, request(null)), true);
  assert.deepEqual(permissionCalls, [{ userId: 42, targetType: "department", targetId: 8 }]);
  assert.equal(userEnumerationCalls, 0);
});

test("narrows workflow-node permission resolution to the current actor", async () => {
  reset();
  assert.equal(await canProcessWorkTaskRequest(42, request("approval-1")), true);
  assert.deepEqual(permissionCalls, [{ userId: 42, targetType: "department", targetId: 8 }]);
  assert.equal(userEnumerationCalls, 0);
});

test("rejects the current actor without enumerating other users", async () => {
  reset();
  approved = false;
  assert.equal(await canProcessWorkTaskRequest(42, request("approval-1")), false);
  assert.equal(permissionCalls.length, 1);
  assert.equal(userEnumerationCalls, 0);
});

test("keeps multi-user workflow permission checks linear in users times requests", async () => {
  reset();
  const users = Array.from({ length: 64 }, (_, index) => index + 1);
  const requests = Array.from({ length: 7 }, (_, index) => request("approval-1", index + 1));

  const results = await Promise.all(users.flatMap((userId) => (
    requests.map((approvalRequest) => canProcessWorkTaskRequest(userId, approvalRequest))
  )));

  assert.equal(results.every(Boolean), true);
  assert.equal(permissionCalls.length, users.length * requests.length);
  assert.equal(
    new Set(permissionCalls.map((call) => `${call.userId}:${call.targetId}`)).size,
    users.length * requests.length,
  );
  assert.equal(userEnumerationCalls, 0);
});
