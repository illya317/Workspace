import { okCommand } from "@workspace/platform/server/domain-validation";

import {
  buildCreateFinanceGroupAccountCommand,
  buildDeleteFinanceGroupAccountCommand,
  buildReviewFinanceGroupAccountCommand,
  buildSaveFinanceGroupAccountMappingChangeSetCommand,
  buildUpdateFinanceGroupAccountCommand,
  type CreateFinanceGroupAccountCommandInput,
  type DeleteFinanceGroupAccountCommandInput,
  type ReviewFinanceGroupAccountCommandInput,
  type SaveFinanceGroupAccountMappingChangeSetInput,
  type UpdateFinanceGroupAccountCommandInput,
} from "../../domain/group-chart-validation";
import { createFinanceGroupAccount } from "./create";
import { deleteFinanceGroupAccount } from "./delete";
import { saveFinanceGroupAccountMappingChangeSet } from "./mutations";
import { reviewFinanceGroupAccount } from "./review";
import { updateFinanceGroupAccount } from "./update";

export type CreateFinanceGroupAccountRouteCommandInput =
  { source: "catalog" } & CreateFinanceGroupAccountCommandInput;

export function buildCreateFinanceGroupAccountRouteCommand(input: CreateFinanceGroupAccountRouteCommandInput) {
  const command = buildCreateFinanceGroupAccountCommand(input);
  return command.ok ? okCommand({ source: input.source, input: command.data.input }) : command;
}

export function executeCreateFinanceGroupAccountRouteCommand(command: {
  source: "catalog";
  input: CreateFinanceGroupAccountCommandInput;
}) {
  return createFinanceGroupAccount(command.input);
}

export function buildDeleteFinanceGroupAccountRouteCommand(input: DeleteFinanceGroupAccountCommandInput) {
  const command = buildDeleteFinanceGroupAccountCommand(input);
  return command.ok ? okCommand({ input: command.data.input }) : command;
}

export function executeDeleteFinanceGroupAccountRouteCommand(
  command: { input: DeleteFinanceGroupAccountCommandInput },
) {
  return deleteFinanceGroupAccount(command.input);
}

export function buildUpdateFinanceGroupAccountRouteCommand(input: UpdateFinanceGroupAccountCommandInput) {
  const command = buildUpdateFinanceGroupAccountCommand(input);
  return command.ok ? okCommand({ input: command.data.input }) : command;
}

export function executeUpdateFinanceGroupAccountRouteCommand(
  command: { input: UpdateFinanceGroupAccountCommandInput },
) {
  return updateFinanceGroupAccount(command.input);
}

export function buildReviewFinanceGroupAccountRouteCommand(input: ReviewFinanceGroupAccountCommandInput) {
  const command = buildReviewFinanceGroupAccountCommand(input);
  return command.ok ? okCommand({ input: command.data.input }) : command;
}

export function executeReviewFinanceGroupAccountRouteCommand(
  command: { input: ReviewFinanceGroupAccountCommandInput },
) {
  return reviewFinanceGroupAccount(command.input);
}

export function buildSaveFinanceGroupAccountMappingChangeSetRouteCommand(
  input: SaveFinanceGroupAccountMappingChangeSetInput,
) {
  const command = buildSaveFinanceGroupAccountMappingChangeSetCommand(input);
  return command.ok ? okCommand({ input: command.data.input }) : command;
}

export function executeSaveFinanceGroupAccountMappingChangeSetRouteCommand(
  command: { input: SaveFinanceGroupAccountMappingChangeSetInput },
) {
  return saveFinanceGroupAccountMappingChangeSet(command.input);
}
