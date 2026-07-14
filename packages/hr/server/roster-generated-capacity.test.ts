import assert from "node:assert/strict";
import test, { mock } from "node:test";

type MockModule = (specifier: string, options: { namedExports: Record<string, unknown> }) => void;
const mockModule = (mock as unknown as { module: MockModule }).module.bind(mock);

const countCalls: unknown[] = [];
const findManyCalls: Array<Record<string, unknown>> = [];

mockModule("@workspace/platform/search", {
  namedExports: {
    matchSearchFields: () => true,
  },
});
mockModule("@workspace/platform/server/prisma", {
  namedExports: {
    Prisma: {},
    prisma: {
      employee: {
        count: async (args: unknown) => {
          countCalls.push(args);
          return 173;
        },
        findMany: async (args: Record<string, unknown>) => {
          findManyCalls.push(args);
          return [{
            id: 1,
            employeeId: "00001",
            name: "测试员工",
            gender: true,
            education: "本科",
            phone: null,
            employments: [],
            positions: [],
          }];
        },
      },
    },
  },
});
mockModule("./contract-records", {
  namedExports: {
    buildContractRows: () => [],
  },
});
mockModule("./employments", {
  namedExports: {
    primaryContractCompany: () => null,
  },
});

const { previewRosterGenerated } = await import("./roster-generated");

test("default HR generated roster reads only the requested database page", async () => {
  countCalls.length = 0;
  findManyCalls.length = 0;

  const preview = await previewRosterGenerated({
    variant: "dueDiligence",
    status: "active",
    page: 2,
    pageSize: 50,
  });

  assert.equal(countCalls.length, 1);
  assert.equal(findManyCalls.length, 1);
  assert.deepEqual(findManyCalls[0]?.where, { employments: { some: { isActive: true } } });
  assert.equal(findManyCalls[0]?.skip, 50);
  assert.equal(findManyCalls[0]?.take, 50);
  assert.equal(preview.totalEmployees, 173);
  assert.equal(preview.groups.length, 1);
});

test("due-diligence roster exposes exactly the requested default columns", async () => {
  const preview = await previewRosterGenerated({
    variant: "dueDiligence",
    status: "all",
    page: 1,
    pageSize: 50,
  });
  const labels = preview.columns
    .filter((column) => column.required || column.defaultVisible)
    .map((column) => column.label);

  assert.deepEqual(labels, ["姓名", "部门", "岗位", "性别", "学历", "入职时间"]);
});
