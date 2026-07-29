import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { getActionContractMetadata } from "@workspace/platform/action-contract-registry";
import type { InventoryClosingContract } from "@workspace/platform/contracts/inventory-closing";
import type { RefreshFinanceCloseRuntime } from "./service";
import type { RefreshFinanceCloseCommand } from "./validation";

const refreshCalls: Array<{
  command: RefreshFinanceCloseCommand;
  runtime: RefreshFinanceCloseRuntime | undefined;
}> = [];

mock.module("./service", {
  namedExports: {
    listFinanceCloseWorkspace: async () => ({ marker: "workspace" }),
    openFinanceClose: async () => ({ ok: true }),
    refreshFinanceClose: async (command: RefreshFinanceCloseCommand, runtime?: RefreshFinanceCloseRuntime) => {
      refreshCalls.push({ command, runtime });
      return { ok: true };
    },
  },
} as never);

const {
  bindExecuteRefreshFinanceCloseRouteCommand,
  executeRefreshFinanceCloseRouteCommand,
} = await import("./route-commands");

const command = { idempotencyKey: "refresh-contract-test" } as RefreshFinanceCloseCommand;
const inventoryClosingContract = {
  inspectPeriodRecords: async () => { throw new Error("not called"); },
  inspectPeriodCountDifferences: async () => { throw new Error("not called"); },
} satisfies InventoryClosingContract;

test("ActionContract commit adapter remains directly executable and fails closed without app composition", async () => {
  await executeRefreshFinanceCloseRouteCommand(command);
  assert.deepEqual(refreshCalls.shift(), { command, runtime: undefined });

  const contract = getActionContractMetadata("finance.ledger.close.refresh");
  assert.equal(
    contract?.domain?.commitKey,
    "packages/finance/server/close/route-commands.executeRefreshFinanceCloseRouteCommand",
  );
});

test("Finance app route factory injects Inventory closing without changing the stable commit adapter", async () => {
  await bindExecuteRefreshFinanceCloseRouteCommand(inventoryClosingContract)(command);
  assert.deepEqual(refreshCalls.shift(), { command, runtime: { inventoryClosingContract } });
});
