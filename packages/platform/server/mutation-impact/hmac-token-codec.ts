import { createHmac, timingSafeEqual } from "node:crypto";

import type { MutationImpactTokenCodec } from "./types";

const TOKEN_VERSION = "mi1";

export function createHmacMutationImpactTokenCodec(
  secretInput: string,
): MutationImpactTokenCodec {
  const secret = secretInput.trim();
  if (!secret) throw new Error("Mutation impact token secret must not be empty");

  const signature = (payload: string) => createHmac("sha256", secret).update(payload).digest("base64url");
  return {
    seal(claims) {
      const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
      return `${TOKEN_VERSION}.${payload}.${signature(payload)}`;
    },
    open(token) {
      const [version, payload, actualSignature, extra] = token.split(".");
      if (version !== TOKEN_VERSION || !payload || !actualSignature || extra) {
        throw new Error("invalid mutation impact token");
      }
      const expectedSignature = signature(payload);
      const actual = Buffer.from(actualSignature, "base64url");
      const expected = Buffer.from(expectedSignature, "base64url");
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
        throw new Error("invalid mutation impact token signature");
      }
      return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    },
  };
}
