import "server-only";
import { NextResponse } from "next/server";

import { findApiContract, type ApiContract } from "../api-registry";
import { authenticate, isKicked } from "./auth/authenticate";
import { authorize } from "./auth/authorize";
import type { AuthPayload } from "./auth-token";
import { disabledApiResponseForRequest } from "./module-runtime";

export type ApiAccessResult =
  | {
      ok: true;
      user: AuthPayload;
      contract: ApiContract;
    }
  | {
      ok: false;
      response: Response;
    };

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

async function unauthenticatedResponse(request: Request) {
  if (await isKicked(request)) {
    const response = jsonError("已在其他设备登录", 401) as NextResponse;
    response.cookies.set("kicked", "1", {
      httpOnly: false,
      secure: false,
      path: "/",
      maxAge: 60,
    });
    return response;
  }
  return jsonError("未登录", 401);
}

export async function requireApiAccess(request: Request): Promise<ApiAccessResult> {
  const url = new URL(request.url);
  const contract = findApiContract(request.method as Parameters<typeof findApiContract>[0], url.pathname);
  const disabledResponse = disabledApiResponseForRequest(request);
  if (disabledResponse) return { ok: false, response: disabledResponse };
  if (!contract) {
    const status = url.pathname.startsWith("/api/modules/") ? 500 : 404;
    return { ok: false, response: jsonError("API contract not registered", status) };
  }
  if (contract.access === "disabled" || contract.access === "internal") {
    return { ok: false, response: jsonError("API contract disabled", 403) };
  }

  const payload = await authenticate(request);
  if (!payload) return { ok: false, response: await unauthenticatedResponse(request) };

  if (contract.resourceKey && contract.action) {
    const allowed = await authorize({
      user: payload.userId,
      resourceKey: contract.resourceKey,
      action: contract.action,
    });
    if (!allowed) return { ok: false, response: jsonError("无权限", 403) };
  }

  return { ok: true, user: payload, contract };
}

export async function requireAdminApiAccess(request: Request): Promise<ApiAccessResult> {
  const url = new URL(request.url);
  const contract = findApiContract(request.method as Parameters<typeof findApiContract>[0], url.pathname);
  const disabledResponse = disabledApiResponseForRequest(request);
  if (disabledResponse) return { ok: false, response: disabledResponse };
  if (!contract) {
    return { ok: false, response: jsonError("API contract not registered", 404) };
  }
  if (contract.access === "disabled" || contract.access === "internal") {
    return { ok: false, response: jsonError("API contract disabled", 403) };
  }

  const payload = await authenticate(request);
  if (!payload) return { ok: false, response: await unauthenticatedResponse(request) };

  const allowed = await authorize({
    user: payload.userId,
    resourceKey: "settings.admin",
    action: "access",
  });
  if (!allowed) {
    return { ok: false, response: jsonError("无权限", 403) };
  }

  return { ok: true, user: payload, contract };
}
