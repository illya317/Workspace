import assert from "node:assert/strict";
import test, { mock } from "node:test";

type MockModule = (specifier: string, options: { namedExports: Record<string, unknown> }) => void;
const mockModule = (mock as unknown as { module: MockModule }).module.bind(mock);

let listCommand: Record<string, unknown> | null = null;

mockModule("@workspace/finance/server/route-commands", {
  namedExports: {
    buildListVouchersCommand: (input: Record<string, unknown>) => ({ ok: true, data: input }),
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
  const received = listCommand as unknown as Record<string, unknown>;
  assert.equal(received.year, 2016);
  assert.equal(received.month, 12);
  assert.equal(received.companyCode, "ZX01");
});

test("group voucher audit drill-through accepts one source line id", async () => {
  const { GET } = await import("./route");
  listCommand = null;

  const response = await GET(new Request(
    "http://localhost/api/modules/finance/ledger/vouchers?voucherKind=group&sourceTraceLineId=15269",
  ));

  assert.equal(response.status, 200);
  const received = listCommand as unknown as Record<string, unknown>;
  assert.equal(received.voucherKind, "group");
  assert.equal(received.sourceTraceLineId, 15269);
});

test("voucher details accept the shared annual and quarterly period filter", async () => {
  const { GET } = await import("./route");
  listCommand = null;

  const response = await GET(new Request(
    "http://localhost/api/modules/finance/ledger/vouchers?voucherKind=group&year=2026&month=6&periodKind=quarter",
  ));

  assert.equal(response.status, 200);
  const received = listCommand as unknown as Record<string, unknown>;
  assert.equal(received.year, 2026);
  assert.equal(received.month, 6);
  assert.equal(received.periodKind, "quarter");
});

test("group voucher details accept a history-through-period scope", async () => {
  const { GET } = await import("./route");
  listCommand = null;

  const response = await GET(new Request(
    "http://localhost/api/modules/finance/ledger/vouchers?voucherKind=group&year=2026&month=6&voucherPeriodScope=history",
  ));

  assert.equal(response.status, 200);
  const received = listCommand as unknown as Record<string, unknown>;
  assert.equal(received.voucherPeriodScope, "history");
});
