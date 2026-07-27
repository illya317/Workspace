import assert from "node:assert/strict";
import test from "node:test";

import {
  main,
  requiredRepositoryNodeMajor,
  requiresRepositoryNodeBootstrap,
  runLocalFullCi,
} from "./run-local-full-ci.mjs";

const tree = "a".repeat(40);
const changedTree = "b".repeat(40);

function createHarness({ statuses = ["", ""], trees = [tree, tree], env = {}, suiteStatus = 0 } = {}) {
  const statusQueue = [...statuses];
  const treeQueue = [...trees];
  const writes = [];
  const output = [];
  const suiteCalls = [];
  const gitCalls = [];
  const git = (args) => {
    const command = args.join(" ");
    gitCalls.push(command);
    if (command === "status --porcelain=v1 --untracked-files=all") return statusQueue.shift() ?? "";
    if (command === "rev-parse HEAD^{tree}") return treeQueue.shift() ?? tree;
    if (command === "rev-parse --git-path workspace-local-full-ci.json") {
      return ".git/workspace-local-full-ci.json";
    }
    throw new Error(`unexpected git command: ${command}`);
  };
  const status = runLocalFullCi({
    cwd: "/workspace",
    env,
    git,
    runSuites: (suiteNames, options) => {
      suiteCalls.push({ suiteNames, options });
      return suiteStatus;
    },
    writeReceipt: (file, receipt) => writes.push({ file, receipt }),
    stdout: { write: (value) => output.push(value) },
  });
  return { gitCalls, output, status, suiteCalls, writes };
}

test("clean local full CI records one exact-tree receipt after the suite passes", () => {
  const result = createHarness();

  assert.equal(result.status, 0);
  assert.deepEqual(result.suiteCalls.map(({ suiteNames }) => suiteNames), [["ci"]]);
  assert.equal(result.suiteCalls[0].options.collectFailures, true);
  assert.equal(result.writes.length, 1);
  assert.equal(result.writes[0].file, "/workspace/.git/workspace-local-full-ci.json");
  assert.equal(result.writes[0].receipt.treeSha, tree);
  assert.equal(result.writes[0].receipt.command, "npm run check:ci");
});

test("dirty or staged input runs the suite without writing a receipt", () => {
  const result = createHarness({ statuses: ["M package.json"] });

  assert.equal(result.status, 0);
  assert.deepEqual(result.suiteCalls.map(({ suiteNames }) => suiteNames), [["ci"]]);
  assert.equal(result.writes.length, 0);
});

test("post-check dirtiness or HEAD tree drift prevents receipt creation", () => {
  assert.equal(createHarness({ statuses: ["", "M generated/file.ts"] }).writes.length, 0);
  assert.equal(createHarness({ trees: [tree, changedTree] }).writes.length, 0);
});

test("CI and PRE_COMMIT_FULL never let the wrapper write a HEAD receipt", () => {
  for (const env of [{ CI: "true" }, { PRE_COMMIT_FULL: "1" }]) {
    const result = createHarness({ env, statuses: [], trees: [] });
    assert.equal(result.status, 0);
    assert.deepEqual(result.suiteCalls.map(({ suiteNames }) => suiteNames), [["ci"]]);
    assert.equal(result.writes.length, 0);
    assert.equal(result.gitCalls.length, 0);
  }
});

test("a failed suite never writes a receipt", () => {
  const result = createHarness({ statuses: [""], trees: [tree], suiteStatus: 9 });

  assert.equal(result.status, 9);
  assert.equal(result.writes.length, 0);
});

test("the executable wrapper refuses to bypass the shared project lock", () => {
  assert.throws(() => main([], {}), /must run through scripts\/check\/with-check-lock/);
});

test("full CI bootstraps the repository Node major before running suites", () => {
  const requiredMajor = requiredRepositoryNodeMajor();
  assert.equal(requiresRepositoryNodeBootstrap({ nodeVersion: `${requiredMajor}.99.0` }), false);
  assert.equal(requiresRepositoryNodeBootstrap({ nodeVersion: "999.0.0" }), true);
});
