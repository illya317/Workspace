import assert from "node:assert/strict";
import test from "node:test";

import { UI_GATE_CHECK_NAMES } from "../arch/gate-check-contracts.mjs";
import { checkTaskInputContract } from "./check-task-contracts.mjs";

test("every UI gate detector has a task input contract", () => {
  for (const detector of UI_GATE_CHECK_NAMES) {
    const contract = checkTaskInputContract({ id: `ui-architecture.${detector}` });
    assert.equal(contract.detector, detector);
    assert.equal(contract.detectors.length, 1);
  }
});
