import { z } from "zod";

import { HR_AUDIT_ENTITY_TYPES } from "@workspace/hr/server/audit-entities";
import { restoreAuditLogSnapshot } from "@workspace/platform/server/audit-log";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const restoreBodySchema = z.object({
  historyId: z.coerce.number().int().positive(),
});

export const POST = createCommandRoute({
  bodySchema: restoreBodySchema,
  bodyError: "缺少 historyId",
  buildCommand: ({ body, user }) => okCommand({
    historyId: body.historyId,
    userId: user.userId,
  }),
  action: ({ historyId, userId }) => restoreAuditLogSnapshot(historyId, userId, {
    allowedEntityTypes: HR_AUDIT_ENTITY_TYPES,
  }),
});
