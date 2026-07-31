export type AggregateGateCheck = [name: string, run: () => boolean | Promise<boolean>];

export async function runAggregateGate(input: {
  checks: AggregateGateCheck[];
  displayName: string;
  logName: string;
}) {
  const failed: string[] = [];
  for (const [name, run] of input.checks) {
    let ok = false;
    try {
      ok = await run();
    } catch (error) {
      console.error(`${input.displayName} gate ${name} threw:`, error instanceof Error ? error.message : error);
    }
    if (!ok) {
      console.error(`❌ ${input.logName} GATE FAILED:`, name);
      failed.push(name);
    }
  }

  if (failed.length > 0) {
    console.error(`❌ ${input.logName} GATE COMPLETE: ${failed.length} failure(s): ${failed.join(", ")}`);
    return false;
  }
  console.log(`✅ ${input.logName} GATE PASSED`);
  return true;
}
