import { z } from "zod";

import {
  readRouteId,
  updateOpenApiClientScopes,
  withOpenApiConsoleManage,
} from "@workspace/platform/server/open-api";
import { jsonErrorResponse } from "@workspace/platform/server/api";

const updateScopesSchema = z.object({
  scopeKeys: z.array(z.string().min(1)).max(200),
});

export const PUT = withOpenApiConsoleManage(async (request, _user, context) => {
  const clientId = await readRouteId(context?.params);
  if (!clientId) return jsonErrorResponse("Client 不存在", 404);

  const parsed = updateScopesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonErrorResponse("参数错误", 400);

  try {
    await updateOpenApiClientScopes(clientId, parsed.data.scopeKeys);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message.startsWith("OPEN_API_CLIENT_NOT_FOUND:") ? 404 : 400;
    return jsonErrorResponse(status === 404 ? "Client 不存在" : "Scope 不存在", status);
  }
});
