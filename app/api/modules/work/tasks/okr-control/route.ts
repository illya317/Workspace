import { z } from "zod";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";
import { listWorkOkrSettings, updateWorkOkrSettings } from "@workspace/work/server";

const governanceMigrationSchema = z.object({
  planIds: z.array(z.coerce.number()),
  reason: z.string(),
}).strict();

const okrControlPolicySchema = z.object({
  settings: z.unknown().optional(),
  exception: z.unknown().optional(),
  governanceMigration: governanceMigrationSchema.optional(),
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
  action: listWorkOkrSettings,
});

export const PUT = createCommandRoute({
  bodySchema: okrControlPolicySchema,
  bodyError: "OKR 管控设置参数无效",
  buildCommand: ({ user, body }) => okCommand({
    ...body,
    actorUserId: user.userId,
  }),
  action: updateWorkOkrSettings,
});
