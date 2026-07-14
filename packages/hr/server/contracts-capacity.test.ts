import assert from "node:assert/strict";
import test, { mock } from "node:test";

type SqlFragment = { strings: string[]; values: unknown[] };
type MockModule = (specifier: string, options: { namedExports: Record<string, unknown> }) => void;
const mockModule = (mock as unknown as { module: MockModule }).module.bind(mock);

const rawQueries: SqlFragment[] = [];
let employmentFindManyCalls = 0;

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
              employeeId: "00001",
              employeeName: "测试员工",
            }];
      },
      employment: {
        findMany: async () => {
          employmentFindManyCalls += 1;
          return [];
        },
      },
    },
  },
});
mockModule("@workspace/platform/server/auth", { namedExports: { checkHRUpdate: async () => true } });
mockModule("@workspace/platform/server/business-action-executor", {
  namedExports: { assertBusinessActionDirectExecutionAllowed: async () => ({ ok: true }) },
});
mockModule("@workspace/platform/server/api", {
  namedExports: {
    serviceError: (error: string, status: number) => ({ ok: false, error, status }),
    serviceOk: (data: unknown) => ({ ok: true, data }),
  },
});
mockModule("@workspace/platform/server/domain-validation", {
  namedExports: { mapValidationToServiceResult: (value: unknown) => value },
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
  assert.match(JSON.stringify(rawQueries[1]), /jsonb_array_elements/);
  assert.deepEqual(collectValues(rawQueries[1]), [true, 100, 50]);
  assert.equal(result.total, 173);
  assert.equal(result.contracts[0]?.id, 5002);
  assert.equal(result.contracts[0]?.employeeName, "测试员工");
});
