import { domainGate } from "./domain-gate";
import { uiGate } from "./ui-gate";

export async function archGate() {
  if (!(await domainGate())) process.exit(1);
  if (!(await uiGate())) process.exit(1);

  console.log("✅ ARCH GATE PASSED");
}

void archGate();
