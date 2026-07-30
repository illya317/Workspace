import assert from "node:assert/strict";
import test from "node:test";

import type { Prisma } from "@workspace/platform/server/prisma";
import {
  commitProjectNotificationRulePublishInTransaction,
  PROJECT_NOTIFICATION_PUBLISHED_RULE_CAPACITY_MESSAGE,
} from "./project-notification-rule-lifecycle";
import { PROJECT_NOTIFICATION_MAX_PUBLISHED_RULES_PER_PROJECT } from "./project-notification-signal-contract";

const publishInput = {
  ruleId: 17,
  projectId: 42,
  revision: 3,
  expectedVersion: 8,
  actorUserId: 7,
  occurredAt: new Date("2026-07-31T08:00:00.000Z"),
};

test("serializes capacity under the project lock and allows the 500th published rule", async () => {
  const fixture = transactionFixture({ status: "draft", publishedRuleCount: 499 });
  const result = await commitProjectNotificationRulePublishInTransaction(
    fixture.tx,
    publishInput,
  );

  assert.equal(result.outcome, "published");
  assert.deepEqual(fixture.calls, [
    "lock-project",
    "lock-rule",
    "count-published",
    "cas-update",
    "append-lifecycle-event",
    "load-rule",
  ]);
});

test("rejects the 501st published rule with the stable 409 contract", async () => {
  const fixture = transactionFixture({ status: "draft", publishedRuleCount: 500 });
  const result = await commitProjectNotificationRulePublishInTransaction(
    fixture.tx,
    publishInput,
  );

  assert.equal(result.outcome, "capacity-exceeded");
  if (result.outcome !== "capacity-exceeded") return;
  assert.deepEqual(result.error, {
    message: PROJECT_NOTIFICATION_PUBLISHED_RULE_CAPACITY_MESSAGE,
    status: 409,
    details: {
      publishedRuleCount: 500,
      publishedRuleMaxCount: PROJECT_NOTIFICATION_MAX_PUBLISHED_RULES_PER_PROJECT,
    },
  });
  assert.deepEqual(fixture.calls, ["lock-project", "lock-rule", "count-published"]);
});

test("publishing a new revision of an existing published rule consumes no new slot", async () => {
  const fixture = transactionFixture({ status: "published", publishedRuleCount: 500 });
  const result = await commitProjectNotificationRulePublishInTransaction(
    fixture.tx,
    publishInput,
  );

  assert.equal(result.outcome, "published");
  assert.deepEqual(fixture.calls, [
    "lock-project",
    "lock-rule",
    "cas-update",
    "append-lifecycle-event",
    "load-rule",
  ]);
});

function transactionFixture(input: { status: string; publishedRuleCount: number }) {
  const calls: string[] = [];
  let lockedQueryCount = 0;
  const tx = {
    $queryRaw: async () => {
      lockedQueryCount += 1;
      if (lockedQueryCount === 1) {
        calls.push("lock-project");
        return [{ id: publishInput.projectId }];
      }
      calls.push("lock-rule");
      return [{
        id: publishInput.ruleId,
        status: input.status,
        revision: publishInput.revision,
        version: publishInput.expectedVersion,
      }];
    },
    projectNotificationRule: {
      count: async () => {
        calls.push("count-published");
        return input.publishedRuleCount;
      },
      updateMany: async () => {
        calls.push("cas-update");
        return { count: 1 };
      },
      findUnique: async () => {
        calls.push("load-rule");
        return { id: publishInput.ruleId };
      },
    },
    $executeRaw: async () => {
      calls.push("append-lifecycle-event");
      return 1;
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, calls };
}
