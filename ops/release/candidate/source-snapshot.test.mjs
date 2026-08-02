import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createCandidateSourceSnapshot,
  validateCandidateSourceSnapshot,
} from "./source-snapshot.mjs";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "candidate-source-snapshot-"));
  fs.mkdirSync(path.join(root, "scripts/arch/source-code-analysis"), { recursive: true });
  fs.symlinkSync(path.resolve("node_modules"), path.join(root, "node_modules"), "dir");
  fs.writeFileSync(path.join(root, "tracked.txt"), "candidate\n");
  fs.writeFileSync(path.join(root, "scripts/arch/source-code-analysis/cli.ts"), `
    import fs from "node:fs";
    import path from "node:path";
    if (!process.argv.includes("--check") || !process.argv.includes("--write")) process.exit(7);
    const output = process.argv.find((value) => value.startsWith("--output="))?.slice(9);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify({ sourceDigest: "${"d".repeat(64)}" }) + "\\n");
  `);
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-qm", "fixture"], { cwd: root });
  const source = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const tree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: root, encoding: "utf8" }).trim();
  return {
    root,
    options: {
      repository: root,
      snapshot: path.join(root, ".cache/source-code-analysis/snapshot.json"),
      output: path.join(root, ".cache/release-artifacts/evidence/source-snapshot.json"),
      source,
      tree,
      content: "c".repeat(64),
    },
  };
}

test("one frozen candidate snapshot produces an exact reusable receipt", (t) => {
  const { root, options } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const receipt = createCandidateSourceSnapshot(options);
  assert.equal(validateCandidateSourceSnapshot(receipt, options), receipt);
  assert.equal(JSON.parse(fs.readFileSync(options.output, "utf8")).receiptDigest, receipt.receiptDigest);
});

test("snapshot tampering and dirty candidate state fail closed", (t) => {
  const { root, options } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const receipt = createCandidateSourceSnapshot(options);
  fs.writeFileSync(options.snapshot, JSON.stringify({ sourceDigest: "e".repeat(64) }));
  assert.throws(() => validateCandidateSourceSnapshot(receipt, options), /does not match/);
  fs.writeFileSync(path.join(root, "tracked.txt"), "dirty\n");
  assert.throws(() => createCandidateSourceSnapshot(options), /exact clean frozen worktree/);
});
