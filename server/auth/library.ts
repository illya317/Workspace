import { checkPermission } from "@/server/rbac/check";

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
