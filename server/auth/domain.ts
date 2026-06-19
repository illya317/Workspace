import { authorize, type AuthorizeAction } from "./authorize";

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
  roleKey: AuthorizeAction = "access",
  resourceKey: string = "people",
): Promise<boolean> {
  if (await authorize({ user: userId, resourceKey: "system", action: "admin" })) return true;

  if (await authorize({ user: userId, resourceKey, action: roleKey })) return true;
  if (
    resourceKey !== "people" &&
    await authorize({ user: userId, resourceKey: "people", action: roleKey })
  ) return true;
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
    (await authorize({ user: userId, resourceKey: "system", action: "admin" })) ||
    (await authorize({ user: userId, resourceKey: "work", action: "access" }))
  );
}

export async function checkInventoryAccess(userId: number): Promise<boolean> {
  return (
    (await authorize({ user: userId, resourceKey: "system", action: "admin" })) ||
    (await authorize({ user: userId, resourceKey: "production.inventory", action: "access" }))
  );
}

export async function checkContractAccess(userId: number): Promise<boolean> {
  return (
    (await authorize({ user: userId, resourceKey: "system", action: "admin" })) ||
    (await authorize({ user: userId, resourceKey: "administration.contract", action: "access" }))
  );
}

export async function checkLibraryAccess(userId: number): Promise<boolean> {
  return (
    (await authorize({ user: userId, resourceKey: "system", action: "admin" })) ||
    (await authorize({ user: userId, resourceKey: "library", action: "access" })) ||
    (await authorize({ user: userId, resourceKey: "library", action: "write" }))
  );
}

export async function checkLibraryWrite(userId: number): Promise<boolean> {
  return (
    (await authorize({ user: userId, resourceKey: "system", action: "admin" })) ||
    (await authorize({ user: userId, resourceKey: "library.write", action: "write" })) ||
    (await authorize({ user: userId, resourceKey: "library", action: "write" }))
  );
}
