import assert from "node:assert/strict";
import test, { mock } from "node:test";

type MockModule = (specifier: string, options: { namedExports: Record<string, unknown> }) => void;
const mockModule = (mock as unknown as { module: MockModule }).module.bind(mock);

let listCommand: Record<string, unknown> | null = null;

mockModule("@workspace/finance/server/route-commands", {
  namedExports: {
    buildCreateVoucherCommand: () => ({ ok: true, data: {} }),
    executeCreateVoucherCommand: async () => ({}),
    executeListVouchersCommand: async (command: Record<string, unknown>) => {
      listCommand = command;
      return { vouchers: [], total: 0 };
    },
  },
});
mockModule("@workspace/platform/server/domain-validation", {
  namedExports: { okCommand: <T>(data: T) => ({ ok: true as const, data }) },
});
mockModule("@workspace/platform/server/api-route", {
  namedExports: {
    createCommandRoute: (options: {
      querySchema?: { safeParse: (value: unknown) => { success: boolean; data?: unknown } };
      buildCommand: (context: Record<string, unknown>) => Promise<unknown> | unknown;
      action: (command: Record<string, unknown>) => Promise<unknown> | unknown;
    }) => async (request: Request) => {
      const query = Object.fromEntries(new URL(request.url).searchParams);
      const parsed = options.querySchema?.safeParse(query);
      if (parsed && !parsed.success) return new Response(null, { status: 400 });
      const built = await options.buildCommand({
        query: parsed?.data,
        user: { userId: 1 },
      }) as { ok: boolean; data: Record<string, unknown> };
      if (!built.ok) return new Response(null, { status: 400 });
      return Response.json(await options.action(built.data));
    },
  },
});

test("voucher details accept accounting years before 2020", async () => {
  const { GET } = await import("./route");
  listCommand = null;

  const response = await GET(new Request(
    "http://localhost/api/modules/finance/ledger/vouchers?companyCode=ZX01&year=2016&month=12",
  ));

  assert.equal(response.status, 200);
  assert.equal(listCommand?.year, 2016);
  assert.equal(listCommand?.month, 12);
  assert.equal(listCommand?.companyCode, "ZX01");
});
