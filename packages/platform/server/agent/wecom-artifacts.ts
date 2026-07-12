import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const WECOM_DIRECT_FILE_MAX_BYTES = 45 * 1024 * 1024;
export const WECOM_ARTIFACT_TOKEN_TTL_MS = 30 * 60 * 1000;

const artifactClaimsSchema = z.object({
  version: z.literal(2),
  source: z.enum(["library-export", "library-version"]),
  artifactId: z.string().uuid(),
  userId: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
}).strict();

export type WecomArtifactClaims = z.infer<typeof artifactClaimsSchema>;

export type WecomAgentFileArtifact = {
  kind: "file";
  source: WecomArtifactClaims["source"];
  artifactId: string;
  fileName: string;
  fileSizeBytes: number;
  itemCount: number;
  expiresAt: number;
  directSendMaxBytes: number;
  workerPath: string;
  downloadPath: string;
};

function tokenSecret() {
  const secret = process.env.NEXTAUTH_SECRET?.trim();
  if (!secret) throw new Error("NEXTAUTH_SECRET is required for controlled downloads");
  return secret;
}

function tokenSignature(payload: string) {
  return createHmac("sha256", tokenSecret()).update(payload).digest("hex");
}

function signaturesMatch(actual: string, expected: string) {
  if (!/^[a-f0-9]{64}$/i.test(actual)) return false;
  const actualBuffer = Buffer.from(actual, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function createWecomArtifactToken(
  input: Pick<WecomArtifactClaims, "source" | "artifactId" | "userId">,
  now = Date.now(),
) {
  const claims: WecomArtifactClaims = {
    version: 2,
    source: input.source,
    artifactId: input.artifactId,
    userId: input.userId,
    expiresAt: now + WECOM_ARTIFACT_TOKEN_TTL_MS,
  };
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return { token: `${payload}.${tokenSignature(payload)}`, claims };
}

export function verifyWecomArtifactToken(token: string, now = Date.now()): WecomArtifactClaims | null {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra || !signaturesMatch(signature, tokenSignature(payload))) return null;

  try {
    const parsed = artifactClaimsSchema.safeParse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    if (!parsed.success || parsed.data.expiresAt < now) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function normalizedBasePath() {
  const configured = process.env.NEXT_PUBLIC_BASE_PATH?.trim() || "/workspace";
  const withLeadingSlash = configured.startsWith("/") ? configured : `/${configured}`;
  return withLeadingSlash === "/" ? "" : withLeadingSlash.replace(/\/+$/g, "");
}

export function createWecomAgentFileArtifact(input: {
  source: WecomArtifactClaims["source"];
  artifactId: string;
  userId: number;
  fileName: string;
  fileSizeBytes: number;
  itemCount: number;
}): WecomAgentFileArtifact {
  const { token, claims } = createWecomArtifactToken(input);
  const basePath = normalizedBasePath();
  const encodedId = encodeURIComponent(input.artifactId);
  const encodedToken = encodeURIComponent(token);
  return {
    kind: "file",
    source: input.source,
    artifactId: input.artifactId,
    fileName: input.fileName,
    fileSizeBytes: input.fileSizeBytes,
    itemCount: input.itemCount,
    expiresAt: claims.expiresAt,
    directSendMaxBytes: WECOM_DIRECT_FILE_MAX_BYTES,
    workerPath: `${basePath}/api/integrations/wecom/agent/artifacts/${encodedId}?token=${encodedToken}`,
    downloadPath: `${basePath}/api/integrations/wecom/download/${encodedId}?token=${encodedToken}`,
  };
}
