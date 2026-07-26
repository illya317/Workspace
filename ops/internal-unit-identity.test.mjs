import assert from "node:assert/strict";
import { createPrivateKey, createPublicKey, generateKeyPairSync } from "node:crypto";
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ensureInternalUnitIdentity,
  INTERNAL_UNIT_IDENTITY_PENDING_KIND,
  INTERNAL_UNIT_IDENTITY_REGISTRY_KIND,
} from "./internal-unit-identity.mjs";

function mode(file) {
  return lstatSync(file).mode & 0o777;
}

test("per-unit Ed25519 identity is private, atomic, and stable across deployments", () => {
  const root = path.join(mkdtempSync(path.join(os.tmpdir(), "workspace-internal-unit-identity-")), "identities");
  const first = ensureInternalUnitIdentity({ root, unitId: "finance" });
  assert.equal(first.privateKeyCreated, true);
  assert.equal(first.registryChanged, true);
  assert.equal(mode(root), 0o700);
  assert.equal(mode(path.join(root, "private")), 0o700);
  assert.equal(mode(path.join(root, "replay", "finance")), 0o700);
  assert.equal(mode(first.privateKeyFile), 0o600);
  assert.equal(mode(first.trustedPublicKeysFile), 0o600);

  const privatePem = readFileSync(first.privateKeyFile, "utf8");
  assert.equal(createPrivateKey(privatePem).asymmetricKeyType, "ed25519");
  const registryText = readFileSync(first.trustedPublicKeysFile, "utf8");
  const registry = JSON.parse(registryText);
  assert.equal(registry.schemaVersion, 1);
  assert.equal(registry.kind, INTERNAL_UNIT_IDENTITY_REGISTRY_KIND);
  assert.deepEqual(Object.keys(registry.keys), ["finance"]);
  assert.equal(createPublicKey(registry.keys.finance).asymmetricKeyType, "ed25519");
  assert.doesNotMatch(registryText, /PRIVATE KEY/);
  assert.equal(readdirSync(path.join(root, "private")).some((name) => name.endsWith(".tmp")), false);

  const repeated = ensureInternalUnitIdentity({ root, unitId: "finance" });
  assert.equal(repeated.privateKeyCreated, false);
  assert.equal(repeated.registryChanged, false);
  assert.equal(readFileSync(repeated.privateKeyFile, "utf8"), privatePem);
  assert.equal(readFileSync(repeated.trustedPublicKeysFile, "utf8"), registryText);

  const work = ensureInternalUnitIdentity({ root, unitId: "work" });
  assert.equal(work.privateKeyCreated, true);
  const expandedRegistry = JSON.parse(readFileSync(work.trustedPublicKeysFile, "utf8"));
  assert.deepEqual(Object.keys(expandedRegistry.keys), ["finance", "work"]);
  assert.equal(expandedRegistry.keys.finance, registry.keys.finance);
  assert.notEqual(expandedRegistry.keys.work, registry.keys.finance);
});

test("registered identity cannot be silently replaced or regenerated", () => {
  const root = path.join(mkdtempSync(path.join(os.tmpdir(), "workspace-internal-unit-drift-")), "identities");
  const identity = ensureInternalUnitIdentity({ root, unitId: "finance" });
  const registry = JSON.parse(readFileSync(identity.trustedPublicKeysFile, "utf8"));
  const replacement = generateKeyPairSync("ed25519").publicKey.export({ format: "pem", type: "spki" }).toString();
  registry.keys.finance = replacement;
  writeFileSync(identity.trustedPublicKeysFile, `${JSON.stringify(registry, null, 2)}\n`, { mode: 0o600 });
  assert.throws(
    () => ensureInternalUnitIdentity({ root, unitId: "finance" }),
    /trusted public key for finance does not match its private key/,
  );

  const missingRoot = path.join(mkdtempSync(path.join(os.tmpdir(), "workspace-internal-unit-missing-")), "identities");
  const missing = ensureInternalUnitIdentity({ root: missingRoot, unitId: "finance" });
  unlinkSync(missing.privateKeyFile);
  assert.throws(
    () => ensureInternalUnitIdentity({ root: missingRoot, unitId: "finance" }),
    /private key for finance is missing while its trusted public key is registered/,
  );
});

test("identity recovery rejects a missing or partial fleet registry", () => {
  const missingRegistryRoot = path.join(mkdtempSync(path.join(os.tmpdir(), "workspace-internal-unit-registry-missing-")), "identities");
  const finance = ensureInternalUnitIdentity({ root: missingRegistryRoot, unitId: "finance" });
  ensureInternalUnitIdentity({ root: missingRegistryRoot, unitId: "work" });
  unlinkSync(finance.trustedPublicKeysFile);
  assert.throws(
    () => ensureInternalUnitIdentity({ root: missingRegistryRoot, unitId: "finance" }),
    /registry is missing while private identities already exist/,
  );

  const partialRegistryRoot = path.join(mkdtempSync(path.join(os.tmpdir(), "workspace-internal-unit-registry-partial-")), "identities");
  const partialFinance = ensureInternalUnitIdentity({ root: partialRegistryRoot, unitId: "finance" });
  ensureInternalUnitIdentity({ root: partialRegistryRoot, unitId: "work" });
  const partialRegistry = JSON.parse(readFileSync(partialFinance.trustedPublicKeysFile, "utf8"));
  delete partialRegistry.keys.work;
  writeFileSync(partialFinance.trustedPublicKeysFile, `${JSON.stringify(partialRegistry, null, 2)}\n`, { mode: 0o600 });
  assert.throws(
    () => ensureInternalUnitIdentity({ root: partialRegistryRoot, unitId: "finance" }),
    /trusted public key for work is missing while its private identity exists/,
  );
});

test("identity provisioning resumes a journaled private key after interruption", () => {
  const root = path.join(mkdtempSync(path.join(os.tmpdir(), "workspace-internal-unit-pending-")), "identities");
  const finance = ensureInternalUnitIdentity({ root, unitId: "finance" });
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privatePem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const publicPem = publicKey.export({ format: "pem", type: "spki" }).toString();
  writeFileSync(path.join(root, "private", "work.pem"), privatePem, { mode: 0o600 });
  writeFileSync(path.join(root, "pending", "work.json"), `${JSON.stringify({
    schemaVersion: 1,
    kind: INTERNAL_UNIT_IDENTITY_PENDING_KIND,
    unitId: "work",
    publicKey: publicPem,
  }, null, 2)}\n`, { mode: 0o600 });

  assert.doesNotThrow(() => ensureInternalUnitIdentity({ root, unitId: "finance" }));
  const recoveredRegistry = JSON.parse(readFileSync(finance.trustedPublicKeysFile, "utf8"));
  assert.equal(recoveredRegistry.keys.work, publicPem);
  assert.equal(readdirSync(path.join(root, "pending")).length, 0);
  assert.equal(readFileSync(path.join(root, "private", "work.pem"), "utf8"), privatePem);
});

test("identity provisioning removes only its own interrupted atomic temporary files", () => {
  const root = path.join(mkdtempSync(path.join(os.tmpdir(), "workspace-internal-unit-temp-")), "identities");
  ensureInternalUnitIdentity({ root, unitId: "finance" });
  const interrupted = ".work.pem.123.11111111-1111-4111-8111-111111111111.tmp";
  writeFileSync(path.join(root, "private", interrupted), "partial", { mode: 0o600 });

  assert.doesNotThrow(() => ensureInternalUnitIdentity({ root, unitId: "finance" }));
  assert.equal(readdirSync(path.join(root, "private")).includes(interrupted), false);
});

test("identity root and unit id fail closed before filesystem writes", () => {
  assert.throws(
    () => ensureInternalUnitIdentity({ root: "relative/identity", unitId: "finance" }),
    /must be an absolute path/,
  );
  const root = path.join(mkdtempSync(path.join(os.tmpdir(), "workspace-internal-unit-invalid-")), "identities");
  assert.throws(
    () => ensureInternalUnitIdentity({ root, unitId: "Finance/../../other" }),
    /invalid deploy unit id/,
  );
});
