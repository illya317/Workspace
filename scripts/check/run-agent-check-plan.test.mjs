import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runAgentCheckPlan, validateAgentCheckPlan } from "./run-agent-check-plan.mjs";

function repository() {
  const root = mkdtempSync(path.join(tmpdir(), "agent-check-plan-"));
  const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  git("init", "--quiet");
  git("config", "user.name", "Agent Plan Test");
  git("config", "user.email", "agent-plan@example.invalid");
  writeFileSync(path.join(root, "selected.js"), "export {};\n");
  git("add", "selected.js");
  git("commit", "--quiet", "-m", "fixture");
  writeFileSync(path.join(root, "selected.js"), "export const selected = true;\n");
  git("add", "selected.js");
  writeFileSync(path.join(root, "unrelated.js"), "ignored\n");
  return root;
}

test("agent owns command selection while staged paths remain exact evidence", () => {
  const cwd = repository();
  const seen = [];
  const result = runAgentCheckPlan({
    cwd,
    plan: {
      schemaVersion: 1,
      kind: "workspace-agent-check-plan",
      selectedPaths: ["selected.js"],
      dependencyPaths: ["dependency.js"],
      commands: [{ label: "focused node test", command: "node", args: ["--test", "selected.test.js"] }],
    },
    execute: (command, args, env) => {
      seen.push({ command, args, changed: JSON.parse(env.WORKSPACE_CHANGED_FILES_JSON) });
      return { status: 0, signal: null, error: null };
    },
  });
  assert.equal(result.status, 0);
  assert.deepEqual(seen[0].changed, ["dependency.js", "selected.js"]);
});

test("plan cannot smuggle unrelated paths or a shell expression", () => {
  const cwd = repository();
  assert.throws(() => runAgentCheckPlan({
    cwd,
    plan: {
      schemaVersion: 1,
      kind: "workspace-agent-check-plan",
      selectedPaths: ["unrelated.js"],
      dependencyPaths: [],
      commands: [{ label: "test", command: "node", args: [] }],
    },
  }), /exactly match the staged tree/);
  assert.throws(() => validateAgentCheckPlan({
    schemaVersion: 1,
    kind: "workspace-agent-check-plan",
    selectedPaths: [],
    dependencyPaths: [],
    commands: [{ label: "unsafe", command: "npm && echo", args: [] }],
  }), /invalid/);
});
