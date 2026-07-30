import type { TreasuryCreateInput, TreasuryScope, TreasuryUpdateInput } from "../../types/treasury";
import { executeTreasuryCreate, executeTreasuryUpdate, listTreasuryWorkspace } from "./service";
import {
  buildTreasuryCreateCommand,
  buildTreasuryUpdateCommand,
  type TreasuryCreateCommand,
  type TreasuryUpdateCommand,
} from "./validation";
import { defaultTreasuryValidationDependencies } from "./reference-adapter";

export function buildTreasuryCreateRouteCommand(input: TreasuryCreateInput, userId: number) {
  return buildTreasuryCreateCommand(input, userId, defaultTreasuryValidationDependencies);
}

export function executeTreasuryCreateRouteCommand(command: TreasuryCreateCommand) {
  return executeTreasuryCreate(command);
}

export function buildTreasuryUpdateRouteCommand(input: TreasuryUpdateInput, userId: number) {
  return buildTreasuryUpdateCommand(input, userId, defaultTreasuryValidationDependencies);
}

export function executeTreasuryUpdateRouteCommand(command: TreasuryUpdateCommand) {
  return executeTreasuryUpdate(command);
}

export function executeListTreasuryWorkspaceCommand(command: TreasuryScope) {
  return listTreasuryWorkspace(command);
}
