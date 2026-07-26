import { z } from "zod";

export const LibraryMetadataUpdateSchema = z.object({
  title: z.string().optional(),
  summary: z.string().optional(),
  tags: z.array(z.string()).optional(),
  categoryCode: z.string().optional(),
  categoryName: z.string().optional(),
  directoryPath: z.string().optional(),
  subcategoryPath: z.string().optional(),
  confidentialityLevel: z.number().int().min(0).max(4).optional(),
}).strict();

export type LibraryMetadataUpdateInput = z.infer<typeof LibraryMetadataUpdateSchema>;

export const LibraryDirectoryCreateSchema = z.object({
  parentPath: z.string().nullable().optional(),
  name: z.string().min(1).max(80),
}).strict();

export const LibraryDirectoryRenameSchema = z.object({
  path: z.string().min(1),
  name: z.string().min(1).max(80),
}).strict();

export const LibraryDirectoryDeleteSchema = z.object({
  path: z.string().min(1),
}).strict();

export type LibraryDirectoryCreateInput = z.infer<typeof LibraryDirectoryCreateSchema>;
export type LibraryDirectoryRenameInput = z.infer<typeof LibraryDirectoryRenameSchema>;
export type LibraryDirectoryDeleteInput = z.infer<typeof LibraryDirectoryDeleteSchema>;
