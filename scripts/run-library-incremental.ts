import { runLibraryIncremental } from "@workspace/library/server/incremental";
import { prisma } from "@workspace/platform/server/prisma";

const args = process.argv.slice(2);
const value = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

runLibraryIncremental({
  rootKey: value("--root-key"),
  preview: args.includes("--preview"),
  maxPreviews: value("--max-previews") ? Number(value("--max-previews")) : undefined,
})
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    if (result.status === "failed") process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
