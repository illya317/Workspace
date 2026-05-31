import { checkPermission } from "@/server/rbac/check";

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

  const check = async (rk: string) => {
    if (roleKey === "access") {
      return (
        (await checkPermission(userId, rk, "access")) ||
        (await checkPermission(userId, rk, "write")) ||
        (await checkPermission(userId, rk, "delete"))
      );
    }
    return checkPermission(userId, rk, roleKey);
  };

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

export async function checkFinanceAccess(
  userId: number,
  roleKey: "access" | "write" | "delete" | "admin" = "access",
): Promise<boolean> {
  if (await checkPermission(userId, "system", "admin")) return true;
  if (roleKey === "access") {
    return (
      (await checkPermission(userId, "finance", "access")) ||
      (await checkPermission(userId, "finance", "write")) ||
      (await checkPermission(userId, "finance", "delete"))
    );
  }
  return checkPermission(userId, "finance", roleKey);
}

export async function checkFinanceWrite(userId: number): Promise<boolean> {
  return checkFinanceAccess(userId, "write");
}

export async function checkFinanceDelete(userId: number): Promise<boolean> {
  return checkFinanceAccess(userId, "delete");
}

export async function checkFinanceCostAccess(
  userId: number,
  roleKey: "access" | "write" | "delete" | "admin" = "access",
): Promise<boolean> {
  if (await checkPermission(userId, "system", "admin")) return true;
  if (roleKey === "access") {
    return (
      (await checkPermission(userId, "finance.cost", "access")) ||
      (await checkPermission(userId, "finance.cost", "write")) ||
      (await checkPermission(userId, "finance.cost", "delete")) ||
      (await checkPermission(userId, "finance", "access")) ||
      (await checkPermission(userId, "finance", "write")) ||
      (await checkPermission(userId, "finance", "delete"))
    );
  }
  return (
    (await checkPermission(userId, "finance.cost", roleKey)) ||
    (await checkPermission(userId, "finance", roleKey))
  );
}

export async function checkFinanceCostWrite(userId: number): Promise<boolean> {
  return checkFinanceCostAccess(userId, "write");
}

export async function checkFinanceCostDelete(userId: number): Promise<boolean> {
  return checkFinanceCostAccess(userId, "delete");
}

export async function checkFinanceLedgerAccess(
  userId: number,
  roleKey: "access" | "write" | "delete" | "admin" = "access",
): Promise<boolean> {
  if (await checkPermission(userId, "system", "admin")) return true;
  if (roleKey === "access") {
    return (
      (await checkPermission(userId, "finance.ledger", "access")) ||
      (await checkPermission(userId, "finance.ledger", "write")) ||
      (await checkPermission(userId, "finance.ledger", "delete")) ||
      (await checkPermission(userId, "finance", "access")) ||
      (await checkPermission(userId, "finance", "write")) ||
      (await checkPermission(userId, "finance", "delete"))
    );
  }
  return (
    (await checkPermission(userId, "finance.ledger", roleKey)) ||
    (await checkPermission(userId, "finance", roleKey))
  );
}

export async function checkFinanceLedgerWrite(userId: number): Promise<boolean> {
  return checkFinanceLedgerAccess(userId, "write");
}

export async function checkFinanceLedgerDelete(userId: number): Promise<boolean> {
  return checkFinanceLedgerAccess(userId, "delete");
}

export async function checkFinanceReportAccess(
  userId: number,
  roleKey: "access" | "write" | "delete" | "admin" = "access",
): Promise<boolean> {
  if (await checkPermission(userId, "system", "admin")) return true;
  if (roleKey === "access") {
    return (
      (await checkPermission(userId, "finance.statement", "access")) ||
      (await checkPermission(userId, "finance.statement", "write")) ||
      (await checkPermission(userId, "finance.statement", "delete")) ||
      (await checkPermission(userId, "finance", "access")) ||
      (await checkPermission(userId, "finance", "write")) ||
      (await checkPermission(userId, "finance", "delete"))
    );
  }
  return (
    (await checkPermission(userId, "finance.statement", roleKey)) ||
    (await checkPermission(userId, "finance", roleKey))
  );
}

export async function checkFinanceReportWrite(userId: number): Promise<boolean> {
  return checkFinanceReportAccess(userId, "write");
}

export async function checkFinanceReportDelete(userId: number): Promise<boolean> {
  return checkFinanceReportAccess(userId, "delete");
}

export async function checkFinanceBudgetAccess(
  userId: number,
  roleKey: "access" | "write" | "delete" | "admin" = "access",
): Promise<boolean> {
  if (await checkPermission(userId, "system", "admin")) return true;
  if (roleKey === "access") {
    return (
      (await checkPermission(userId, "finance.budget", "access")) ||
      (await checkPermission(userId, "finance.budget", "write")) ||
      (await checkPermission(userId, "finance.budget", "delete")) ||
      (await checkPermission(userId, "finance", "access")) ||
      (await checkPermission(userId, "finance", "write")) ||
      (await checkPermission(userId, "finance", "delete"))
    );
  }
  return (
    (await checkPermission(userId, "finance.budget", roleKey)) ||
    (await checkPermission(userId, "finance", roleKey))
  );
}

export async function checkFinanceBudgetWrite(userId: number): Promise<boolean> {
  return checkFinanceBudgetAccess(userId, "write");
}

export async function checkFinanceBudgetDelete(userId: number): Promise<boolean> {
  return checkFinanceBudgetAccess(userId, "delete");
}

export async function checkFinanceAnalysisAccess(
  userId: number,
  roleKey: "access" | "write" | "delete" | "admin" = "access",
): Promise<boolean> {
  if (await checkPermission(userId, "system", "admin")) return true;
  if (roleKey === "access") {
    return (
      (await checkPermission(userId, "finance.analysis", "access")) ||
      (await checkPermission(userId, "finance.analysis", "write")) ||
      (await checkPermission(userId, "finance.analysis", "delete")) ||
      (await checkPermission(userId, "finance", "access")) ||
      (await checkPermission(userId, "finance", "write")) ||
      (await checkPermission(userId, "finance", "delete"))
    );
  }
  return (
    (await checkPermission(userId, "finance.analysis", roleKey)) ||
    (await checkPermission(userId, "finance", roleKey))
  );
}

export async function checkFinanceAnalysisWrite(userId: number): Promise<boolean> {
  return checkFinanceAnalysisAccess(userId, "write");
}

export async function checkFinanceAnalysisDelete(userId: number): Promise<boolean> {
  return checkFinanceAnalysisAccess(userId, "delete");
}

export async function checkFinanceImportAccess(
  userId: number,
  roleKey: "access" | "write" | "delete" | "admin" = "access",
): Promise<boolean> {
  if (await checkPermission(userId, "system", "admin")) return true;
  if (roleKey === "access") {
    return (
      (await checkPermission(userId, "finance.import", "access")) ||
      (await checkPermission(userId, "finance.import", "write")) ||
      (await checkPermission(userId, "finance.import", "delete")) ||
      (await checkPermission(userId, "finance", "access")) ||
      (await checkPermission(userId, "finance", "write")) ||
      (await checkPermission(userId, "finance", "delete"))
    );
  }
  return (
    (await checkPermission(userId, "finance.import", roleKey)) ||
    (await checkPermission(userId, "finance", roleKey))
  );
}

export async function checkFinanceImportWrite(userId: number): Promise<boolean> {
  return checkFinanceImportAccess(userId, "write");
}

export async function checkFinanceImportDelete(userId: number): Promise<boolean> {
  return checkFinanceImportAccess(userId, "delete");
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
