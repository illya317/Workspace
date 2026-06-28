import { z } from "zod";

import { executeQcTemplateDetailCommand } from "@workspace/production/server/qc";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const qcTemplateParamsSchema = z.object({
  templateId: z.string().min(1),
});

export const GET = createCommandRoute({
  paramsSchema: qcTemplateParamsSchema,
  paramsError: "缺少模板 ID",
  buildCommand: ({ params }) => okCommand(params),
  action: executeQcTemplateDetailCommand,
});
