import assert from "node:assert/strict";
import test from "node:test";

import { scanErrexitSource, validateErrexitPolicy } from "./check-shell-errexit-policy.mjs";
import { checkTaskInputContract } from "./check-task-contracts.mjs";

const enable = `set ${"-euo"}`;
const enableLine = `${enable} pipefail`;
const simpleEnable = `set ${"-e"}`;
const longEnable = `set -o ${"errexit"}`;

function policyFor(entries, expectedOccurrenceCount) {
  return {
    schemaVersion: 1,
    diagnosticPolicy: "prohibited",
    expectedOccurrenceCount,
    entries,
  };
}

test("scanner finds real errexit enables while ignoring disable and prose", () => {
  const source = [
    "#!/usr/bin/env bash",
    enableLine,
    `set ${"+e"}`,
    `if failed; then ${simpleEnable}; fi`,
    longEnable,
    `# ${simpleEnable} is documentation only`,
    "const prose = 'weakening errexit is not a shell command';",
  ].join("\n");

  assert.deepEqual(scanErrexitSource(source).map(({ line, command }) => ({ line, command })), [
    { line: 2, command: enable },
    { line: 4, command: simpleEnable },
    { line: 5, command: longEnable },
  ]);
});

test("classified execution and dependent occurrence counts pass", () => {
  const occurrences = [
    { path: "ops/execute.sh", line: 2, command: enable },
    { path: "ops/check.sh", line: 2, command: simpleEnable },
  ];
  const policy = policyFor([
    { path: "ops/execute.sh", command: enable, counts: { execution: 1 }, reason: "mutation chain" },
    { path: "ops/check.sh", command: simpleEnable, counts: { dependent: 1 }, reason: "dependent contract chain" },
  ], 2);

  const result = validateErrexitPolicy({ policy, occurrences });
  assert.equal(result.ok, true);
  assert.deepEqual(result.counts, {
    occurrences: 2,
    execution: 1,
    dependent: 1,
    structural: 0,
    diagnostic: 0,
  });
});

test("unclassified additions and occurrence count drift fail closed", () => {
  const policy = policyFor([
    { path: "ops/execute.sh", command: enable, counts: { execution: 1 }, reason: "mutation chain" },
  ], 1);
  const occurrences = [
    { path: "ops/execute.sh", line: 2, command: enable },
    { path: "ops/execute.sh", line: 9, command: enable },
    { path: "ops/new.sh", line: 2, command: simpleEnable },
  ];

  const result = validateErrexitPolicy({ policy, occurrences });
  assert.equal(result.ok, false);
  assert.match(result.violations.join("\n"), /count drift/);
  assert.match(result.violations.join("\n"), /unclassified errexit occurrence/);
  assert.match(result.violations.join("\n"), /total errexit count drift/);
});

test("mixed-category groups bind each classified occurrence to an exact line", () => {
  const policy = policyFor([
    {
      path: "ops/mixed.sh",
      command: simpleEnable,
      counts: { execution: 1, structural: 1 },
      lines: { execution: [3], structural: [9] },
      reason: "execution plus local status restoration",
    },
  ], 2);
  const moved = [
    { path: "ops/mixed.sh", line: 3, command: simpleEnable },
    { path: "ops/mixed.sh", line: 10, command: simpleEnable },
  ];

  const result = validateErrexitPolicy({ policy, occurrences: moved });
  assert.equal(result.ok, false);
  assert.match(result.violations.join("\n"), /errexit location drift/);
});

test("new diagnostic and preflight classifications are prohibited", () => {
  const diagnostic = policyFor([
    { path: "ops/new-check.sh", command: simpleEnable, counts: { diagnostic: 1 }, reason: "new preflight" },
  ], 1);
  const preflight = policyFor([
    { path: "ops/new-check.sh", command: simpleEnable, counts: { preflight: 1 }, reason: "invalid category" },
  ], 1);
  const occurrences = [{ path: "ops/new-check.sh", line: 2, command: simpleEnable }];

  assert.match(
    validateErrexitPolicy({ policy: diagnostic, occurrences }).violations.join("\n"),
    /diagnostic\/preflight errexit is prohibited/,
  );
  assert.match(
    validateErrexitPolicy({ policy: preflight, occurrences }).violations.join("\n"),
    /forbidden errexit category preflight/,
  );
});

test("deploy execution errexit is allowed only immediately after the canonical mutation barrier", () => {
  const barrier = "# workspace-errexit-role: mutation-barrier";
  const entry = {
    path: "ops/deploy.sh",
    command: simpleEnable,
    counts: { execution: 1 },
    requiredPreviousLine: barrier,
    reason: "mutation starts after lock acquisition",
  };
  const accepted = [{ path: "ops/deploy.sh", line: 20, command: simpleEnable, previousLine: barrier }];
  const moved = [{ path: "ops/deploy.sh", line: 20, command: simpleEnable, previousLine: "acquire_lock" }];

  assert.equal(validateErrexitPolicy({ policy: policyFor([entry], 1), occurrences: accepted }).ok, true);
  assert.match(
    validateErrexitPolicy({ policy: policyFor([entry], 1), occurrences: moved }).violations.join("\n"),
    /errexit barrier drift/,
  );
  assert.match(
    validateErrexitPolicy({
      policy: policyFor([{ ...entry, requiredPreviousLine: undefined }], 1),
      occurrences: accepted,
    }).violations.join("\n"),
    /execution errexit requires # workspace-errexit-role: mutation-barrier/,
  );
});

test("diagnostic filenames cannot bypass the ban by claiming execution", () => {
  const entry = {
    path: "ops/runtime-health-verify.sh",
    command: simpleEnable,
    counts: { execution: 1 },
    reason: "incorrect execution claim",
  };
  const occurrences = [{ path: entry.path, line: 2, command: simpleEnable }];
  const result = validateErrexitPolicy({ policy: policyFor([entry], 1), occurrences });
  assert.equal(result.ok, false);
  assert.match(result.violations.join("\n"), /diagnostic path cannot enable errexit/);
});

test("release task input contract binds the scanner, policy, and tracked source inventory", () => {
  const contract = checkTaskInputContract({ id: "shell-errexit-policy" });

  assert.deepEqual(contract.detectors, ["scripts/check/check-shell-errexit-policy.mjs"]);
  assert.deepEqual(contract.files, ["scripts/check/shell-errexit-policy.json"]);
  assert.deepEqual(contract.patterns, ["^(?!scripts/check/shell-errexit-policy\\.json$).+"]);
});
