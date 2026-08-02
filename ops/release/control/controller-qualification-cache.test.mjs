import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  CONTROLLER_OPS_COMMAND,
  createQualificationReceipt,
  qualificationReceiptPath,
  readReusableQualification,
  sha256,
  validateQualificationReceipt,
  writeQualificationOnce,
} from "./controller-qualification-cache.mjs";

const digest = (label) => sha256(label);
const runtime = {
  nodeVersion: "v22.17.0",
  platform: "linux",
  arch: "x64",
  executable: "/usr/bin/node",
};

test("application source changes do not participate in exact controller qualification reuse", () => {
  const root = mkdtempSync(path.join(tmpdir(), "controller-qualification-"));
  try {
    const qualification = createQualificationReceipt({
      controlDigest: digest("same control plane"),
      runtimeIdentity: runtime,
      outputDigest: digest("passed ops output"),
      completedAt: "2026-08-02T00:00:00.000Z",
    });
    const file = writeQualificationOnce(root, qualification);
    const reused = readReusableQualification(root, {
      controlDigest: digest("same control plane"),
      runtimeIdentity: runtime,
    });
    assert.equal(reused.file, file);
    assert.equal(reused.receipt.receiptDigest, qualification.receiptDigest);
    assert.doesNotMatch(file, /baseline application source|news copy application source/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("control, governed command, and runtime each participate in the cache key", () => {
  const root = path.join(tmpdir(), "controller-qualification-key");
  const base = qualificationReceiptPath(root, {
    controlDigest: digest("control-a"),
    runtimeIdentity: runtime,
  });
  const changedControl = qualificationReceiptPath(root, {
    controlDigest: digest("control-b"),
    runtimeIdentity: runtime,
  });
  const changedRuntime = qualificationReceiptPath(root, {
    controlDigest: digest("control-a"),
    runtimeIdentity: { ...runtime, nodeVersion: "v22.18.0" },
  });
  assert.notEqual(base, changedControl);
  assert.notEqual(base, changedRuntime);
  assert.throws(
    () => qualificationReceiptPath(root, {
      controlDigest: digest("control-a"),
      command: `${CONTROLLER_OPS_COMMAND} --skip-slow`,
      runtimeIdentity: runtime,
    }),
    /command is not governed/,
  );
});

test("tampered passed evidence is rejected instead of reused", () => {
  const qualification = createQualificationReceipt({
    controlDigest: digest("control"),
    runtimeIdentity: runtime,
    outputDigest: digest("output"),
  });
  const expected = {
    controlDigest: digest("control"),
    runtimeIdentity: runtime,
  };
  validateQualificationReceipt(qualification, expected);
  assert.throws(
    () => validateQualificationReceipt({
      ...qualification,
      evidence: { ...qualification.evidence, outputDigest: digest("tampered") },
    }, expected),
    /receipt digest does not match/,
  );
  assert.throws(
    () => validateQualificationReceipt({
      ...qualification,
      evidence: { ...qualification.evidence, exitCode: 1 },
    }, expected),
    /exit code is not zero/,
  );
});

test("an existing immutable qualification wins a duplicate writer race", () => {
  const root = mkdtempSync(path.join(tmpdir(), "controller-qualification-race-"));
  try {
    const first = createQualificationReceipt({
      controlDigest: digest("control"),
      runtimeIdentity: runtime,
      outputDigest: digest("first output"),
      completedAt: "2026-08-02T00:00:00.000Z",
    });
    const second = createQualificationReceipt({
      controlDigest: digest("control"),
      runtimeIdentity: runtime,
      outputDigest: digest("second output"),
      completedAt: "2026-08-02T00:01:00.000Z",
    });
    const file = writeQualificationOnce(root, first);
    writeQualificationOnce(root, second);
    assert.equal(JSON.parse(readFileSync(file, "utf8")).receiptDigest, first.receiptDigest);

    const corrupted = { ...first, receiptDigest: digest("bad") };
    writeFileSync(file, `${JSON.stringify(corrupted)}\n`);
    assert.throws(() => writeQualificationOnce(root, second), /receipt digest does not match/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
