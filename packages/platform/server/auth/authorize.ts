import "server-only";
import { evaluatePermission } from "../rbac/check";
import { isResourceEnabled } from "../../effective-module-registry";

export type AuthorizeAction = "access" | "write" | "delete" | "admin";

export type AuthorizeUser =
  | number
  | {
      id?: number | null;
      userId?: number | null;
      isSuperAdmin?: boolean | null;
    }
  | null
  | undefined;

export interface AuthorizeInput {
  user: AuthorizeUser;
  resourceKey: string;
  action: AuthorizeAction;
}

export function getAuthorizeUserId(user: AuthorizeUser): number | null {
  if (typeof user === "number") return user;
  if (!user) return null;
  return user.userId ?? user.id ?? null;
}

export async function authorize({
  user,
  resourceKey,
  action,
}: AuthorizeInput): Promise<boolean> {
  if (!resourceKey) return false;
  if (!isResourceEnabled(resourceKey)) return false;
  if (typeof user !== "number" && user?.isSuperAdmin) return true;

  const userId = getAuthorizeUserId(user);
  if (!userId) return false;
  if (resourceKey === "settings.account" && action === "access") return true;
  return evaluatePermission(userId, resourceKey, action);
}

export async function requireAuthorized(input: AuthorizeInput): Promise<void> {
  if (!(await authorize(input))) {
    throw new Error("FORBIDDEN");
  }
}
