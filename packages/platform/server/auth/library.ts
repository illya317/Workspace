import { authorize } from "./authorize";

export async function checkLibraryAccess(userId: number): Promise<boolean> {
  return (
    (await authorize({ user: userId, resourceKey: "system", action: "admin" })) ||
    (await authorize({ user: userId, resourceKey: "library.basicInfo", action: "access" }))
  );
}

export async function checkLibraryWrite(userId: number): Promise<boolean> {
  return (
    (await authorize({ user: userId, resourceKey: "system", action: "admin" })) ||
    (await authorize({ user: userId, resourceKey: "library.basicInfo.write", action: "write" }))
  );
}
