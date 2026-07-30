import type {
  TreasuryCreateCommand,
  TreasuryUpdateCommand,
  TreasuryValidationDependencies,
} from "../treasury/validation";
import {
  buildTreasuryCreateCommand,
  buildTreasuryUpdateCommand,
} from "../treasury/validation";

export {
  buildTreasuryCreateCommand,
  buildTreasuryUpdateCommand,
};

export function validateTreasuryCreatePersistenceCommand(command: TreasuryCreateCommand, dependencies: TreasuryValidationDependencies) {
  return buildTreasuryCreateCommand(command.input, command.userId, dependencies);
}

export function validateTreasuryUpdatePersistenceCommand(command: TreasuryUpdateCommand, dependencies: TreasuryValidationDependencies) {
  return buildTreasuryUpdateCommand(command.input, command.userId, dependencies);
}
