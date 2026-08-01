import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { DOMAIN_GATE_CHECK_NAMES, UI_GATE_CHECK_NAMES } from "./gate-check-contracts.mjs";
import { runAggregateGate } from "./aggregate-gate";

test("domain and UI gates execute every registered check before failing", async () => {
  for (const [displayName, logName] of [["Domain", "DOMAIN"], ["UI", "UI"]]) {
    const calls: string[] = [];
    const checks: [string, () => boolean][] = [
      ["first", () => { calls.push("first"); return false; }],
      ["second", () => { calls.push("second"); throw new Error("boom"); }],
      ["third", () => { calls.push("third"); return true; }],
    ];
    const result = await runAggregateGate({ checks, displayName, logName });

    assert.equal(result, false);
    assert.deepEqual(calls, ["first", "second", "third"]);
  }
});

test("domain and UI gates delegate to the shared aggregate runner", () => {
  for (const file of ["domain-gate.ts", "ui-gate.ts"]) {
    const source = fs.readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
    assert.match(source, /return runAggregateGate\(/);
  }
});

test("domain and UI detector contracts are stable and independently addressable", () => {
  for (const [names, file] of [
    [DOMAIN_GATE_CHECK_NAMES, "domain-gate.ts"],
    [UI_GATE_CHECK_NAMES, "ui-gate.ts"],
  ] as const) {
    assert.equal(new Set(names).size, names.length);
    const source = fs.readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
    for (const name of names) {
      assert.match(source, new RegExp(`\\[\\s*["']${name}["']\\s*,`));
    }
    assert.match(source, /--check/);
  }
});

test("structure ratchet aggregates detector categories instead of returning on the first", () => {
  const source = fs.readFileSync(new URL("./structure-enforce.ts", import.meta.url), "utf8");
  assert.match(source, /let passed = true/);
  assert.match(source, /if \(!checkRatchet\([^)]*\)\) passed = false/);
  assert.doesNotMatch(source, /if \(!checkRatchet\([^)]*\)\) return false/);
});

test("module gate executes every registered subprocess check", () => {
  const source = fs.readFileSync(new URL("./modules.ts", import.meta.url), "utf8");
  assert.match(source, /let passed = true/);
  assert.match(source, /if \(!runCommand\([^)]*\)\) passed = false/);
  assert.doesNotMatch(source, /if \(!runCommand\([^)]*\)\) return false/);
});
