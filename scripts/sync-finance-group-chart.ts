import { syncFinanceGroupChart } from "@workspace/finance/server/ledger/group-accounts";

async function main() {
  const result = await syncFinanceGroupChart();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
