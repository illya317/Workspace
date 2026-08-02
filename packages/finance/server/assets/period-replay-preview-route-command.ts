import { previewFinanceAssetPeriodReplay } from "./period-replay-preview-service";
import {
  buildFinanceAssetPeriodReplayPreviewCommand,
  type FinanceAssetPeriodReplayPreviewCommand,
  type FinanceAssetPeriodReplayPreviewInput,
} from "./period-replay-preview-validation";

export function buildFinanceAssetPeriodReplayPreviewRouteCommand(
  input: FinanceAssetPeriodReplayPreviewInput,
) {
  return buildFinanceAssetPeriodReplayPreviewCommand(input);
}

export function executeFinanceAssetPeriodReplayPreviewRouteCommand(
  command: FinanceAssetPeriodReplayPreviewCommand,
) {
  return previewFinanceAssetPeriodReplay(command);
}
