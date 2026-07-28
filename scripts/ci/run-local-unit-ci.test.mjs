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

test("local unit CI writes exact clean-tree evidence after protocol and scoped source checks pass", () => {
  let written;
  const calls = [];
  const status = runLocalUnitCi({
    unitId: "hr",
    output: ".cache/hr.json",
    gitCommand: gitCommand(),
    runSuites: (suites, options) => {
      calls.push(["protocol", suites]);
      assert.deepEqual(suites, ["release-unit-protocol"]);
      assert.equal(options.collectFailures, true);
      return 0;
    },
    runSourceChecks: (unitId) => { calls.push(["source", unitId]); return 0; },
    writeReceipt: (_file, receipt) => { written = receipt; },
    stdout: { write() {} },
  });
  assert.equal(status, 0);
  assert.deepEqual(calls, [
    ["protocol", ["release-unit-protocol"]],
    ["source", "hr"],
  ]);
  assert.equal(validateLocalUnitCiReceipt(written, {
    unitId: "hr",
    sourceSha,
    treeSha,
  }), written);
  assert.equal(written.schemaVersion, 2);
  assert.deepEqual(written.checks, [
    "release-unit-protocol",
    "deploy-unit-lint",
    "deploy-unit-node-tests",
  ]);
  assert.throws(() => validateLocalUnitCiReceipt({ ...written, schemaVersion: 1 }, {
    unitId: "hr",
    sourceSha,
    treeSha,
  }), /receipt contract is invalid/);
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
    runSourceChecks: () => { throw new Error("source checks must not run"); },
    stdout: { write() {} },
  }), 7);
  assert.throws(() => runLocalUnitCi({
    unitId: "hr",
    output: "receipt.json",
    gitCommand: gitCommand(["", "dirty"]),
    runSuites: () => 0,
    runSourceChecks: () => 0,
    stdout: { write() {} },
  }), /changed the working tree/);
});

test("local unit CI stops before writing a receipt when scoped source checks fail", () => {
  let written = false;
  const status = runLocalUnitCi({
    unitId: "hr",
    output: "receipt.json",
    gitCommand: gitCommand(),
    runSuites: () => 0,
    runSourceChecks: () => 8,
    writeReceipt: () => { written = true; },
    stdout: { write() {} },
  });
  assert.equal(status, 8);
  assert.equal(written, false);
});
