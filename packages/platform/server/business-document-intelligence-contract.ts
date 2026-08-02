import { z } from "zod";

const requesterSchema = z.object({
  requesterId: z.number().int().positive(),
  resourceKey: z.literal("capitalSecurities.investments"),
});

export const businessDocumentIntelligenceRequestSchema = z.discriminatedUnion("operation", [
  requesterSchema.extend({
    operation: z.literal("upload"),
    companyCode: z.string().trim().min(1).max(80),
    documentCategory: z.string().trim().min(1).max(80),
    title: z.string().trim().min(1).max(240),
    notes: z.string().trim().max(2000).nullable().optional(),
    file: z.object({
      fileName: z.string().trim().min(1).max(240),
      mimeType: z.string().trim().max(160).nullable().optional(),
      contentBase64: z.string().min(1).max(30 * 1024 * 1024),
    }),
  }),
  requesterSchema.extend({
    operation: z.literal("status"),
    documentUids: z.array(z.string().uuid()).max(200),
  }),
  requesterSchema.extend({
    operation: z.literal("search"),
    documentUids: z.array(z.string().uuid()).min(1).max(200),
    query: z.string().trim().min(2).max(500),
    limit: z.number().int().min(1).max(30).default(12),
  }),
]);

export type BusinessDocumentIntelligenceRequest = z.infer<typeof businessDocumentIntelligenceRequestSchema>;

export type BusinessDocumentProcessingState = "pending" | "running" | "ready" | "warning" | "failed" | "unavailable" | "not_needed";

export type BusinessDocumentStatus = {
  documentId: number;
  documentUid: string;
  versionUid: string | null;
  title: string;
  fileName: string;
  reviewStatus: string;
  extractionStatus: BusinessDocumentProcessingState;
  ocrStatus: BusinessDocumentProcessingState;
  vectorStatus: BusinessDocumentProcessingState;
  ocrUsed: boolean;
  modelKey: string | null;
  pageCount: number | null;
  updatedAt: string;
};

export type BusinessDocumentSearchResult = {
  documentUid: string;
  versionUid: string;
  chunkUid: string;
  title: string;
  score: number;
  quote: string;
  locator: Record<string, unknown>;
};

export type BusinessDocumentIntelligenceResponse =
  | { operation: "upload"; document: BusinessDocumentStatus }
  | { operation: "status"; documents: BusinessDocumentStatus[] }
  | {
      operation: "search";
      mode: "vector" | "unavailable";
      modelKey: string | null;
      message: string | null;
      results: BusinessDocumentSearchResult[];
    };
