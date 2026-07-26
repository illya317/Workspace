import { okCommand } from "@workspace/platform/server/domain-validation";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import {
  ErpDiligenceSaveSchema,
  executeErpDiligenceSaveCommand,
  listErpDiligenceWorkspace,
} from "@workspace/administration/server";

export const GET = createCommandRoute({
  buildCommand: ({ user }) => okCommand({ userId: user.userId }),
  action: listErpDiligenceWorkspace,
});

export const PUT = createCommandRoute({
  bodySchema: ErpDiligenceSaveSchema,
  buildCommand: ({ body, user }) => okCommand({ body, userId: user.userId }),
  action: executeErpDiligenceSaveCommand,
});
