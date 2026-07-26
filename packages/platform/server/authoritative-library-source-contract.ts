import { z } from "zod";

export const authoritativeLibraryArtifactSchema = z.object({
  sourceKey: z.string().trim().min(1),
  ownerUnitId: z.string().trim().min(1),
  identityKey: z.string().trim().min(1),
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  fileName: z.string().trim().min(1),
  mimeType: z.string().trim().min(1),
  extension: z.string().trim().min(1),
  contentBase64: z.string().min(1),
  asOfDate: z.string().date(),
  verifiedAt: z.string().datetime(),
  evidence: z.array(z.string().trim().min(1)).min(1),
});

export const authoritativeLibraryArtifactsSchema = z.array(authoritativeLibraryArtifactSchema).min(1);

export const authoritativeLibrarySourceRequestSchema = z.object({
  sourceKey: z.string().trim().min(1),
});

export type AuthoritativeLibraryArtifact = z.infer<typeof authoritativeLibraryArtifactSchema>;

export type AuthoritativeLibraryArtifactLoader = (
  sourceKey: string,
) => Promise<AuthoritativeLibraryArtifact | AuthoritativeLibraryArtifact[]>;

export function encodeAuthoritativeLibraryContent(content: Buffer) {
  return content.toString("base64");
}

export function decodeAuthoritativeLibraryContent(artifact: AuthoritativeLibraryArtifact) {
  return Buffer.from(artifact.contentBase64, "base64");
}
