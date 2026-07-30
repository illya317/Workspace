import type { InventoryClosingContract } from "@workspace/platform/contracts/inventory-closing";
import type { CompleteFinanceCloseInput, FinanceCloseScope, OpenFinanceCloseInput, RefreshFinanceCloseInput } from "../../types/close";
import { completeFinanceClose, listFinanceCloseWorkspace, openFinanceClose, refreshFinanceClose } from "./service";
import { buildCompleteFinanceCloseCommand, buildOpenFinanceCloseCommand, buildReadFinanceCloseCommand, buildRefreshFinanceCloseCommand, type CompleteFinanceCloseCommand, type OpenFinanceCloseCommand, type RefreshFinanceCloseCommand, type ResolvedFinanceCloseScope } from "./validation";

export const buildReadFinanceCloseRouteCommand = (input: FinanceCloseScope) => buildReadFinanceCloseCommand(input);
export const executeReadFinanceCloseRouteCommand = (command: ResolvedFinanceCloseScope) => listFinanceCloseWorkspace(command);
export const buildOpenFinanceCloseRouteCommand = (input: OpenFinanceCloseInput, userId: number) => buildOpenFinanceCloseCommand(input, userId);
export const executeOpenFinanceCloseRouteCommand = (command: OpenFinanceCloseCommand) => openFinanceClose(command);
export const buildRefreshFinanceCloseRouteCommand = (input: RefreshFinanceCloseInput, userId: number) => buildRefreshFinanceCloseCommand(input, userId);
export const executeRefreshFinanceCloseRouteCommand = (command: RefreshFinanceCloseCommand) => refreshFinanceClose(command);
export const buildCompleteFinanceCloseRouteCommand = (input: CompleteFinanceCloseInput, userId: number) => buildCompleteFinanceCloseCommand(input, userId);
export const executeCompleteFinanceCloseRouteCommand = (command: CompleteFinanceCloseCommand) => completeFinanceClose(command);
export const bindExecuteRefreshFinanceCloseRouteCommand = (inventoryClosingContract: InventoryClosingContract) => (
  command: RefreshFinanceCloseCommand,
) => refreshFinanceClose(command, { inventoryClosingContract });
