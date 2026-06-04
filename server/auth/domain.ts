import { checkPermission } from "@/server/rbac/check";

export {
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
} from "./finance";

/**
 * Check HR access for a specific resource key.
 *
 * @param resourceKey — the most specific resource to check (e.g. "people.roster").
 *   Defaults to "people" for backward compat. Also checks "people" parent as a
 *   fallback so broad grants still work.
 */
export async function checkHRAccess(
  userId: number,
  roleKey: "access" | "write" | "delete" | "admin" = "access",
  resourceKey: string = "people",
): Promise<boolean> {
  if (await checkPermission(userId, "system", "admin")) return true;

  // checkPermission already handles role inheritance (admin > delete > write > access)
  const check = (rk: string) => checkPermission(userId, rk, roleKey);

  if (await check(resourceKey)) return true;
  // Broad "people" parent grant also grants access to sub-resources
  if (resourceKey !== "people" && await check("people")) return true;
  return false;
}

export async function checkHRWrite(
  userId: number,
  resourceKey: string = "people",
): Promise<boolean> {
  return checkHRAccess(userId, "write", resourceKey);
}

export async function checkHRDelete(
  userId: number,
  resourceKey: string = "people",
): Promise<boolean> {
  return checkHRAccess(userId, "delete", resourceKey);
}

export async function checkWorksAccess(userId: number): Promise<boolean> {
  return (
    (await checkPermission(userId, "system", "admin")) ||
    (await checkPermission(userId, "work", "access"))
  );
}

export async function checkInventoryAccess(userId: number): Promise<boolean> {
  return (
    (await checkPermission(userId, "system", "admin")) ||
    (await checkPermission(userId, "production.inventory", "access"))
  );
}

export async function checkContractAccess(userId: number): Promise<boolean> {
  return (
    (await checkPermission(userId, "system", "admin")) ||
    (await checkPermission(userId, "administration.contract", "access"))
  );
}

export async function checkLibraryAccess(userId: number): Promise<boolean> {
  return (
    (await checkPermission(userId, "system", "admin")) ||
    (await checkPermission(userId, "library", "access")) ||
    (await checkPermission(userId, "library", "write"))
  );
}

export async function checkLibraryWrite(userId: number): Promise<boolean> {
  return (
    (await checkPermission(userId, "system", "admin")) ||
    (await checkPermission(userId, "library.write", "write")) ||
    (await checkPermission(userId, "library", "write"))
  );
}
