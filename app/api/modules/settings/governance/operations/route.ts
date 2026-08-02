import { z } from "zod";

import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";
import { listOperationsRecords } from "@workspace/settings/server/operations-records";

const optionalQuery = z.preprocess(
  (value) => typeof value === "string" && value.trim() ? value.trim() : undefined,
  z.string().max(120).optional(),
);

const operationsRecordsQuerySchema = z.object({
  page: z.coerce.number().int().min(0).max(10_000).catch(0),
  pageSize: z.coerce.number().int().min(1).max(100).catch(50),
  query: optionalQuery,
  source: z.enum(["all", "sql-settings", "relation-policy"]).catch("all"),
  status: z.enum(["all", "pending", "running", "succeeded", "failed", "attention"]).catch("all"),
}).strict();

export const GET = createCommandRoute({
  querySchema: operationsRecordsQuerySchema,
  queryError: "运维记录查询参数无效",
  buildCommand: ({ query }) => okCommand(query),
  action: listOperationsRecords,
});
