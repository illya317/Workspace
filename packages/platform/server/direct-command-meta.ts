import { randomUUID } from "node:crypto";

/**
 * Preserve an explicit retry key for integrations while keeping ordinary UI
 * mutations free from transport-level lifecycle metadata.
 */
export function directCommandId(request: Request) {
  return request.headers.get("idempotency-key")?.trim() || randomUUID();
}
