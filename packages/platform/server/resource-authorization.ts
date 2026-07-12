import type { PermissionActionKey } from "../permission-actions";
import { isRootAdminUser } from "./auth/root";

/** Public server seam for domain packages that need both action access and root-admin context. */
export async function evaluateResourceAuthorization(input: {
  userId: number;
  resourceKey: string;
  action: PermissionActionKey;
}) {
  const isRootAdmin = await isRootAdminUser(input.userId);
  const allowed = isRootAdmin
    ? true
    : await import("./auth/authorize").then(({ authorize }) => authorize({
      user: input.userId,
      resourceKey: input.resourceKey,
      action: input.action,
    }));
  return {
    isRootAdmin,
    allowed,
  };
}
