import assert from "node:assert/strict";
import test, { mock } from "node:test";

type SqlFragment = { strings: string[]; values: unknown[] };
type MockModule = (specifier: string, options: { namedExports: Record<string, unknown> }) => void;
const mockModule = (mock as unknown as { module: MockModule }).module.bind(mock);

const rawQueries: SqlFragment[] = [];
let employmentFindManyCalls = 0;
const employmentFindManyArgs: Array<Record<string, unknown> | undefined> = [];
let employmentFindManyRows: Array<Record<string, unknown>> = [];

function sql(strings: TemplateStringsArray, ...values: unknown[]): SqlFragment {
  return { strings: [...strings], values };
}

mockModule("@workspace/platform/server/prisma", {
  namedExports: {
    Prisma: { empty: sql`` as SqlFragment, sql },
    prisma: {
      $queryRaw: async (query: SqlFragment) => {
        rawQueries.push(query);
        return rawQueries.length === 1
          ? [{ total: 173 }]
          : [{
              employmentId: 5,
              contractIndex: 2,
              contractJson: JSON.stringify({ company: "测试公司" }),
              employeeId: "EMP-X001",
              employeeName: "测试员工",
            }];
      },
      employment: {
        findMany: async (args?: Record<string, unknown>) => {
          employmentFindManyCalls += 1;
          employmentFindManyArgs.push(args);
          return employmentFindManyRows;
        },
      },
      employmentAgreement: {
        findMany: async () => [],
      },
    },
  },
});
mockModule("@workspace/platform/server/business-date", {
  namedExports: { workspaceBusinessDate: () => "2026-07-27" },
});
mockModule("@workspace/platform/server/auth", { namedExports: { checkHRUpdate: async () => true } });
mockModule("@workspace/platform/server/business-action-executor", {
  namedExports: { assertBusinessActionDirectExecutionAllowed: async () => ({ ok: true }) },
});
mockModule("@workspace/platform/server/api", {
  namedExports: {
    isValidDateValue: () => true,
    rejectInvalidDateField: () => null,
    serviceError: (error: string, status: number) => ({ ok: false, error, status }),
    serviceOk: (data: unknown) => ({ ok: true, data }),
  },
});
mockModule("@workspace/platform/server/domain-validation", {
  namedExports: {
    failCommand: (message: string, status = 400, field?: string) => ({ ok: false, issue: { message, status, field } }),
    mapValidationToServiceResult: (value: unknown) => value,
    okCommand: (data: unknown) => ({ ok: true, data }),
  },
});
mockModule("@workspace/platform/server/history", {
  namedExports: { ensureEditHistoryBaseline: async () => undefined, snapshotHistory: async () => undefined },
});
mockModule("@workspace/platform/search", {
  namedExports: { matchEmployee: () => true, matchSearchFields: () => true },
});
mockModule("./domain/contract-validation", {
  namedExports: {
    buildContractCreateCommand: async () => ({ ok: true, data: {} }),
    buildContractDeleteCommand: async () => ({ ok: true, data: {} }),
    buildContractPageDraftCommand: async () => ({ ok: true, data: {} }),
  },
});
mockModule("./employee-position-filters", {
  namedExports: { employeePositionFilterInclude: {}, employeePositionMatches: () => true },
});

const { getContracts } = await import("./contracts");

function collectValues(fragment: unknown): unknown[] {
  if (!fragment || typeof fragment !== "object") return [fragment];
  const sqlFragment = fragment as Partial<SqlFragment>;
  if (!Array.isArray(sqlFragment.values)) return [fragment];
  return sqlFragment.values.flatMap(collectValues);
}

test("default contract tab expands and paginates contracts in PostgreSQL", async () => {
  rawQueries.length = 0;
  employmentFindManyCalls = 0;
  employmentFindManyArgs.length = 0;
  const result = await getContracts({
    keyword: "",
    company: "",
    department: "",
    position: "",
    isActive: "true",
    page: 3,
    pageSize: 50,
  });

  assert.equal(employmentFindManyCalls, 0);
  assert.equal(rawQueries.length, 2);
  assert.match(JSON.stringify(rawQueries[0]), /pg_input_is_valid/);
  assert.match(JSON.stringify(rawQueries[0]), /joinDate.*\\\\d\{4\}/);
  assert.match(JSON.stringify(rawQueries[1]), /jsonb_array_elements/);
  assert.deepEqual(collectValues(rawQueries[1]), ["2026-07-27", "9999-12-30", "2026-07-27", 100, 50]);
  assert.equal(result.total, 173);
  assert.match(result.contracts[0]?.id ?? "", /^legacy:5:[0-9a-f]{24}:1$/);
  assert.equal(result.contracts[0]?.employeeName, "测试员工");
});

test("complex contract filters classify invalid dates consistently", async () => {
  employmentFindManyCalls = 0;
  employmentFindManyArgs.length = 0;
  employmentFindManyRows = [
    {
      id: 10,
      isActive: true,
      joinDate: "0000-00-00",
      leaveDate: null,
      contracts: JSON.stringify([{ company: "非法日期公司" }]),
      employee: { employeeId: "EMP-10", name: "非法日期", positions: [] },
    },
    {
      id: 20,
      isActive: false,
      joinDate: "2026-01-01",
      leaveDate: "2026-12-31",
      contracts: JSON.stringify([{ company: "当前公司" }]),
      employee: { employeeId: "EMP-20", name: "当前员工", positions: [] },
    },
    {
      id: 30,
      isActive: true,
      joinDate: "2026-01-01",
      leaveDate: "9999-12-31",
      contracts: JSON.stringify([{ company: "高日期哨兵公司" }]),
      employee: { employeeId: "EMP-30", name: "高日期哨兵", positions: [] },
    },
  ];

  const active = await getContracts({
    keyword: "测试",
    company: "",
    department: "",
    position: "",
    isActive: "true",
    page: 1,
    pageSize: 50,
  });
  const inactive = await getContracts({
    keyword: "测试",
    company: "",
    department: "",
    position: "",
    isActive: "false",
    page: 1,
    pageSize: 50,
  });

  assert.equal(employmentFindManyCalls, 2);
  assert.deepEqual(employmentFindManyArgs[0]?.where, {});
  assert.deepEqual(employmentFindManyArgs[1]?.where, {});
  assert.deepEqual(active.contracts.map((row) => row.employmentId), [20]);
  assert.deepEqual(inactive.contracts.map((row) => row.employmentId), [10, 30]);
});
