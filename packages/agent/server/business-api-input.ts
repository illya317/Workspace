import { z } from "zod";

const MAX_PATH_LENGTH = 2_048;

const mutationMethodSchema = z.enum(["POST", "PUT", "PATCH", "DELETE"]);
const apiPathSchema = z.string().trim().min(1).max(MAX_PATH_LENGTH);

export const readBusinessApiInputSchema = z.object({ path: apiPathSchema }).strict();
export const mutationBusinessApiInputSchema = z.object({
  method: mutationMethodSchema,
  path: apiPathSchema,
  body: z.record(z.string(), z.unknown()).optional().default({}),
}).strict();
export const discoveryBusinessApiInputSchema = z.object({
  query: z.string().trim().min(1).max(120),
}).strict();
