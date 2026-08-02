import { z } from "zod";

import {
  buildFinanceAssetExportCommand,
  executeFinanceAssetExportCommand,
} from "@workspace/finance/server/assets/export-route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const querySchema = z.object({
  view: z.enum(["cards", "period", "adjustments"]),
  companyCode: z.string().trim().min(1),
  year: z.coerce.number().int().min(2000).max(2099),
  month: z.coerce.number().int().min(1).max(12),
  keyword: z.string().optional(),
});

export const GET = createCommandRoute({
  querySchema,
  queryError: "资产会计导出条件无效",
  buildCommand: ({ query }) => buildFinanceAssetExportCommand(query),
  action: executeFinanceAssetExportCommand,
});
