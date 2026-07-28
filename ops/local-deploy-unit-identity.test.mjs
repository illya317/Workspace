import assert from "node:assert/strict";
import { createPrivateKey, createPublicKey } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createLocalDeployUnitIdentity } from "./local-deploy-unit-identity.mjs";

test("local deploy unit identity creates a private key, matching registry, and replay directory", (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "workspace-unit-identity-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const identity = createLocalDeployUnitIdentity({ unitId: "hr", outputDirectory: directory });
  const privateKey = createPrivateKey(readFileSync(identity.privateKeyFile, "utf8"));
  const registry = JSON.parse(readFileSync(identity.trustedPublicKeysFile, "utf8"));
  const registeredKey = createPublicKey(registry.keys.hr);
  assert.equal(
    createPublicKey(privateKey).export({ type: "spki", format: "pem" }),
    registeredKey.export({ type: "spki", format: "pem" }),
  );
  assert.equal(statSync(identity.privateKeyFile).mode & 0o777, 0o600);
  assert.equal(statSync(identity.trustedPublicKeysFile).mode & 0o777, 0o600);
  assert.equal(statSync(identity.replayDirectory).mode & 0o777, 0o700);
});

test("local deploy unit identity rejects unsafe identity inputs", () => {
  assert.throws(
    () => createLocalDeployUnitIdentity({ unitId: "../hr", outputDirectory: "/tmp" }),
    /unit id is invalid/,
  );
  assert.throws(
    () => createLocalDeployUnitIdentity({ unitId: "hr", outputDirectory: "relative" }),
    /must be absolute/,
  );
});
