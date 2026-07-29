import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

export const AGENT_API_DELEGATION_HEADER = "x-workspace-agent-api-delegation";

const ISSUER = "workspace-agent";
const AUDIENCE = "workspace-business-api";
const TOKEN_TTL_SECONDS = 90;

export type AgentApiDelegationClaims = {
  readonly requesterId: number;
  readonly actorId: number;
  readonly profileId: number | null;
  readonly runId?: string;
};

function delegationSecret() {
  const configured = process.env.NEXTAUTH_SECRET?.trim();
  if (!configured && process.env.NODE_ENV === "production") {
    throw new Error("NEXTAUTH_SECRET is required for Agent API delegation");
  }
  return createHash("sha256")
    .update("workspace-agent-api-delegation\0")
    .update(configured || "workspace-agent-api-delegation-dev-only")
    .digest();
}

function canonicalApiTarget(value: string | URL) {
  const url = typeof value === "string" ? new URL(value, "http://workspace.invalid") : value;
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() || "/workspace";
  const pathname = basePath !== "/" && url.pathname.startsWith(`${basePath}/`)
    ? url.pathname.slice(basePath.length)
    : url.pathname;
  return `${pathname}${url.search}`;
}

function bodyDigest(body: string) {
  return createHash("sha256").update(body).digest("hex");
}

function positiveInteger(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : null;
}

export async function createAgentApiDelegationToken(input: {
  readonly execution: {
    readonly requester: { readonly id: number };
    readonly actor: { readonly id: number };
    readonly profile: { readonly id: number } | null;
    readonly runId?: string;
  };
  readonly method: string;
  readonly target: string | URL;
  readonly body: string;
}) {
  return new SignJWT({
    actor_id: input.execution.actor.id,
    profile_id: input.execution.profile?.id ?? null,
    run_id: input.execution.runId,
    method: input.method.toUpperCase(),
    target: canonicalApiTarget(input.target),
    body_sha256: bodyDigest(input.body),
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(String(input.execution.requester.id))
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(delegationSecret());
}

export async function verifyAgentApiDelegation(
  request: Request,
): Promise<AgentApiDelegationClaims | null> {
  const token = request.headers.get(AGENT_API_DELEGATION_HEADER)?.trim();
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, delegationSecret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"],
      clockTolerance: 5,
    });
    const requesterId = positiveInteger(Number(payload.sub));
    const actorId = positiveInteger(payload.actor_id);
    const profileId = payload.profile_id === null ? null : positiveInteger(payload.profile_id);
    if (!requesterId || !actorId || (payload.profile_id !== null && !profileId)) return null;
    if (payload.method !== request.method.toUpperCase()) return null;
    if (payload.target !== canonicalApiTarget(new URL(request.url))) return null;
    if (payload.body_sha256 !== bodyDigest(await request.clone().text())) return null;
    if (payload.run_id !== undefined && typeof payload.run_id !== "string") return null;
    return {
      requesterId,
      actorId,
      profileId,
      ...(typeof payload.run_id === "string" && payload.run_id ? { runId: payload.run_id } : {}),
    };
  } catch {
    return null;
  }
}
