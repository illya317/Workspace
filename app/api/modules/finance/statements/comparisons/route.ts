import { z } from "zod";

import {
  buildImportComparisonWorkbookRouteCommand,
  executeImportComparisonWorkbookRouteCommand,
  executeListComparisonPackagesCommand,
} from "@workspace/finance/server/statements/comparison/route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

export const GET = createCommandRoute({
  buildCommand: () => okCommand({}),
  action: () => executeListComparisonPackagesCommand(),
});

const uploadBodySchema = z.object({
  file: z.instanceof(File),
});

export const POST = createCommandRoute({
  accessError: "没有报表对比证据导入权限",
  bodyParser: "formData",
  bodySchema: uploadBodySchema,
  bodyError: "上传对比证据参数无效",
  buildCommand: ({ body, user, request }) => buildImportComparisonWorkbookRouteCommand({
    file: body.file,
    contentLength: Number(request.headers.get("content-length")) || null,
    userId: user.userId,
  }),
  action: (command) => executeImportComparisonWorkbookRouteCommand(command),
});
