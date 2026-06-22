import { z } from "zod";

import {
  readRouteId,
  updateOpenApiClientScopes,
  withOpenApiConsoleManage,
} from "@workspace/platform/server/open-api";

const updateScopesSchema = z.object({
  scopeKeys: z.array(z.string().min(1)).max(200),
});

export const PUT = withOpenApiConsoleManage(async (request, _user, context) => {
  const clientId = await readRouteId(context?.params);
  if (!clientId) return Response.json({ error: "Client 不存在" }, { status: 404 });

  const parsed = updateScopesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "参数错误" }, { status: 400 });

  try {
    await updateOpenApiClientScopes(clientId, parsed.data.scopeKeys);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message.startsWith("OPEN_API_CLIENT_NOT_FOUND:") ? 404 : 400;
    return Response.json({ error: status === 404 ? "Client 不存在" : "Scope 不存在" }, { status });
  }
});
