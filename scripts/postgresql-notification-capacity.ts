import "dotenv/config";

import { listUserNotifications } from "@workspace/platform/server/notifications";
import { prisma } from "@workspace/platform/server/prisma";
import { assertNotificationPublicationTransactions } from "./postgresql-notification-publication";
import {
  WORK_TASK_APPROVAL_SUBJECT,
  getWorkTaskApprovalResourceKey,
} from "@workspace/work/server/task-approval-helpers";
import { registerWorkWorkflowTodoProvider } from "@workspace/work/server/workflow-todo-provider";

const LOGIN_USER_COUNT = 173;
const CONCURRENT_READER_COUNT = 8;
const SUBMITTED_REQUEST_COUNT = 7;
const CAPACITY_TIMEOUT_MS = 15_000;

type NotificationListResult = Awaited<ReturnType<typeof listUserNotifications>>;
type CapacityReadResults = PromiseSettledResult<NotificationListResult>[];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
}

async function assertCiDatabase() {
  const rows = await prisma.$queryRaw<Array<{ databaseName: string }>>`
    SELECT current_database() AS "databaseName"
  `;
  const databaseName = rows[0]?.databaseName ?? "";
  assert(databaseName.endsWith("_ci"), `notification capacity gate is isolated to a *_ci database (${databaseName})`);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`notification capacity gate exceeded ${timeoutMs} ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function main() {
  const prefix = `capacity-${process.pid}-${Date.now()}`;
  const usernames = Array.from({ length: LOGIN_USER_COUNT }, (_, index) => `${prefix}-${index + 1}`);
  let capacityReads: Promise<CapacityReadResults> | null = null;

  await assertCiDatabase();
  registerWorkWorkflowTodoProvider();

  try {
    await assertNotificationPublicationTransactions();
    await prisma.user.createMany({
      data: usernames.map((username) => ({ username, canLogin: true })),
    });
    const users = await prisma.user.findMany({
      where: { username: { startsWith: prefix } },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    assert(users.length === LOGIN_USER_COUNT, `capacity fixture contains ${LOGIN_USER_COUNT} login users`);

    const submitterUserId = users[0]!.id;
    await prisma.approvalRequest.createMany({
      data: Array.from({ length: SUBMITTED_REQUEST_COUNT }, (_, index) => ({
        resourceKey: getWorkTaskApprovalResourceKey("department"),
        scopeId: "department:2147483647",
        businessActionKey: "work.tasks.item.create",
        flowType: "approval",
        separationPolicy: "auto_pass_if_authorized",
        handlerSource: "permission",
        workflowNodesJson: "[]",
        activeWorkflowNodeKeysJson: "[]",
        workflowJoinStateJson: "{}",
        subjectType: WORK_TASK_APPROVAL_SUBJECT,
        operation: "create",
        status: "submitted",
        latestPayloadJson: JSON.stringify({
          targetType: "department",
          targetId: 2_147_483_647,
          entityType: "item",
          workId: null,
          data: { content: `capacity request ${index + 1}` },
        }),
        submitterUserId,
        submittedAt: new Date(),
      })),
    });

    const readers = users.slice(0, CONCURRENT_READER_COUNT);
    const startedAt = performance.now();
    const loggedErrors: unknown[][] = [];
    const originalConsoleError = console.error;
    console.error = (...args: unknown[]) => {
      loggedErrors.push(args);
      originalConsoleError(...args);
    };
    let results: CapacityReadResults;
    try {
      capacityReads = Promise.allSettled(readers.map((user) => (
        listUserNotifications(user.id, { limit: 1, category: "all" })
      )));
      results = await withTimeout(capacityReads, CAPACITY_TIMEOUT_MS);
    } finally {
      console.error = originalConsoleError;
    }
    const elapsedMs = Math.round(performance.now() - startedAt);
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    assert(failures.length === 0, `${CONCURRENT_READER_COUNT} concurrent notification reads complete without pool errors`);
    assert(loggedErrors.length === 0, "workflow providers do not swallow and downgrade pool/query errors");
    assert(
      elapsedMs <= CAPACITY_TIMEOUT_MS,
      `notification reads stay within the ${CAPACITY_TIMEOUT_MS} ms capacity budget (${elapsedMs} ms)`,
    );
    assert(
      results.every((result) => result.status === "fulfilled" && result.value.tabCounts.workflowTodo === 0),
      `${SUBMITTED_REQUEST_COUNT} submitted Work requests are evaluated for each reader without false todos`,
    );
  } finally {
    if (capacityReads) {
      await Promise.race([
        capacityReads,
        new Promise((resolve) => setTimeout(resolve, 6_000)),
      ]);
    }
    await prisma.approvalRequest.deleteMany({
      where: { submitter: { username: { startsWith: prefix } } },
    });
    await prisma.user.deleteMany({ where: { username: { startsWith: prefix } } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
