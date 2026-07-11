import { z } from "zod";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";
import { listWorkOkrControlPolicies, updateWorkOkrControlSettings } from "@workspace/work/server";

const okrControlPolicySchema = z.object({
  settings: z.unknown().optional(),
  exception: z.unknown().optional(),
  cycleId: z.coerce.number(),
  scopeType: z.string().nullable().optional(),
  scopeId: z.union([z.string(), z.number()]).nullable().optional(),
  isLocked: z.boolean().nullable().optional(),
  objectiveSubmitDeadline: z.string().nullable().optional(),
  krReviewOpensAt: z.string().nullable().optional(),
  krSubmitDeadline: z.string().nullable().optional(),
}).partial().passthrough();

export const GET = createCommandRoute({
  buildCommand: () => okCommand({}),
  action: listWorkOkrControlPolicies,
});

export const PUT = createCommandRoute({
  bodySchema: okrControlPolicySchema,
  bodyError: "OKR 管控设置参数无效",
  buildCommand: ({ user, body }) => okCommand({
    ...body,
    actorUserId: user.userId,
  }),
  action: updateWorkOkrControlSettings,
});
