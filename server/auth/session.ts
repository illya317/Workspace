import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { verifyToken, getPermissionContext, checkPermissionWithContext } from "@/lib/auth";
import { getManageableResourceKeys } from "@/server/rbac/admin-scope";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/types";

async function _getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  const userWithPerms = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      name: true,
      username: true,
      wxUserId: true,
      apiKey: true,
      canLogin: true,
      sessionVersion: true,
    },
  });
  if (!userWithPerms) return null;
  if (!userWithPerms.canLogin) return null;
  if (userWithPerms.sessionVersion !== payload.sessionVersion) {
    return null;
  }

  const employee = await prisma.employee.findFirst({
    where: { userId: payload.userId },
    select: {
      employeeId: true,
      employments: {
        select: { isActive: true },
        orderBy: { id: "desc" },
        take: 1,
      },
    },
  });
  const isActiveEmployee = employee?.employments?.[0]?.isActive ?? false;

  const ctx = await getPermissionContext(payload.userId);
  const isAdmin = ctx.isAdmin;

  const { getVisibleResourceKeys } = await import("@/server/rbac/visibility");
  const { ensureGrantCache } = await import("@/server/rbac/context");
  await ensureGrantCache(ctx); // preload all grants → checkPermissionWithContext hits in-memory fast path

  const [visibleAccess, visibleWrite] = await Promise.all([
    getVisibleResourceKeys(ctx, "access"),
    getVisibleResourceKeys(ctx, "write"),
  ]);

  // L1 module visibility (DB-driven, auto-ancestor propagation)
  const ma = (k: string) => visibleAccess.has(k);

  const hasWorks = ma("work") || ma("work.report") || ma("work.task");
  const financeKeys = ["finance", "finance.cost", "finance.ledger", "finance.statement", "finance.budget", "finance.analysis", "finance.import"] as const;
  const hasFinance = financeKeys.some(ma);
  const hasInventory = ma("production") || ma("production.inventory");
  const hasContract = ma("administration") || ma("administration.contract");
  const extKeys = ["external", "external.investor", "external.customer", "external.supplier"] as const;
  const docsKeys = ["docs", "docs.positions", "docs.company", "docs.expense", "system.api"] as const;
  const hasDocs = docsKeys.some(ma);
  const hasExternal = extKeys.some(ma);

  // Additional per-resource checks
  const [canAnyWeek, hasApi, hasAgent] = await Promise.all([
    checkPermissionWithContext(ctx, "work.report", "write"),
    checkPermissionWithContext(ctx, "system.api", "access"),
    checkPermissionWithContext(ctx, "system.agent", "access"),
  ]);

  const manageableKeys = await getManageableResourceKeys(payload.userId);
  const canManagePermissions = manageableKeys.size > 0;

  return {
    ...userWithPerms,
    isWorkListAdmin: isAdmin,
    isSuperAdmin: isAdmin,
    canSelectAnyWeek: canAnyWeek,
    visibleResourceKeys: [...visibleAccess],
    visibleWriteResourceKeys: [...visibleWrite],
    canAccessWorks: hasWorks,
    canAccessFinance: hasFinance,
    canAccessFinanceCost: ma("finance.cost"), canAccessFinanceLedger: ma("finance.ledger"),
    canAccessFinanceReport: ma("finance.statement"), canAccessFinanceBudget: ma("finance.budget"),
    canAccessFinanceAnalysis: ma("finance.analysis"), canAccessFinanceImport: ma("finance.import"),
    canAccessInventory: hasInventory,
    canAccessContract: hasContract,
    canAccessDocs: hasDocs,
    canAccessExternal: hasExternal,
    canAccessLibrary: ma("library"),
    canAccessApi: hasApi,
    canAccessAgent: hasAgent,
    canAccessAdmin: isAdmin || canManagePermissions,
    canManagePermissions,
    manageableResourceKeys: [...manageableKeys],
    employeeId: employee?.employeeId ?? null,
    isActiveEmployee,
  };
}

/** Cached per-request: layout + page can both call without double DB queries. */
export const getCurrentUser = cache(_getCurrentUser);

/** For API routes: throws on unauthenticated. */
export async function requireCurrentUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}

/** For page components: redirects to /login on unauthenticated. */
export async function requireAuth(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    const { redirect } = await import("next/navigation");
    redirect("/login");
  }
  return user!;
}

export async function requireAdminAccess(): Promise<SessionUser> {
  const user = await requireCurrentUser();
  if (!user.canAccessAdmin) {
    throw new Error("FORBIDDEN");
  }
  return user;
}

export async function requireFinanceAccess(): Promise<SessionUser> {
  const user = await requireCurrentUser();
  if (!user.canAccessFinance) {
    throw new Error("FORBIDDEN");
  }
  return user;
}

export async function requireWorksAccess(): Promise<SessionUser> {
  const user = await requireCurrentUser();
  if (!user.canAccessWorks) {
    throw new Error("FORBIDDEN");
  }
  return user;
}

export async function requireContractAccess(): Promise<SessionUser> {
  const user = await requireCurrentUser();
  if (!user.canAccessContract) {
    throw new Error("FORBIDDEN");
  }
  return user;
}

export async function requireFinanceCostAccess(): Promise<SessionUser> {
  const user = await requireCurrentUser();
  if (!user.canAccessFinanceCost) {
    throw new Error("FORBIDDEN");
  }
  return user;
}

export async function requireFinanceLedgerAccess(): Promise<SessionUser> {
  const user = await requireCurrentUser();
  if (!user.canAccessFinanceLedger) {
    throw new Error("FORBIDDEN");
  }
  return user;
}

export async function requireFinanceReportAccess(): Promise<SessionUser> {
  const user = await requireCurrentUser();
  if (!user.canAccessFinanceReport) {
    throw new Error("FORBIDDEN");
  }
  return user;
}

export async function requireFinanceBudgetAccess(): Promise<SessionUser> {
  const user = await requireCurrentUser();
  if (!user.canAccessFinanceBudget) {
    throw new Error("FORBIDDEN");
  }
  return user;
}

export async function requireFinanceAnalysisAccess(): Promise<SessionUser> {
  const user = await requireCurrentUser();
  if (!user.canAccessFinanceAnalysis) {
    throw new Error("FORBIDDEN");
  }
  return user;
}

export async function requireFinanceImportAccess(): Promise<SessionUser> {
  const user = await requireCurrentUser();
  if (!user.canAccessFinanceImport) {
    throw new Error("FORBIDDEN");
  }
  return user;
}

export async function requireInventoryAccess(): Promise<SessionUser> {
  const user = await requireCurrentUser();
  if (!user.canAccessInventory) {
    throw new Error("FORBIDDEN");
  }
  return user;
}
