import type { TaxCreateInput, TaxScope, TaxUpdateInput } from "../../types/tax";
import { executeTaxCreate, executeTaxUpdate, listTaxWorkspace } from "./service";
import {
  buildTaxCreateCommand,
  buildTaxUpdateCommand,
  type TaxCreateCommand,
  type TaxUpdateCommand,
} from "./validation";
import { taxValidationDependencies } from "./reference-adapter";

export function buildCreateTaxRouteCommand(input: TaxCreateInput, userId: number) {
  return buildTaxCreateCommand(input, userId, taxValidationDependencies);
}

export function executeCreateTaxRouteCommand(command: TaxCreateCommand) {
  return executeTaxCreate(command);
}

export function buildUpdateTaxRouteCommand(input: TaxUpdateInput, userId: number) {
  return buildTaxUpdateCommand(input, userId, taxValidationDependencies);
}

export function executeUpdateTaxRouteCommand(command: TaxUpdateCommand) {
  return executeTaxUpdate(command);
}

export function executeListTaxWorkspaceCommand(scope: TaxScope) {
  return listTaxWorkspace(scope);
}
