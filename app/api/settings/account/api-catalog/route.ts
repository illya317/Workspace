import { buildPersonalApiCatalog } from "@workspace/platform/server/personal-api-catalog";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { serviceOk } from "@workspace/platform/server/api";
import { okCommand } from "@workspace/platform/server/domain-validation";

export const GET = createCommandRoute({
  buildCommand: ({ user }) => okCommand({ userId: user.userId }),
  action: () => serviceOk({ success: true, data: buildPersonalApiCatalog() }),
});
