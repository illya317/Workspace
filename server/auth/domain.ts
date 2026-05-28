import { checkPermission } from "@/server/rbac/check";

export async function checkHRAccess(
  userId: number,
  roleKey: "access" | "write" | "delete" | "admin" = "access",
): Promise<boolean> {
  if (await checkPermission(userId, "system", "admin")) return true;
  if (roleKey === "access") {
    return (
      (await checkPermission(userId, "people", "access")) ||
      (await checkPermission(userId, "people", "write")) ||
      (await checkPermission(userId, "people", "delete"))
    );
  }
  return checkPermission(userId, "people", roleKey);
}

export async function checkHRWrite(userId: number): Promise<boolean> {
  return checkHRAccess(userId, "write");
}

export async function checkHRDelete(userId: number): Promise<boolean> {
  return checkHRAccess(userId, "delete");
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

export async function checkInventoryAccess(userId: number): Promise<boolean> {
  return (
    (await checkPermission(userId, "system", "admin")) ||
    (await checkPermission(userId, "inventory", "access"))
  );
}

export async function checkContractAccess(userId: number): Promise<boolean> {
  return (
    (await checkPermission(userId, "system", "admin")) ||
    (await checkPermission(userId, "contract", "access"))
  );
}
