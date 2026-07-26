import assert from "node:assert/strict";
import path from "node:path";
import test, { mock } from "node:test";

process.env.WORKSPACE_CONFIG_DIR = path.resolve("scripts/check/fixtures/tenant-workspace");

type MockModule = (specifier: string, options: { namedExports: Record<string, unknown> }) => void;
const mockModule = (mock as unknown as { module: MockModule }).module.bind(mock);

const edpCalls: Array<Record<string, unknown>> = [];
const employeeCalls: Array<Record<string, unknown>> = [];

mockModule("@workspace/platform/server/prisma", {
  namedExports: {
    prisma: {
      eDP: {
        findMany: async (args: Record<string, unknown>) => {
          edpCalls.push(args);
          const employeeIds = ((args.where as { employeeId?: { in?: number[] } }).employeeId?.in ?? []);
          return employeeIds.includes(1)
            ? [{ reportToPositionId: 10 }, { reportToPositionId: 10 }]
            : [];
        },
      },
      employee: {
        findMany: async (args: Record<string, unknown>) => {
          employeeCalls.push(args);
          return [{ id: 2 }];
        },
      },
    },
  },
});

const { listRecursiveSuperiorEmployeeIds } = await import("./work-superior-employees");

test("recursive superior resolution follows the effective reporting position and derives its occupant", async () => {
  edpCalls.length = 0;
  employeeCalls.length = 0;

  assert.deepEqual(await listRecursiveSuperiorEmployeeIds([1]), [2]);
  assert.deepEqual(edpCalls[0]?.select, { reportToPositionId: true });
  const managerWhere = employeeCalls[0]?.where as {
    OR?: unknown;
    positions?: { some?: { positionId?: { in?: number[] } } };
  };
  assert.deepEqual(managerWhere.positions?.some?.positionId?.in, [10]);
  assert.equal(managerWhere.OR, undefined);
});
