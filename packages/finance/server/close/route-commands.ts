import type { InventoryClosingContract } from "@workspace/platform/contracts/inventory-closing";
import type { FinanceCloseScope, OpenFinanceCloseInput, RefreshFinanceCloseInput } from "../../types/close";
import { listFinanceCloseWorkspace, openFinanceClose, refreshFinanceClose } from "./service";
import { buildOpenFinanceCloseCommand, buildReadFinanceCloseCommand, buildRefreshFinanceCloseCommand, type OpenFinanceCloseCommand, type RefreshFinanceCloseCommand, type ResolvedFinanceCloseScope } from "./validation";

export const buildReadFinanceCloseRouteCommand = (input: FinanceCloseScope) => buildReadFinanceCloseCommand(input);
export const executeReadFinanceCloseRouteCommand = (command: ResolvedFinanceCloseScope) => listFinanceCloseWorkspace(command);
export const buildOpenFinanceCloseRouteCommand = (input: OpenFinanceCloseInput, userId: number) => buildOpenFinanceCloseCommand(input, userId);
export const executeOpenFinanceCloseRouteCommand = (command: OpenFinanceCloseCommand) => openFinanceClose(command);
export const buildRefreshFinanceCloseRouteCommand = (input: RefreshFinanceCloseInput, userId: number) => buildRefreshFinanceCloseCommand(input, userId);
export const executeRefreshFinanceCloseRouteCommand = (command: RefreshFinanceCloseCommand) => refreshFinanceClose(command);
export const bindExecuteRefreshFinanceCloseRouteCommand = (inventoryClosingContract: InventoryClosingContract) => (
  command: RefreshFinanceCloseCommand,
) => refreshFinanceClose(command, { inventoryClosingContract });
