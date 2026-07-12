import { processLibraryVersion } from "@workspace/library/server/processing";
import { prisma } from "@workspace/platform/server/prisma";

const args = process.argv.slice(2);
const index = args.indexOf("--version-uid");
const versionUid = index >= 0 ? args[index + 1] : undefined;
if (!versionUid) throw new Error("--version-uid is required");

processLibraryVersion({ versionUid })
  .then((result) => console.log(JSON.stringify(result, null, 2)))
  .finally(() => prisma.$disconnect());
