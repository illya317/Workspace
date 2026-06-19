import { z } from "zod";

export const costImportIdSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const unsupportedCostImportPayloadSchema = z.object({}).strict();
