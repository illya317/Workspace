import { z } from "zod";

import {
  readRouteId,
  rotateOpenApiClientSecret,
  toOpenApiClientSummary,
  withOpenApiConsoleAccess,
} from "@workspace/platform/server/open-api";

const rotateSecretSchema = z.object({}).passthrough();

export const POST = withOpenApiConsoleAccess(async (request, _user, context) => {
  const clientId = await readRouteId(context?.params);
  if (!clientId) return Response.json({ error: "Client 不存在" }, { status: 404 });
  const parsed = rotateSecretSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "参数错误" }, { status: 400 });

  try {
    const { client, secret } = await rotateOpenApiClientSecret(clientId);
    return Response.json({ client: toOpenApiClientSummary(client), secret });
  } catch {
    return Response.json({ error: "Client 不存在" }, { status: 404 });
  }
});
