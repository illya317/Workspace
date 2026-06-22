import { listOpenApiConsoleData, withOpenApiConsoleAccess } from "@workspace/platform/server/open-api";

export const GET = withOpenApiConsoleAccess(async () => {
  return Response.json(await listOpenApiConsoleData());
});
