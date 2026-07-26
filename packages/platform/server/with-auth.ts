import {
  requireApiAccess,
} from "./api-access";
import type { AuthPayload } from "./auth-token";
import { jsonErrorResponse } from "./api";
import {
  parseWecomAgentBridgeRequest,
  resolveWecomAgentUser,
  type WecomAgentBridgeInput,
} from "./agent/wecom-bridge";
import type { SessionUser } from "../types";

export type { AuthPayload };

export type RouteContext = { params: Promise<Record<string, string | string[]>> };

export type AuthHandler = (
  req: Request,
  user: AuthPayload,
  ctx?: RouteContext,
) => Promise<Response>;

export type AccessChecker = (userId: number) => Promise<boolean>;

export function withAuth(
  handler: AuthHandler,
  checkAccess?: AccessChecker,
): (req: Request, ctx?: RouteContext) => Promise<Response> {
  return async (req: Request, ctx?: RouteContext) => {
    const auth = await requireApiAccess(req);
    if (!auth.ok) return auth.response;
    const payload = auth.user;
    if (checkAccess && !(await checkAccess(payload.userId))) {
      return jsonErrorResponse("无权限", 403);
    }
    return handler(req, payload, ctx);
  };
}

export type WecomAgentBridgeHandler = (
  request: Request,
  input: WecomAgentBridgeInput,
  user: SessionUser,
) => Promise<Response>;

export function withWecomAgentBridgeAccess(handler: WecomAgentBridgeHandler) {
  return async (request: Request) => {
    const parsed = await parseWecomAgentBridgeRequest(request);
    if (!parsed.ok) return parsed.response;
    const resolved = await resolveWecomAgentUser(parsed.input.userId);
    if (!resolved.ok) return resolved.response;
    return handler(request, parsed.input, resolved.user);
  };
}
