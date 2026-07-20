import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { serviceError, serviceOk } from "../api";

const claimedRequest = {
  id: 41,
  version: 8,
  status: "committing",
  submitterUserId: 7,
  businessActionKey: "hr.roster.department.create",
  latestPayload: { name: "Operations" },
};
let recordedFailure: { request: typeof claimedRequest; actorUserId: number; error: string } | null = null;

mock.module("../prisma", {
  namedExports: { prisma: {} },
} as never);
mock.module("./notifications", {
  namedExports: { notifyApproval: async () => undefined },
} as never);
mock.module("./workflow", {
  namedExports: {
    assertApprovalHandlersAvailable: async () => serviceOk({}),
    assertWorkflowProcessAllowed: () => serviceOk({}),
    workflowResolutionEventType: () => "approve",
  },
} as never);
mock.module("./approval-mode", {
  namedExports: {
    canActorAutoProcess: async () => false,
    recordAllApprovalProgressIfNeeded: async () => serviceOk({ complete: false }),
  },
} as never);
mock.module("./store", {
  namedExports: {
    appendApprovalEvent: async () => undefined,
    applyApprovalTransition: async () => {
      throw new Error("transition must not run after validation failure");
    },
    claimApprovalForCommit: async () => serviceOk(claimedRequest),
    getApprovalRequestDto: async () => serviceOk({}),
    recordApprovalCommitFailed: async (request: typeof claimedRequest, actorUserId: number, error: string) => {
      recordedFailure = { request, actorUserId, error };
    },
  },
} as never);
mock.module("./serialization", {
  namedExports: { toRecord: (value: unknown) => value },
} as never);
mock.module("./runtime", {
  namedExports: {
    activeWorkflowNodeKeys: () => [],
    requestForWorkflowNode: (value: unknown) => value,
    requestWithWorkflowState: (value: unknown) => value,
    workflowRuntimeUpdateData: () => ({}),
  },
} as never);
mock.module("../workflow-policy-nodes", {
  namedExports: { resolveNextWorkflowStateForPayload: () => serviceOk({ activeNodeKeys: [] }) },
} as never);
mock.module("@workspace/platform/server/approval-commit-authorization", {
  namedExports: {
    issueApprovalCommitAuthorization: () => {
      throw new Error("authorization must not be issued after validation failure");
    },
  },
} as never);
mock.module("./contract-validation", {
  namedExports: {
    validateApprovalRequestAtPhase: async () => serviceError("提交前业务状态已变化", 409),
  },
} as never);

const { commitSubmittedApproval } = await import("./advance");

test("commit validation failure restores the claimed approval and never calls the adapter commit", async () => {
  let commits = 0;
  const result = await commitSubmittedApproval({
    commitApprovedPayload: async () => {
      commits += 1;
      return serviceOk({ entityType: "department", entityId: "9" });
    },
  } as never, {
    request: { ...claimedRequest, status: "submitted", version: 7 } as never,
    actorUserId: 11,
  });

  assert.deepEqual(result, { ok: false, error: "提交前业务状态已变化", status: 409 });
  assert.equal(commits, 0);
  assert.deepEqual(recordedFailure, {
    request: claimedRequest,
    actorUserId: 11,
    error: "提交前业务状态已变化",
  });
});
