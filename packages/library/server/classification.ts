import { prisma } from "@workspace/platform/server/prisma";
import {
  buildEnsureLibraryCategoryCommand,
  buildEnsureLibraryDirectoryCommand,
} from "./domain/classification-validation";

export async function ensureLibraryDirectory(rootKey: string, directoryPath: string | null | undefined): Promise<number> {
  const command = buildEnsureLibraryDirectoryCommand(rootKey, directoryPath);
  if (!command.ok) throw new Error(command.issue.message);
  const { relativePath, name } = command.data;
  const directory = await prisma.libraryDirectory.upsert({
    where: { rootKey_relativePath: { rootKey: command.data.rootKey, relativePath } },
    create: { rootKey: command.data.rootKey, relativePath, name, lastScannedAt: new Date() },
    update: { name, status: "active", lastScannedAt: new Date() },
  });
  return directory.id;
}

export async function ensureLibraryCategory(code?: string | null, name?: string | null): Promise<number | null> {
  const command = buildEnsureLibraryCategoryCommand(code, name);
  if (!command.ok) throw new Error(command.issue.message);
  if (!command.data) return null;
  const category = await prisma.libraryCategory.upsert({
    where: { code: command.data.code },
    create: command.data,
    update: { name: command.data.name, fullPath: command.data.fullPath, status: "active" },
  });
  return category.id;
}
