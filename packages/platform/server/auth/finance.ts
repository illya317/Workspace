import { authorize, type AuthorizeAction } from "./authorize";

function can(userId: number, resourceKey: string, action: AuthorizeAction) {
  return authorize({ user: userId, resourceKey, action });
}

export async function checkFinanceAccess(
  userId: number,
  roleKey: AuthorizeAction = "access",
): Promise<boolean> {
  if (await can(userId, "system", "admin")) return true;
  if (roleKey === "access") {
    return (
      (await can(userId, "finance", "access")) ||
      (await can(userId, "finance", "write")) ||
      (await can(userId, "finance", "delete"))
    );
  }
  return can(userId, "finance", roleKey);
}

export async function checkFinanceWrite(userId: number): Promise<boolean> {
  return checkFinanceAccess(userId, "write");
}

export async function checkFinanceDelete(userId: number): Promise<boolean> {
  return checkFinanceAccess(userId, "delete");
}

export async function checkFinanceCostAccess(
  userId: number,
  roleKey: AuthorizeAction = "access",
): Promise<boolean> {
  if (await can(userId, "system", "admin")) return true;
  if (roleKey === "access") {
    return (
      (await can(userId, "finance.cost", "access")) ||
      (await can(userId, "finance.cost", "write")) ||
      (await can(userId, "finance.cost", "delete")) ||
      (await can(userId, "finance", "access")) ||
      (await can(userId, "finance", "write")) ||
      (await can(userId, "finance", "delete"))
    );
  }
  return (
    (await can(userId, "finance.cost", roleKey)) ||
    (await can(userId, "finance", roleKey))
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
  roleKey: AuthorizeAction = "access",
): Promise<boolean> {
  if (await can(userId, "system", "admin")) return true;
  if (roleKey === "access") {
    return (
      (await can(userId, "finance.ledger", "access")) ||
      (await can(userId, "finance.ledger", "write")) ||
      (await can(userId, "finance.ledger", "delete")) ||
      (await can(userId, "finance", "access")) ||
      (await can(userId, "finance", "write")) ||
      (await can(userId, "finance", "delete"))
    );
  }
  return (
    (await can(userId, "finance.ledger", roleKey)) ||
    (await can(userId, "finance", roleKey))
  );
}

export async function checkFinanceLedgerWrite(userId: number): Promise<boolean> {
  return checkFinanceLedgerAccess(userId, "write");
}

export async function checkFinanceLedgerDelete(userId: number): Promise<boolean> {
  return checkFinanceLedgerAccess(userId, "delete");
}

async function checkFinanceStatementResourceAccess(
  userId: number,
  resourceKey: "finance.statementConfig" | "finance.statementReview" | "finance.statements",
  roleKey: AuthorizeAction = "access",
): Promise<boolean> {
  if (await can(userId, "system", "admin")) return true;
  if (roleKey === "access") {
    return (
      (await can(userId, resourceKey, "access")) ||
      (await can(userId, resourceKey, "write")) ||
      (await can(userId, resourceKey, "delete")) ||
      (await can(userId, "finance", "access")) ||
      (await can(userId, "finance", "write")) ||
      (await can(userId, "finance", "delete"))
    );
  }
  return (
    (await can(userId, resourceKey, roleKey)) ||
    (await can(userId, "finance", roleKey))
  );
}

export async function checkFinanceStatementConfigAccess(
  userId: number,
  roleKey: AuthorizeAction = "access",
): Promise<boolean> {
  return checkFinanceStatementResourceAccess(userId, "finance.statementConfig", roleKey);
}

export async function checkFinanceStatementConfigWrite(userId: number): Promise<boolean> {
  return checkFinanceStatementConfigAccess(userId, "write");
}

export async function checkFinanceStatementReviewAccess(
  userId: number,
  roleKey: AuthorizeAction = "access",
): Promise<boolean> {
  return checkFinanceStatementResourceAccess(userId, "finance.statementReview", roleKey);
}

export async function checkFinanceStatementReviewWrite(userId: number): Promise<boolean> {
  return checkFinanceStatementReviewAccess(userId, "write");
}

export async function checkFinanceReportAccess(
  userId: number,
  roleKey: AuthorizeAction = "access",
): Promise<boolean> {
  return checkFinanceStatementResourceAccess(userId, "finance.statements", roleKey);
}

export async function checkFinanceReportWrite(userId: number): Promise<boolean> {
  return checkFinanceReportAccess(userId, "write");
}

export async function checkFinanceReportDelete(userId: number): Promise<boolean> {
  return checkFinanceReportAccess(userId, "delete");
}

export async function checkFinanceBudgetAccess(
  userId: number,
  roleKey: AuthorizeAction = "access",
): Promise<boolean> {
  if (await can(userId, "system", "admin")) return true;
  if (roleKey === "access") {
    return (
      (await can(userId, "finance.budget", "access")) ||
      (await can(userId, "finance.budget", "write")) ||
      (await can(userId, "finance.budget", "delete")) ||
      (await can(userId, "finance", "access")) ||
      (await can(userId, "finance", "write")) ||
      (await can(userId, "finance", "delete"))
    );
  }
  return (
    (await can(userId, "finance.budget", roleKey)) ||
    (await can(userId, "finance", roleKey))
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
  roleKey: AuthorizeAction = "access",
): Promise<boolean> {
  if (await can(userId, "system", "admin")) return true;
  if (roleKey === "access") {
    return (
      (await can(userId, "finance.analysis", "access")) ||
      (await can(userId, "finance.analysis", "write")) ||
      (await can(userId, "finance.analysis", "delete")) ||
      (await can(userId, "finance", "access")) ||
      (await can(userId, "finance", "write")) ||
      (await can(userId, "finance", "delete"))
    );
  }
  return (
    (await can(userId, "finance.analysis", roleKey)) ||
    (await can(userId, "finance", roleKey))
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
  roleKey: AuthorizeAction = "access",
): Promise<boolean> {
  if (await can(userId, "system", "admin")) return true;
  if (roleKey === "access") {
    return (
      (await can(userId, "finance.import", "access")) ||
      (await can(userId, "finance.import", "write")) ||
      (await can(userId, "finance.import", "delete")) ||
      (await can(userId, "finance", "access")) ||
      (await can(userId, "finance", "write")) ||
      (await can(userId, "finance", "delete"))
    );
  }
  return (
    (await can(userId, "finance.import", roleKey)) ||
    (await can(userId, "finance", roleKey))
  );
}

export async function checkFinanceImportWrite(userId: number): Promise<boolean> {
  return checkFinanceImportAccess(userId, "write");
}

export async function checkFinanceImportDelete(userId: number): Promise<boolean> {
  return checkFinanceImportAccess(userId, "delete");
}
