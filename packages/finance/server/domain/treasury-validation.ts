import type {
  TreasuryCreateCommand,
  TreasuryUpdateCommand,
} from "../treasury/validation";
import {
  buildTreasuryCreateCommand,
  buildTreasuryUpdateCommand,
} from "../treasury/validation";

export {
  buildTreasuryCreateCommand,
  buildTreasuryUpdateCommand,
};

export function validateTreasuryCreatePersistenceCommand(command: TreasuryCreateCommand) {
  return buildTreasuryCreateCommand(command.input, command.userId);
}

export function validateTreasuryUpdatePersistenceCommand(command: TreasuryUpdateCommand) {
  return buildTreasuryUpdateCommand(command.input, command.userId);
}
