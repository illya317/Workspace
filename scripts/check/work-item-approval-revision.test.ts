import assert from "node:assert/strict";
import test, { mock } from "node:test";

const currentUpdatedAt = new Date("2026-07-21T02:03:05.005Z");

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
mock.module("@workspace/platform/server/prisma", {
  namedExports: {
    Prisma: {},
    prisma: {
      workItem: {
        findUnique: async () => ({ targetId: 3, updatedAt: currentUpdatedAt }),
      },
    },
  },
} as never);

async function validate(expectedUpdatedAt: string) {
  const adapter = await import("../../packages/work/server/task-approval-adapter");
  return adapter.validateUpdateItemApprovalPayload(7, "17", {
    entityType: "item",
    targetType: "department",
    targetId: 3,
    workId: 17,
    expectedUpdatedAt,
    data: { content: "Agent 修改结果" },
  });
}

test("Work item approval validation rejects a stale proposal before domain preparation", async () => {
  const result = await validate("2026-07-21T02:03:04.005Z");

  assert.deepEqual(result, {
    ok: false,
    error: "工作项已被其他人修改，请刷新后重试",
    status: 409,
  });
});

test("Work item approval validation rejects an invalid proposal revision", async () => {
  const result = await validate("not-a-timestamp");

  assert.deepEqual(result, { ok: false, error: "工作项版本无效", status: 400 });
});
