import {
  requireApiAccess,
} from "./api-access";
import type { AuthPayload } from "./auth-token";
import { jsonErrorResponse } from "./api";

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
