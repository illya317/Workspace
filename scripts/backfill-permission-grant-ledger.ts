import "dotenv/config";

import { backfillPermissionGrantLedgerBaselines } from "@workspace/platform/server/rbac/permission-grant-ledger";
import { prisma } from "@workspace/platform/server/prisma";

async function main() {
  const batchId = process.argv[2] || undefined;
  const result = await backfillPermissionGrantLedgerBaselines(batchId);
  console.log(`Permission grant ledger baseline rows created: ${result.created}`);
  console.log(`Batch: ${result.batchId}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
