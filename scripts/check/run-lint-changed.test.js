const assert = require("node:assert/strict");
const test = require("node:test");

const { main, selectLintFiles } = require("./run-lint-changed");
const {
  discoverTrackedOpsShellFiles,
  selectOpsShellFiles,
} = require("./run-ops-shellcheck");

test("changed lint selects ops JavaScript for ESLint and ops Shell for ShellCheck", () => {
  assert.deepEqual(selectLintFiles([
    "ops/deploy.sh",
    "ops/deploy/runtime-provision.sh",
    "ops/cnb-deploy-request.mjs",
    "packages/work/ui/Panel.tsx",
    "docs/README.md",
  ]), {
    eslintFiles: ["ops/cnb-deploy-request.mjs", "packages/work/ui/Panel.tsx"],
    opsShellFiles: ["ops/deploy.sh", "ops/deploy/runtime-provision.sh"],
  });
});

test("changed lint invokes both linters through their exact file contracts", () => {
  const calls = [];
  const status = main({
    cwd: "/repo",
    changed: {
      files: ["ops/deploy.sh", "ops/cnb-deploy-request.mjs"],
      source: "fixture",
    },
    spawn(command, args) {
      calls.push({ command, args });
      return { status: 0 };
    },
    stdout: { write() {} },
    stderr: { write() {} },
  });
  assert.equal(status, 0);
  assert.deepEqual(calls.map(({ command }) => command), ["npx", "shellcheck"]);
  assert.ok(calls[0].args.includes("ops/cnb-deploy-request.mjs"));
  assert.deepEqual(calls[1].args.slice(-1), ["ops/deploy.sh"]);
});

test("full ops shell discovery uses tracked recursive paths and stable sorting", () => {
  const files = discoverTrackedOpsShellFiles({
    cwd: "/repo",
    spawn(command, args) {
      assert.equal(command, "git");
      assert.ok(args.includes(":(glob)ops/**/*.sh"));
      return {
        status: 0,
        stdout: Buffer.from("ops/publish.sh\0ops/deploy/runtime-provision.sh\0ops/publish.sh\0"),
      };
    },
  });
  assert.deepEqual(files, ["ops/deploy/runtime-provision.sh", "ops/publish.sh"]);
  assert.deepEqual(selectOpsShellFiles(["scripts/a.sh", "ops/a.txt"]), []);
});
