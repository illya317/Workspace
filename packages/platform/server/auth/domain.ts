import { authorize, type AuthorizeAction } from "./authorize";
import { isSuperAdmin } from "./admin";

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
  checkFinanceStatementConfigAccess,
  checkFinanceStatementConfigWrite,
  checkFinanceStatementReviewAccess,
  checkFinanceStatementReviewWrite,
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
 * @param resourceKey — the most specific resource to check (e.g. "hr.roster").
 *   Defaults to "hr" for backward compat. Also checks "hr" parent as a
 *   fallback so broad grants still work.
 */
export async function checkHRAccess(
  userId: number,
  roleKey: AuthorizeAction = "access",
  resourceKey: string = "hr",
): Promise<boolean> {
  if (await isSuperAdmin(userId)) return true;

  if (await authorize({ user: userId, resourceKey, action: roleKey })) return true;
  if (
    resourceKey !== "hr" &&
    await authorize({ user: userId, resourceKey: "hr", action: roleKey })
  ) return true;
  return false;
}

export async function checkHRWrite(
  userId: number,
  resourceKey: string = "hr",
): Promise<boolean> {
  return checkHRAccess(userId, "write", resourceKey);
}

export async function checkHRDelete(
  userId: number,
  resourceKey: string = "hr",
): Promise<boolean> {
  return checkHRAccess(userId, "delete", resourceKey);
}

export async function checkWorkAccess(
  userId: number,
  roleKey: AuthorizeAction = "access",
): Promise<boolean> {
  return (
    (await isSuperAdmin(userId)) ||
    (await authorize({ user: userId, resourceKey: "work.projects", action: roleKey })) ||
    (await authorize({ user: userId, resourceKey: "work", action: roleKey }))
  );
}

export async function checkWorkWrite(userId: number): Promise<boolean> {
  return checkWorkAccess(userId, "write");
}

export async function checkWorkDelete(userId: number): Promise<boolean> {
  return checkWorkAccess(userId, "delete");
}

export async function checkWorksAccess(userId: number): Promise<boolean> {
  return checkWorkAccess(userId, "access");
}

export async function checkContractAccess(userId: number): Promise<boolean> {
  return (
    (await isSuperAdmin(userId)) ||
    (await authorize({ user: userId, resourceKey: "administration.contracts", action: "access" }))
  );
}

export async function checkLibraryAccess(userId: number): Promise<boolean> {
  return (
    (await isSuperAdmin(userId)) ||
    (await authorize({ user: userId, resourceKey: "library.basicInfo", action: "access" }))
  );
}

export async function checkLibraryWrite(userId: number): Promise<boolean> {
  return (
    (await isSuperAdmin(userId)) ||
    (await authorize({ user: userId, resourceKey: "library.basicInfo.write", action: "write" }))
  );
}
