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
  checkFinanceCostAccess,
  checkFinanceCostWrite,
  checkFinanceCostDelete,
  checkFinanceLedgerAccess,
  checkFinanceLedgerWrite,
  checkFinanceLedgerDelete,
  checkFinanceReportAccess,
  checkFinanceReportWrite,
  checkFinanceReportDelete,
  checkFinanceBudgetAccess,
  checkFinanceBudgetWrite,
  checkFinanceBudgetDelete,
  checkFinanceAnalysisAccess,
  checkFinanceAnalysisWrite,
  checkFinanceAnalysisDelete,
  checkFinanceImportAccess,
  checkFinanceImportWrite,
  checkFinanceImportDelete,
  checkInventoryAccess,
  checkContractAccess,
  checkLibraryAccess,
  checkLibraryWrite,
  type AuthPayload,
} from "@/lib/auth";

export type { AuthPayload };

export type RouteContext = { params: Promise<Record<string, string>> };

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
    return handler(req, payload, ctx);
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

export function withFinanceCostAccess(
  handler: AuthHandler,
): (req: Request) => Promise<Response> {
  return withAuth(handler, checkFinanceCostAccess);
}

export function withFinanceCostWrite(
  handler: AuthHandler,
): (req: Request) => Promise<Response> {
  return withAuth(handler, checkFinanceCostWrite);
}

export function withFinanceCostDelete(
  handler: AuthHandler,
): (req: Request) => Promise<Response> {
  return withAuth(handler, checkFinanceCostDelete);
}

export function withFinanceLedgerAccess(
  handler: AuthHandler,
): (req: Request) => Promise<Response> {
  return withAuth(handler, checkFinanceLedgerAccess);
}

export function withFinanceLedgerWrite(
  handler: AuthHandler,
): (req: Request) => Promise<Response> {
  return withAuth(handler, checkFinanceLedgerWrite);
}

export function withFinanceLedgerDelete(
  handler: AuthHandler,
): (req: Request) => Promise<Response> {
  return withAuth(handler, checkFinanceLedgerDelete);
}

export function withFinanceReportAccess(
  handler: AuthHandler,
): (req: Request) => Promise<Response> {
  return withAuth(handler, checkFinanceReportAccess);
}

export function withFinanceReportWrite(
  handler: AuthHandler,
): (req: Request) => Promise<Response> {
  return withAuth(handler, checkFinanceReportWrite);
}

export function withFinanceReportDelete(
  handler: AuthHandler,
): (req: Request) => Promise<Response> {
  return withAuth(handler, checkFinanceReportDelete);
}

export function withFinanceBudgetAccess(
  handler: AuthHandler,
): (req: Request) => Promise<Response> {
  return withAuth(handler, checkFinanceBudgetAccess);
}

export function withFinanceBudgetWrite(
  handler: AuthHandler,
): (req: Request) => Promise<Response> {
  return withAuth(handler, checkFinanceBudgetWrite);
}

export function withFinanceBudgetDelete(
  handler: AuthHandler,
): (req: Request) => Promise<Response> {
  return withAuth(handler, checkFinanceBudgetDelete);
}

export function withFinanceAnalysisAccess(
  handler: AuthHandler,
): (req: Request) => Promise<Response> {
  return withAuth(handler, checkFinanceAnalysisAccess);
}

export function withFinanceAnalysisWrite(
  handler: AuthHandler,
): (req: Request) => Promise<Response> {
  return withAuth(handler, checkFinanceAnalysisWrite);
}

export function withFinanceAnalysisDelete(
  handler: AuthHandler,
): (req: Request) => Promise<Response> {
  return withAuth(handler, checkFinanceAnalysisDelete);
}

export function withFinanceImportAccess(
  handler: AuthHandler,
): (req: Request) => Promise<Response> {
  return withAuth(handler, checkFinanceImportAccess);
}

export function withFinanceImportWrite(
  handler: AuthHandler,
): (req: Request) => Promise<Response> {
  return withAuth(handler, checkFinanceImportWrite);
}

export function withFinanceImportDelete(
  handler: AuthHandler,
): (req: Request) => Promise<Response> {
  return withAuth(handler, checkFinanceImportDelete);
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

export function withLibraryAccess(
  handler: AuthHandler,
): (req: Request) => Promise<Response> {
  return withAuth(handler, checkLibraryAccess);
}

export function withLibraryWrite(
  handler: AuthHandler,
): (req: Request) => Promise<Response> {
  return withAuth(handler, checkLibraryWrite);
}
