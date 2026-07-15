import { z } from "zod";

import {
  buildListStatementSourcePackagesRouteCommand,
  buildUploadStatementSourcePackageRouteCommand,
  executeListStatementSourcePackagesRouteCommand,
  executeUploadStatementSourcePackageRouteCommand,
} from "@workspace/finance/server/statements/source-package-route-commands";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const scopeSchema = z.object({
  companyCode: z.string().trim().min(1),
  year: z.coerce.number().int().min(2000).max(2099),
  month: z.coerce.number().int().min(1).max(12),
});

const uploadSchema = scopeSchema.extend({
  file: z.instanceof(File),
  note: z.string().trim().max(1000).nullable().optional(),
});

export const GET = createCommandRoute({
  querySchema: scopeSchema,
  queryError: "来源包范围参数无效",
  buildCommand: ({ query }) => buildListStatementSourcePackagesRouteCommand(query),
  action: executeListStatementSourcePackagesRouteCommand,
});

export const POST = createCommandRoute({
  bodyParser: "formData",
  bodySchema: uploadSchema,
  bodyError: "来源包上传参数无效",
  buildCommand: ({ body, user }) => buildUploadStatementSourcePackageRouteCommand(body, user.userId),
  action: executeUploadStatementSourcePackageRouteCommand,
});
