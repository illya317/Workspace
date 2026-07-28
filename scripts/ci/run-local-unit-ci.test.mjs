import assert from "node:assert/strict";
import test from "node:test";

import { validateLocalUnitCiReceipt } from "./local-unit-ci-receipt.mjs";
import { runLocalUnitCi } from "./run-local-unit-ci.mjs";

const sourceSha = "a".repeat(40);
const treeSha = "b".repeat(40);

function gitCommand(statuses = ["", ""]) {
  let statusIndex = 0;
  return (args) => {
    if (args[0] === "status") return statuses[statusIndex++] ?? statuses.at(-1);
    if (args.at(-1) === "HEAD^{commit}") return sourceSha;
    if (args.at(-1) === "HEAD^{tree}") return treeSha;
    throw new Error(`unexpected git command: ${args.join(" ")}`);
  };
}

test("local unit CI writes exact clean-tree evidence after the release-unit suite passes", () => {
  let written;
  const status = runLocalUnitCi({
    unitId: "hr",
    output: ".cache/hr.json",
    gitCommand: gitCommand(),
    runSuites: (suites, options) => {
      assert.deepEqual(suites, ["release-unit"]);
      assert.equal(options.collectFailures, true);
      return 0;
    },
    writeReceipt: (_file, receipt) => { written = receipt; },
    stdout: { write() {} },
  });
  assert.equal(status, 0);
  assert.equal(validateLocalUnitCiReceipt(written, {
    unitId: "hr",
    sourceSha,
    treeSha,
  }), written);
});

test("local unit CI refuses dirty inputs, failures, or checks that dirty the tree", () => {
  assert.throws(() => runLocalUnitCi({
    unitId: "hr",
    output: "receipt.json",
    gitCommand: gitCommand(["dirty"]),
  }), /requires a clean/);
  assert.equal(runLocalUnitCi({
    unitId: "hr",
    output: "receipt.json",
    gitCommand: gitCommand(),
    runSuites: () => 7,
    stdout: { write() {} },
  }), 7);
  assert.throws(() => runLocalUnitCi({
    unitId: "hr",
    output: "receipt.json",
    gitCommand: gitCommand(["", "dirty"]),
    runSuites: () => 0,
    stdout: { write() {} },
  }), /changed the working tree/);
});
