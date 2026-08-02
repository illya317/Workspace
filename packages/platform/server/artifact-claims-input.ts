import { z } from "zod";

export const artifactClaimsSchema = z.object({
  version: z.literal(2),
  source: z.enum(["library-export", "library-version"]),
  artifactId: z.string().uuid(),
  userId: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
}).strict();

export type WecomArtifactClaims = z.infer<typeof artifactClaimsSchema>;
