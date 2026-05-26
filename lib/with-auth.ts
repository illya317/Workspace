import { NextResponse } from "next/server";
import { authenticate, checkHRAccess, type AuthPayload } from "@/lib/auth";

export type { AuthPayload };

export type AuthHandler = (
  req: Request,
  user: AuthPayload
) => Promise<Response>;

export type AccessChecker = (userId: number) => Promise<boolean>;

export function withAuth(
  handler: AuthHandler,
  checkAccess?: AccessChecker
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const payload = await authenticate(req);
    if (!payload) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    if (checkAccess && !(await checkAccess(payload.userId))) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }
    return handler(req, payload);
  };
}

export function withHRAccess(handler: AuthHandler): (req: Request) => Promise<Response> {
  return withAuth(handler, checkHRAccess);
}
