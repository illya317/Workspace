import { authorize } from "./authorize";

export async function checkLibraryAccess(userId: number): Promise<boolean> {
  return (
    (await authorize({ user: userId, resourceKey: "system", action: "admin" })) ||
    (await authorize({ user: userId, resourceKey: "library", action: "access" })) ||
    (await authorize({ user: userId, resourceKey: "library", action: "write" }))
  );
}

export async function checkLibraryWrite(userId: number): Promise<boolean> {
  return (
    (await authorize({ user: userId, resourceKey: "system", action: "admin" })) ||
    (await authorize({ user: userId, resourceKey: "library.write", action: "write" })) ||
    (await authorize({ user: userId, resourceKey: "library", action: "write" }))
  );
}
