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
  const [
    canAnyWeek,
    hasHRAccess,
    hasHRWrite,
    hasHRDelete,
    hasWorks,
    hasFinance,
    hasFinanceCost,
    hasFinanceLedger,
    hasFinanceReport,
    hasFinanceBudget,
    hasFinanceAnalysis,
    hasFinanceImport,
    hasInventory,
    hasContract,
  ] = await Promise.all([
    checkPermissionWithContext(ctx, "work.report", "write"),
    checkPermissionWithContext(ctx, "people", "access"),
    checkPermissionWithContext(ctx, "people", "write"),
    checkPermissionWithContext(ctx, "people", "delete"),
    checkPermissionWithContext(ctx, "work", "access"),
    checkPermissionWithContext(ctx, "finance", "access"),
    checkPermissionWithContext(ctx, "finance.cost", "access"),
    checkPermissionWithContext(ctx, "finance.ledger", "access"),
    checkPermissionWithContext(ctx, "finance.statement", "access"),
    checkPermissionWithContext(ctx, "finance.budget", "access"),
    checkPermissionWithContext(ctx, "finance.analysis", "access"),
    checkPermissionWithContext(ctx, "finance.import", "access"),
    checkPermissionWithContext(ctx, "production.inventory", "access"),
    checkPermissionWithContext(ctx, "administration.contract", "access"),
  ]);

  const hasHR = hasHRAccess || hasHRWrite || hasHRDelete;

  const manageableKeys = await getManageableResourceKeys(payload.userId);
  const canManagePermissions = manageableKeys.size > 0;

  return {
    ...userWithPerms,
    isWorkListAdmin: isAdmin,
    isSuperAdmin: isAdmin,
    canSelectAnyWeek: canAnyWeek,
    canAccessHR: isAdmin || (hasHR && isActiveEmployee),
    canEditHR: isAdmin || (hasHRWrite && isActiveEmployee),
    canDeleteHR: isAdmin || (hasHRDelete && isActiveEmployee),
    canAccessWorks: hasWorks,
    canAccessFinance:
      hasFinance ||
      hasFinanceLedger ||
      hasFinanceReport ||
      hasFinanceBudget ||
      hasFinanceAnalysis ||
      hasFinanceImport ||
      hasFinanceCost,
    canAccessFinanceCost: hasFinanceCost,
    canAccessFinanceLedger: hasFinanceLedger,
    canAccessFinanceReport: hasFinanceReport,
    canAccessFinanceBudget: hasFinanceBudget,
    canAccessFinanceAnalysis: hasFinanceAnalysis,
    canAccessFinanceImport: hasFinanceImport,
    canAccessInventory: hasInventory,
    canAccessContract: hasContract,
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
