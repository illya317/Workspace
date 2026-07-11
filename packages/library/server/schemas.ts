import { z } from "zod";

export const LibraryMetadataUpdateSchema = z.object({
  title: z.string().optional(),
  summary: z.string().optional(),
  tags: z.array(z.string()).optional(),
  categoryCode: z.string().optional(),
  categoryName: z.string().optional(),
  subcategoryPath: z.string().optional(),
  confidentialityLevel: z.number().int().min(0).max(4).optional(),
}).strict();

export type LibraryMetadataUpdateInput = z.infer<typeof LibraryMetadataUpdateSchema>;
