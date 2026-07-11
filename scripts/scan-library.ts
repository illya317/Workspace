import { scanLibrary } from "@workspace/library/server/scan";

async function main() {
  const result = await scanLibrary();
  console.log(
    `Scan complete: ${result.scanned} scanned, ${result.created} created, ${result.updated} updated, ${result.missing} missing`,
  );
  if (result.errors.length > 0) {
    console.error("Errors:");
    for (const err of result.errors.slice(0, 10)) {
      console.error("  -", err);
    }
    if (result.errors.length > 10) {
      console.error(`  ... and ${result.errors.length - 10} more`);
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
