import { z } from "zod";

export const financeAssetSubmissionActionBodySchema = z.object({
  version: z.coerce.number().nullable().optional(),
  comment: z.string().nullable().optional(),
}).strict().optional();
