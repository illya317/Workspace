import { z } from "zod";

export const submissionParamsSchema = z.object({ id: z.coerce.number().int().positive() });
