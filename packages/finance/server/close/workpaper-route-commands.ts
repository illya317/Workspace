import type {
  FinanceCloseWorkpaperTaskKey,
  ReviewFinanceCloseWorkpaperInput,
  SaveFinanceCloseWorkpaperInput,
} from "../../types/close";
import { buildReadFinanceCloseCommand, type ResolvedFinanceCloseScope } from "./validation";
import { financeCloseWorkpaperValidationDependencies } from "./workpaper-reference-adapter";
import { listFinanceCloseWorkpapers, reviewFinanceCloseWorkpaper, saveFinanceCloseWorkpaper } from "./workpaper-service";
import { buildReviewFinanceCloseWorkpaperCommand, buildSaveFinanceCloseWorkpaperCommand } from "./workpaper-validation";

export async function buildReadFinanceCloseWorkpapersRouteCommand(input: {
  companyCode: string;
  year: number;
  month: number;
  taskKey?: FinanceCloseWorkpaperTaskKey;
}) {
  const result = await buildReadFinanceCloseCommand(input);
  return result.ok ? { ...result, data: { ...result.data, taskKey: input.taskKey } } : result;
}

export const executeReadFinanceCloseWorkpapersRouteCommand = (
  command: ResolvedFinanceCloseScope & { taskKey?: FinanceCloseWorkpaperTaskKey },
) => listFinanceCloseWorkpapers(command, command.taskKey);

export const buildSaveFinanceCloseWorkpaperRouteCommand = (input: SaveFinanceCloseWorkpaperInput, userId: number) => (
  buildSaveFinanceCloseWorkpaperCommand(input, userId, financeCloseWorkpaperValidationDependencies)
);
export const executeSaveFinanceCloseWorkpaperRouteCommand = saveFinanceCloseWorkpaper;

export const buildReviewFinanceCloseWorkpaperRouteCommand = (input: ReviewFinanceCloseWorkpaperInput, userId: number) => (
  buildReviewFinanceCloseWorkpaperCommand(input, userId, financeCloseWorkpaperValidationDependencies)
);
export const executeReviewFinanceCloseWorkpaperRouteCommand = reviewFinanceCloseWorkpaper;
