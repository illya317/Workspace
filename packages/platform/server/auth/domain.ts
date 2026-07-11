import { authorize, type AuthorizeAction } from "./authorize";
import { isSuperAdmin } from "./admin";

async function checkHRAction(userId: number, action: AuthorizeAction, resourceKey: string = "hr"): Promise<boolean> {
  if (await isSuperAdmin(userId)) return true;
  return authorize({ user: userId, resourceKey, action });
}

export async function checkHRRead(
  userId: number,
  resourceKey: string = "hr",
): Promise<boolean> {
  return checkHRAction(userId, "read", resourceKey);
}

export async function checkHRUpdate(
  userId: number,
  resourceKey: string = "hr",
): Promise<boolean> {
  return checkHRAction(userId, "update", resourceKey);
}

export async function checkHRDelete(
  userId: number,
  resourceKey: string = "hr",
): Promise<boolean> {
  return checkHRAction(userId, "delete", resourceKey);
}
