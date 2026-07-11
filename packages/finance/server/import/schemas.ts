import { z } from "zod";
import type { PreviewResult } from "./import";

export const importPreviewFormSchema = z.object({
  file: z.instanceof(File),
  type: z.enum(["balance", "journal", "account"]),
  companyCode: z.string().min(1),
  year: z.coerce.number().int().positive().optional(),
});

export const importConfirmBodySchema = z.object({
  preview: z.custom<PreviewResult>(
    (value) => Boolean(value && typeof value === "object" && "type" in value),
    "preview 为必填",
  ),
});
