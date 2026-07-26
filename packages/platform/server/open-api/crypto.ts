import { createHash, randomBytes } from "node:crypto";

const SECRET_PREFIX = "wsk_live_";

export function generateOpenApiSecret() {
  return `${SECRET_PREFIX}${randomBytes(32).toString("base64url")}`;
}

export function hashOpenApiSecret(secret: string) {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function maskOpenApiSecret(secret: string) {
  if (secret.length <= 12) return "********";
  return `${secret.slice(0, 8)}...${secret.slice(-4)}`;
}
