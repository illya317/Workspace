import "server-only";
import { cookies } from "next/headers";
import { verifyToken, getPermissionContext, checkPermissionWithContext } from "@/lib/auth";
import { getManageableResourceKeys } from "@/server/rbac/admin-scope";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/types";

export async function getCurrentUser(): Promise<SessionUser | null> {
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
  const visibleKeys = await getVisibleResourceKeys(ctx, "access");

  // L1 module visibility (DB-driven, auto-ancestor propagation)
  const m = (k: string) => visibleKeys.has(k);

  const hasWorks = m("work") || m("work.report") || m("work.task");
  const hasHR = m("people") || m("people.roster") || m("people.performance") || m("people.analytics");
  const hasHRW = m("people.write") || m("people.roster.write") || m("people.performance.write") || m("people.analytics.write");
  const hasHRD = m("people.delete") || m("people.roster.delete") || m("people.performance.delete") || m("people.analytics.delete");
  const hasFinance = m("finance") || m("finance.cost") || m("finance.ledger") || m("finance.statement") || m("finance.budget") || m("finance.analysis") || m("finance.import");
  const hasInventory = m("production") || m("production.inventory");
  const hasContract = m("administration") || m("administration.contract");
  const hasDocs = m("docs") || m("docs.positions") || m("docs.company") || m("docs.expense");
  const hasExternal = m("external") || m("external.investor") || m("external.customer") || m("external.supplier");

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
    visibleResourceKeys: [...visibleKeys],
    // Module gates
    canAccessHR: isAdmin || (hasHR && isActiveEmployee),
    canEditHR: isAdmin || (hasHRW && isActiveEmployee),
    canDeleteHR: isAdmin || (hasHRD && isActiveEmployee),
    canAccessWorks: hasWorks,
    canAccessFinance: hasFinance,
    canAccessFinanceCost: m("finance.cost"), canAccessFinanceLedger: m("finance.ledger"),
    canAccessFinanceReport: m("finance.statement"), canAccessFinanceBudget: m("finance.budget"),
    canAccessFinanceAnalysis: m("finance.analysis"), canAccessFinanceImport: m("finance.import"),
    canAccessInventory: hasInventory,
    canAccessContract: hasContract,
    canAccessDocs: hasDocs,
    canAccessExternal: hasExternal,
    canAccessLibrary: m("library"),
    canAccessApi: hasApi,
    canAccessAgent: hasAgent,
    canAccessAdmin: isAdmin || canManagePermissions,
    canManagePermissions,
    manageableResourceKeys: [...manageableKeys],
    employeeId: employee?.employeeId ?? null,
    isActiveEmployee,
  };
}

export async function requireCurrentUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }
  return user;
}

export async function requireHRAccess(): Promise<SessionUser> {
  const user = await requireCurrentUser();
  if (!user.canAccessHR) {
    throw new Error("FORBIDDEN");
  }
  return user;
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
