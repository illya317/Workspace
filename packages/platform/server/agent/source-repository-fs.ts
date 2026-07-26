import { lstat } from "node:fs/promises";

export function sourceRepositoryErrorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : null;
}

export async function sourceRepositoryLstat(target: string) {
  return lstat(target).catch((error: unknown) => {
    if (sourceRepositoryErrorCode(error) === "ENOENT") return null;
    throw error;
  });
}
