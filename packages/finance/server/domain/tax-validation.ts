import type {
  TaxCreateCommand,
  TaxUpdateCommand,
} from "../tax/validation";
import {
  buildTaxCreateCommand,
  buildTaxUpdateCommand,
} from "../tax/validation";

export {
  buildTaxCreateCommand,
  buildTaxUpdateCommand,
};

export function validateTaxCreatePersistenceCommand(command: TaxCreateCommand) {
  return buildTaxCreateCommand(command.input, command.userId);
}

export function validateTaxUpdatePersistenceCommand(command: TaxUpdateCommand) {
  return buildTaxUpdateCommand(command.input, command.userId);
}
