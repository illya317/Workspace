import { z } from "zod";

import {
  buildOwnershipProjectionRebuildCommand,
  OwnershipProjectionRebuildError,
  rebuildOwnershipProjection,
} from "@workspace/capital-securities/server";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const rebuildBodySchema = z.object({
  issuerCompanyId: z.coerce.number().int().positive(),
  triggerReason: z.string().trim().max(500).optional().nullable(),
});

export const POST = createCommandRoute({
  bodySchema: rebuildBodySchema,
  buildCommand: ({ body, user }) => buildOwnershipProjectionRebuildCommand({
    ...body,
    triggeredBy: user.userId,
  }),
  action: async (command) => {
    try {
      return serviceOk({ receipt: await rebuildOwnershipProjection(command) });
    } catch (error) {
      if (error instanceof OwnershipProjectionRebuildError) return serviceError(error.message, 409);
      throw error;
    }
  },
});
