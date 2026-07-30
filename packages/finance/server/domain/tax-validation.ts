import type {
  TaxCreateCommand,
  TaxUpdateCommand,
  TaxValidationDependencies,
} from "../tax/validation";
import {
  buildTaxCreateCommand,
  buildTaxUpdateCommand,
} from "../tax/validation";

export {
  buildTaxCreateCommand,
  buildTaxUpdateCommand,
};

export function validateTaxCreatePersistenceCommand(command: TaxCreateCommand, dependencies: TaxValidationDependencies) {
  return buildTaxCreateCommand(command.input, command.userId, dependencies);
}

export function validateTaxUpdatePersistenceCommand(command: TaxUpdateCommand, dependencies: TaxValidationDependencies) {
  return buildTaxUpdateCommand(command.input, command.userId, dependencies);
}
