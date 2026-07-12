import "server-only";

import { z } from "zod";

import { buildCreateLibraryExportCommand } from "./domain/export-validation";
import { createLibraryExport } from "./export";

const selectionItemSchema = z.object({
  documentUid: z.string().uuid(),
  versionUid: z.string().uuid(),
}).strict();

const deliveryDataSchema = z.object({
  canExport: z.boolean().optional(),
  presentation: z.object({
    kind: z.literal("resource-set"),
    items: z.array(z.unknown()),
    bundle: z.object({
      requestBody: z.object({
        selection: z.array(selectionItemSchema).min(1).max(100),
        includePreviews: z.boolean().optional(),
      }).passthrough(),
    }).passthrough().optional(),
  }).passthrough(),
}).passthrough();

const DELIVERY_REQUEST_PATTERN = /(打包|资料包|压缩包|\bzip\b|发(?:送)?(?:给我|到企业微信|到企微)|直接发)/iu;
const DELIVERY_NEGATION_PATTERN = /(不要|不用|无需|别).{0,8}(打包|资料包|压缩包|\bzip\b|发)/iu;

export type LibraryAgentDeliveryRequest =
  | { status: "none" }
  | { status: "denied" }
  | {
      status: "ready";
      selection: Array<{ documentUid: string; versionUid: string }>;
      includePreviews: boolean;
    };

export function parseLibraryAgentDeliveryRequest(message: string, data: unknown): LibraryAgentDeliveryRequest {
  if (DELIVERY_NEGATION_PATTERN.test(message) || !DELIVERY_REQUEST_PATTERN.test(message)) return { status: "none" };
  const parsed = deliveryDataSchema.safeParse(data);
  if (!parsed.success) return { status: "none" };
  const bundle = parsed.data.presentation.bundle;
  if (!bundle) return parsed.data.canExport === false ? { status: "denied" } : { status: "none" };
  return {
    status: "ready",
    selection: bundle.requestBody.selection,
    includePreviews: bundle.requestBody.includePreviews ?? false,
  };
}

export async function createLibraryAgentDelivery(input: {
  message: string;
  data: unknown;
  userId: number;
}) {
  const request = parseLibraryAgentDeliveryRequest(input.message, input.data);
  if (request.status !== "ready") return request;

  const command = buildCreateLibraryExportCommand({
    userId: input.userId,
    selection: request.selection,
    includePreviews: request.includePreviews,
  });
  if (!command.ok) throw new Error(command.issue.message);
  const job = await createLibraryExport(command.data);
  if (job.status !== "succeeded" || !job.fileSizeBytes) {
    throw new Error("Library export did not produce a file");
  }
  return {
    status: "ready" as const,
    artifactId: job.exportUid,
    fileName: "资料库.zip",
    fileSizeBytes: job.fileSizeBytes,
    itemCount: request.selection.length,
  };
}
