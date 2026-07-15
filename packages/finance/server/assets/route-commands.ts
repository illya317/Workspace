import type { CreateFinanceAssetAdjustmentInput, CreateFinanceAssetCardInput } from "../../types/assets";
import { createFinanceAssetAdjustment, createFinanceAssetCard, listFinanceAssetWorkspace, recalculateFinanceAssetPeriod } from "./service";
import { buildCreateFinanceAssetAdjustmentCommand, buildCreateFinanceAssetCardCommand, buildRecalculateFinanceAssetPeriodCommand } from "./validation";

export function buildCreateFinanceAssetCardRouteCommand(input: CreateFinanceAssetCardInput, userId: number) {
  return buildCreateFinanceAssetCardCommand(input, userId);
}

export function executeCreateFinanceAssetCardRouteCommand(command: { input: CreateFinanceAssetCardInput; userId: number }) {
  return createFinanceAssetCard(command.input, command.userId);
}

export function buildCreateFinanceAssetAdjustmentRouteCommand(input: CreateFinanceAssetAdjustmentInput, userId: number) {
  return buildCreateFinanceAssetAdjustmentCommand(input, userId);
}

export function executeCreateFinanceAssetAdjustmentRouteCommand(command: { input: CreateFinanceAssetAdjustmentInput; userId: number }) {
  return createFinanceAssetAdjustment(command.input, command.userId);
}

export function executeListFinanceAssetWorkspaceCommand(command: { companyCode: string; year: number; month: number }) {
  return listFinanceAssetWorkspace(command);
}

export function executeRecalculateFinanceAssetPeriodCommand(command: { companyCode: string; year: number; month: number }) {
  return recalculateFinanceAssetPeriod(command);
}

export function buildRecalculateFinanceAssetPeriodRouteCommand(input: { companyCode: string; year: number; month: number }) {
  return buildRecalculateFinanceAssetPeriodCommand(input);
}
