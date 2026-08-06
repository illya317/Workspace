import {
  comparisonTargetPreviewQuerySchema,
  executeComparisonTargetPreviewCommand,
} from "@workspace/finance/server/statements/comparison/route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

export const GET = createCommandRoute({
  querySchema: comparisonTargetPreviewQuerySchema,
  queryError: "对比目标预览参数无效",
  buildCommand: ({ query }) => okCommand(query),
  action: (query) => executeComparisonTargetPreviewCommand(query),
});
