import { z } from "zod";

export const workImpactResolutionSchema = z.object({
  impactToken: z.string().min(1),
  resolutions: z.array(z.object({
    relationKey: z.string().min(1),
    resolution: z.enum(["unlink", "cascade", "transition_related"]),
  }).strict()).max(100),
}).strict();

export const workImpactCommandBodySchema = z.object({
  impactResolution: workImpactResolutionSchema.optional(),
}).strip().default({});
