import { NextResponse } from "next/server";
import {
  authenticate,
  isKicked,
  checkHRAccess,
  checkHRWrite,
  checkHRDelete,
  checkFinanceAccess,
  checkFinanceWrite,
  checkFinanceDelete,
  checkInventoryAccess,
  checkContractAccess,
  type AuthPayload,
} from "@/lib/auth";

export type { AuthPayload };

export type AuthHandler = (
  req: Request,
  user: AuthPayload,
) => Promise<Response>;

export type AccessChecker = (userId: number) => Promise<boolean>;

export function withAuth(
  handler: AuthHandler,
  checkAccess?: AccessChecker,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const payload = await authenticate(req);
    if (!payload) {
      if (await isKicked(req)) {
        const res = NextResponse.json(
          { error: "已在其他设备登录" },
          { status: 401 },
        );
        res.cookies.set("kicked", "1", {
          httpOnly: false,
          secure: false,
          path: "/",
          maxAge: 60,
        });
        return res;
      }
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    if (checkAccess && !(await checkAccess(payload.userId))) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }
    return handler(req, payload);
  };
}

export function withHRAccess(
  handler: AuthHandler,
): (req: Request) => Promise<Response> {
  return withAuth(handler, checkHRAccess);
}

export function withHRWrite(
  handler: AuthHandler,
): (req: Request) => Promise<Response> {
  return withAuth(handler, checkHRWrite);
}

export function withHRDelete(
  handler: AuthHandler,
): (req: Request) => Promise<Response> {
  return withAuth(handler, checkHRDelete);
}

export function withFinanceAccess(
  handler: AuthHandler,
): (req: Request) => Promise<Response> {
  return withAuth(handler, checkFinanceAccess);
}

export function withFinanceWrite(
  handler: AuthHandler,
): (req: Request) => Promise<Response> {
  return withAuth(handler, checkFinanceWrite);
}

export function withFinanceDelete(
  handler: AuthHandler,
): (req: Request) => Promise<Response> {
  return withAuth(handler, checkFinanceDelete);
}

export function withInventoryAccess(
  handler: AuthHandler,
): (req: Request) => Promise<Response> {
  return withAuth(handler, checkInventoryAccess);
}

export function withContractAccess(
  handler: AuthHandler,
): (req: Request) => Promise<Response> {
  return withAuth(handler, checkContractAccess);
}
