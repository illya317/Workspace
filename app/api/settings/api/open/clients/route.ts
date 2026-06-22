import { z } from "zod";

import {
  createOpenApiClient,
  listOpenApiConsoleData,
  toOpenApiClientSummary,
  withOpenApiConsoleAccess,
  withOpenApiConsoleManage,
} from "@workspace/platform/server/open-api";

const createClientSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(240).optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
});

export const GET = withOpenApiConsoleAccess(async () => {
  const data = await listOpenApiConsoleData();
  return Response.json({ clients: data.clients });
});

export const POST = withOpenApiConsoleManage(async (request) => {
  const parsed = createClientSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "参数错误" }, { status: 400 });

  const { client, secret } = await createOpenApiClient(parsed.data);
  return Response.json({ client: toOpenApiClientSummary(client), secret }, { status: 201 });
});
