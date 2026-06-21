import { authorize } from "./authorize";
import { isSuperAdmin } from "./admin";

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
