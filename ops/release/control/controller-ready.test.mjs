import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  controllerReadyReceiptFile,
  main,
  qualifyControllerReady,
  verifyControllerReady,
  verifyControllerReadyReceipt,
} from "./controller-ready.mjs";

const OPS_TEST_COMMAND = "node scripts/check/with-check-lock.js -- node scripts/testing/run-node-tests.mjs shard ops";
const CHECK_LOCK_RUNNER = `
const { spawnSync } = require("node:child_process");
const separator = process.argv.indexOf("--");
if (separator < 0 || !process.argv[separator + 1]) process.exit(2);
const result = spawnSync(process.argv[separator + 1], process.argv.slice(separator + 2), { stdio: "inherit" });
if (result.error) throw result.error;
process.exit(Number.isInteger(result.status) ? result.status : 1);
`;
const SUCCESSFUL_OPS_SHARD = `
if (process.argv.slice(2).join(" ") !== "shard ops") process.exit(2);
console.log("fixture ops shard passed");
`;
const FAILING_OPS_SHARD = `
if (process.argv.slice(2).join(" ") !== "shard ops") process.exit(2);
process.exit(17);
`;
const MOVING_OPS_SHARD = `
import { execFileSync } from "node:child_process";
import fs from "node:fs";
if (process.argv.slice(2).join(" ") !== "shard ops") process.exit(2);
fs.writeFileSync("ops/deploy.sh", "#!/bin/bash\\nset -eu\\n");
execFileSync("git", ["add", "ops/deploy.sh"]);
execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "controller moved during tests"]);
console.log("controller moved");
`;

function git(repository, ...args) {
  return execFileSync("git", args, { cwd: repository, encoding: "utf8" }).trim();
}

function commit(repository, message) {
  git(repository, "add", ".");
  git(repository, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", message);
  return git(repository, "rev-parse", "HEAD");
}

function repositoryFixture(t, { opsShard = SUCCESSFUL_OPS_SHARD } = {}) {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-controller-ready-"));
  t.after(() => fs.rmSync(repository, { recursive: true, force: true }));
  git(repository, "init", "-q");
  fs.mkdirSync(path.join(repository, "ops", "release", "control"), { recursive: true });
  fs.mkdirSync(path.join(repository, "scripts", "check"), { recursive: true });
  fs.mkdirSync(path.join(repository, "scripts", "testing"), { recursive: true });
  fs.writeFileSync(path.join(repository, ".gitignore"), ".cache/\n");
  fs.writeFileSync(path.join(repository, "app.ts"), "export const application = 1;\n");
  fs.writeFileSync(path.join(repository, "ops", "deploy.sh"), "#!/bin/bash\n");
  fs.writeFileSync(path.join(repository, "scripts", "check", "with-check-lock.js"), CHECK_LOCK_RUNNER);
  fs.writeFileSync(path.join(repository, "scripts", "testing", "run-node-tests.mjs"), opsShard);
  const readySource = commit(repository, "application ready");
  fs.writeFileSync(path.join(repository, "ops", "deploy.sh"), "#!/bin/bash\nset -e\n");
  fs.writeFileSync(
    path.join(repository, "ops", "release", "control", "controller.mjs"),
    "export const controller = 1;\n",
  );
  commit(repository, "controller change");
  return { repository, readySource };
}

test("direct qualification runs the fixed real ops shard and atomically signs its structured evidence", async (t) => {
  const { repository, readySource } = repositoryFixture(t);
  const file = controllerReadyReceiptFile(repository);
  const receipt = await qualifyControllerReady({ repository, readySource });

  assert.equal(receipt.readySource, readySource);
  assert.deepEqual(receipt.controller.changedFiles, ["ops/deploy.sh", "ops/release/control/controller.mjs"]);
  assert.equal(receipt.opsTestEvidence.command, OPS_TEST_COMMAND);
  assert.equal(receipt.opsTestEvidence.status, "passed");
  assert.equal(receipt.opsTestEvidence.exitCode, 0);
  assert.deepEqual(receipt.opsTestEvidence.runtime, {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    executable: process.execPath,
  });
  assert.match(receipt.opsTestEvidence.outputDigest, /^[0-9a-f]{64}$/);
  assert.ok(Number.isFinite(Date.parse(receipt.opsTestEvidence.completedAt)));
  assert.match(receipt.receiptDigest, /^[0-9a-f]{64}$/);
  assert.deepEqual(verifyControllerReady({ repository, readySource, file }), receipt);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(fs.readdirSync(path.dirname(file)).some((entry) => entry.includes(".tmp-")), false);
});

test("a failing ops runner rejects qualification without writing a receipt", async (t) => {
  const { repository, readySource } = repositoryFixture(t, { opsShard: FAILING_OPS_SHARD });
  const file = controllerReadyReceiptFile(repository);
  await assert.rejects(
    () => qualifyControllerReady({ repository, readySource }),
    /ops test shard failed with exit code 17/,
  );
  assert.equal(fs.existsSync(file), false);
});

test("embedded release metadata must contain an explicit Controller Ready receipt", (t) => {
  const { repository, readySource } = repositoryFixture(t);
  assert.throws(
    () => verifyControllerReadyReceipt({ receipt: undefined, repository, readySource, controllerSource: "HEAD" }),
    /release metadata must contain a Controller Ready receipt/,
  );
});

test("an injection may use the verified controller parent while preserving its older Application Ready source", async (t) => {
  const { repository, readySource } = repositoryFixture(t);
  const receipt = await qualifyControllerReady({ repository, readySource });
  const controllerSource = receipt.controller.sourceSha;
  fs.writeFileSync(path.join(repository, ".cnb-release.json"), "{}\n");
  fs.writeFileSync(path.join(repository, ".cnb.yml"), "main: ok\n");
  commit(repository, "release injection");

  assert.notEqual(controllerSource, readySource);
  assert.equal(git(repository, "rev-parse", "HEAD^"), controllerSource);
  assert.deepEqual(
    verifyControllerReadyReceipt({ receipt, repository, readySource, controllerSource: "HEAD^" }),
    receipt,
  );

  const mismatched = structuredClone(receipt);
  mismatched.controller.controlDigest = "b".repeat(64);
  assert.throws(
    () => verifyControllerReadyReceipt({ receipt: mismatched, repository, readySource, controllerSource: "HEAD^" }),
    /stale for the current deploy controller/,
  );
});

test("the CLI rejects caller-supplied evidence before qualification", async (t) => {
  const { repository, readySource } = repositoryFixture(t);
  await assert.rejects(
    () => main([
      "qualify",
      "--repository",
      repository,
      "--ready-source",
      readySource,
      "--ops-test-evidence",
      '{"status":"passed"}',
    ]),
    /unknown controller-ready option: --ops-test-evidence/,
  );
  assert.equal(fs.existsSync(controllerReadyReceiptFile(repository)), false);
});

test("controller movement during the ops runner rejects qualification without writing a receipt", async (t) => {
  const { repository, readySource } = repositoryFixture(t, { opsShard: MOVING_OPS_SHARD });
  const file = controllerReadyReceiptFile(repository);
  await assert.rejects(
    () => qualifyControllerReady({ repository, readySource }),
    /changed while the ops test shard was running/,
  );
  assert.equal(fs.existsSync(file), false);
});

test("missing, stale, drifted, and forged controller receipts fail closed", async (t) => {
  const { repository, readySource } = repositoryFixture(t);
  const file = controllerReadyReceiptFile(repository);
  assert.throws(
    () => verifyControllerReady({ repository, readySource, file }),
    /missing or invalid JSON/,
  );

  const receipt = await qualifyControllerReady({ repository, readySource });
  assert.throws(
    () => verifyControllerReady({ repository, readySource: receipt.controller.sourceSha, file }),
    /stale for the current Application Ready source/,
  );

  const drifted = JSON.parse(fs.readFileSync(file, "utf8"));
  drifted.controller.changedFiles = [];
  fs.writeFileSync(file, JSON.stringify(drifted));
  assert.throws(
    () => verifyControllerReady({ repository, readySource, file }),
    /changed-file drift/,
  );

  await qualifyControllerReady({ repository, readySource });
  const forged = JSON.parse(fs.readFileSync(file, "utf8"));
  forged.opsTestEvidence.exitCode = 1;
  fs.writeFileSync(file, JSON.stringify(forged));
  assert.throws(
    () => verifyControllerReady({ repository, readySource, file }),
    /ops test evidence is invalid/,
  );

  await qualifyControllerReady({ repository, readySource });
  fs.writeFileSync(path.join(repository, "ops", "deploy.sh"), "#!/bin/bash\nset -eu\n");
  commit(repository, "new controller");
  assert.throws(
    () => verifyControllerReady({ repository, readySource, file }),
    /stale for the current deploy controller/,
  );
});
