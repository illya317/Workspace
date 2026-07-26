import { z } from "zod";

import {
  serveCompanyOfficeSourceResponse,
  verifyCompanyOfficeSourceToken,
} from "@workspace/platform/server/company-documents";
import { createInternalApiRoute } from "@workspace/platform/server/api-route";

const paramsSchema = z.object({ key: z.string().regex(/^[a-z][a-z0-9-]*$/) });
const querySchema = z.object({ token: z.string().min(32).max(4096) });

export const GET = createInternalApiRoute({
  paramsSchema,
  paramsError: "Invalid company document key",
  querySchema,
  queryError: "Invalid source token",
  authorize: async ({ params, query }) => {
    const claims = await verifyCompanyOfficeSourceToken(query.token);
    return claims?.documentKey === params.key;
  },
  authorizeError: "Invalid or expired source token",
  handler: ({ params, query }) => serveCompanyOfficeSourceResponse({
    documentKey: params.key,
    token: query.token,
  }),
});
