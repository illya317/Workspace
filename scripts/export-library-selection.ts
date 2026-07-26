import { buildCreateLibraryExportCommand } from "@workspace/library/server/domain/export-validation";
import { createLibraryExport } from "@workspace/library/server/export";
import { prisma } from "@workspace/platform/server/prisma";

const args = process.argv.slice(2);
function required(name: string) {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const userId = Number(required("--user-id"));
const selection = JSON.parse(required("--selection"));
const command = buildCreateLibraryExportCommand({ userId, selection, includePreviews: args.includes("--include-previews") });
if (!command.ok) throw new Error(command.issue.message);
createLibraryExport(command.data)
  .then((job) => console.log(JSON.stringify(job, null, 2)))
  .finally(() => prisma.$disconnect());
