import { z } from "zod";

import {
  readRouteId,
  rotateOpenApiClientSecret,
  toOpenApiClientSummary,
  withOpenApiConsoleManage,
} from "@workspace/platform/server/open-api";
import { jsonErrorResponse } from "@workspace/platform/server/api";

const rotateSecretSchema = z.object({}).passthrough();

export const POST = withOpenApiConsoleManage(async (request, _user, context) => {
  const clientId = await readRouteId(context?.params);
  if (!clientId) return jsonErrorResponse("Client 不存在", 404);
  const parsed = rotateSecretSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return jsonErrorResponse("参数错误", 400);

  try {
    const { client, secret } = await rotateOpenApiClientSecret(clientId);
    return Response.json({ client: toOpenApiClientSummary(client), secret });
  } catch {
    return jsonErrorResponse("Client 不存在", 404);
  }
});
