import assert from "node:assert/strict";
import test, { before, mock } from "node:test";
import type { InventoryClosingContract } from "@workspace/platform/contracts/inventory-closing";

const injectedContracts: InventoryClosingContract[] = [];
const rpcCalls: Array<Record<string, unknown>> = [];

mock.module("@workspace/platform/server/auth", {
  namedExports: { authorize: async () => true },
} as never);
mock.module("@workspace/platform/server/api-route", {
  namedExports: { createCommandRoute: (options: unknown) => options },
} as never);
mock.module("@workspace/platform/server/internal-unit-rpc", {
  namedExports: {
    callWorkspaceInternalJson: async (input: Record<string, unknown>) => {
      rpcCalls.push(input);
      return {
        status: "ready",
        inspectionVersion: "route-composition-test-v1",
        blockers: [],
        evidenceRefs: [],
        voucherRefs: [],
        deepLink: "/inventory/operations",
        payload: { inspectionKind: (input.body as { inspectionKind: string }).inspectionKind },
      };
    },
  },
} as never);
mock.module("@workspace/finance/server/close/route-commands", {
  namedExports: {
    buildRefreshFinanceCloseRouteCommand: () => ({ marker: "command" }),
    bindExecuteRefreshFinanceCloseRouteCommand: (contract: InventoryClosingContract) => {
      injectedContracts.push(contract);
      return async () => ({ ok: true });
    },
  },
} as never);

before(async () => {
  await import("./route");
});

test("Finance refresh composition root injects the Inventory contract", async () => {
  assert.equal(injectedContracts.length, 1);
  for (const contract of injectedContracts) {
    const records = await contract.inspectPeriodRecords({ companyCode: "C01", year: 2026, month: 6 });
    const counts = await contract.inspectPeriodCountDifferences({ companyCode: "C01", year: 2026, month: 6 });
    assert.equal(records.status, "ready");
    assert.equal(counts.status, "ready");
  }
  assert.deepEqual(rpcCalls.map((call) => ({
    callerUnitId: call.callerUnitId,
    targetUnitId: call.targetUnitId,
    path: call.path,
    body: call.body,
    maxResponseBytes: call.maxResponseBytes,
  })), [
    ...["records", "count_differences"].map((inspectionKind) => ({
      callerUnitId: "finance",
      targetUnitId: "inventory",
      path: "/api/modules/inventory/internal/closing-inspection",
      body: { scope: { companyCode: "C01", year: 2026, month: 6 }, inspectionKind },
      maxResponseBytes: 512 * 1024,
    })),
  ]);
});
