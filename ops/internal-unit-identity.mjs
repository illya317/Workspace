import {
  constants as fsConstants,
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomUUID,
} from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const INTERNAL_UNIT_IDENTITY_REGISTRY_KIND = "workspace-internal-trusted-public-keys";
export const INTERNAL_UNIT_IDENTITY_SCHEMA_VERSION = 1;
export const INTERNAL_UNIT_IDENTITY_PENDING_KIND = "workspace-internal-pending-unit-identity";

const UNIT_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

function fail(message) {
  throw new Error(message);
}

function assertAbsoluteRoot(root) {
  if (typeof root !== "string" || root.length === 0 || !path.isAbsolute(root)) {
    fail("internal unit identity root must be an absolute path");
  }
}

function assertUnitId(unitId) {
  if (typeof unitId !== "string" || !UNIT_ID_PATTERN.test(unitId)) {
    fail(`invalid deploy unit id: ${String(unitId)}`);
  }
}

function ensurePrivateDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    fail(`identity path must be a real directory: ${directory}`);
  }
  chmodSync(directory, 0o700);
}

function assertRegularFile(file, label) {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label} must be a regular file: ${file}`);
}

function fsyncDirectory(directory) {
  let descriptor;
  try {
    descriptor = openSync(directory, fsConstants.O_RDONLY);
    fsyncSync(descriptor);
  } catch (error) {
    if (error?.code !== "EINVAL" && error?.code !== "ENOTSUP") throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function writeExclusiveAtomic(file, content, mode) {
  const directory = path.dirname(file);
  const temporary = path.join(directory, `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`);
  let created = false;
  try {
    const descriptor = openSync(temporary, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY, mode);
    try {
      writeFileSync(descriptor, content, { encoding: "utf8" });
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    linkSync(temporary, file);
    created = true;
    fsyncDirectory(directory);
  } finally {
    if (existsSync(temporary)) {
      unlinkSync(temporary);
      fsyncDirectory(directory);
    }
  }
  if (!created) fail(`failed to create identity file atomically: ${file}`);
}

function writeReplacingAtomic(file, content, mode) {
  const directory = path.dirname(file);
  const temporary = path.join(directory, `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    const descriptor = openSync(temporary, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY, mode);
    try {
      writeFileSync(descriptor, content, { encoding: "utf8" });
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    renameSync(temporary, file);
    chmodSync(file, mode);
    fsyncDirectory(directory);
  } finally {
    if (existsSync(temporary)) {
      unlinkSync(temporary);
      fsyncDirectory(directory);
    }
  }
}

function unlinkDurably(file) {
  unlinkSync(file);
  fsyncDirectory(path.dirname(file));
}

function cleanupAtomicTemporaryFiles(directory, pattern) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!pattern.test(entry.name)) continue;
    if (!entry.isFile() || entry.isSymbolicLink()) {
      fail(`identity temporary path must be a regular file: ${path.join(directory, entry.name)}`);
    }
    unlinkDurably(path.join(directory, entry.name));
  }
}

function normalizePublicKey(value, label) {
  if (typeof value !== "string") fail(`${label} must be a PEM string`);
  let key;
  try {
    key = createPublicKey(value);
  } catch {
    fail(`${label} is not a valid public key`);
  }
  if (key.asymmetricKeyType !== "ed25519") fail(`${label} must be Ed25519`);
  return key.export({ format: "pem", type: "spki" }).toString();
}

function publicKeyFromPrivatePem(value, label) {
  let privateKey;
  try {
    privateKey = createPrivateKey(value);
  } catch {
    fail(`${label} is not a valid private key`);
  }
  if (privateKey.asymmetricKeyType !== "ed25519") fail(`${label} must be Ed25519`);
  return createPublicKey(privateKey).export({ format: "pem", type: "spki" }).toString();
}

function readTrustedRegistry(file) {
  if (!existsSync(file)) {
    return {
      schemaVersion: INTERNAL_UNIT_IDENTITY_SCHEMA_VERSION,
      kind: INTERNAL_UNIT_IDENTITY_REGISTRY_KIND,
      keys: {},
    };
  }
  assertRegularFile(file, "trusted public key registry");
  let value;
  try {
    value = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    fail(`trusted public key registry is not valid JSON: ${file}`);
  }
  if (
    value?.schemaVersion !== INTERNAL_UNIT_IDENTITY_SCHEMA_VERSION
    || value?.kind !== INTERNAL_UNIT_IDENTITY_REGISTRY_KIND
    || value?.keys === null
    || typeof value?.keys !== "object"
    || Array.isArray(value.keys)
  ) {
    fail(`trusted public key registry contract is invalid: ${file}`);
  }
  const keys = {};
  for (const [unitId, publicKey] of Object.entries(value.keys)) {
    assertUnitId(unitId);
    keys[unitId] = normalizePublicKey(publicKey, `trusted public key for ${unitId}`);
  }
  return {
    schemaVersion: INTERNAL_UNIT_IDENTITY_SCHEMA_VERSION,
    kind: INTERNAL_UNIT_IDENTITY_REGISTRY_KIND,
    keys,
  };
}

function canonicalRegistry(keys) {
  return `${JSON.stringify({
    schemaVersion: INTERNAL_UNIT_IDENTITY_SCHEMA_VERSION,
    kind: INTERNAL_UNIT_IDENTITY_REGISTRY_KIND,
    keys: Object.fromEntries(Object.entries(keys).sort(([left], [right]) => left.localeCompare(right))),
  }, null, 2)}\n`;
}

function canonicalPendingIdentity(unitId, publicKey) {
  return `${JSON.stringify({
    schemaVersion: INTERNAL_UNIT_IDENTITY_SCHEMA_VERSION,
    kind: INTERNAL_UNIT_IDENTITY_PENDING_KIND,
    unitId,
    publicKey,
  }, null, 2)}\n`;
}

function listPrivateUnitIds(privateRoot) {
  return readdirSync(privateRoot, { withFileTypes: true }).map((entry) => {
    const match = /^([a-z][a-z0-9-]*)\.pem$/.exec(entry.name);
    if (!entry.isFile() || entry.isSymbolicLink() || !match) {
      fail(`private identity directory contains an invalid entry: ${entry.name}`);
    }
    return match[1];
  }).sort();
}

function readPendingIdentities(pendingRoot) {
  return readdirSync(pendingRoot, { withFileTypes: true }).map((entry) => {
    const match = /^([a-z][a-z0-9-]*)\.json$/.exec(entry.name);
    if (!entry.isFile() || entry.isSymbolicLink() || !match) {
      fail(`pending identity directory contains an invalid entry: ${entry.name}`);
    }
    const unitId = match[1];
    const file = path.join(pendingRoot, entry.name);
    let value;
    try {
      value = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      fail(`pending identity is not valid JSON: ${file}`);
    }
    if (
      value?.schemaVersion !== INTERNAL_UNIT_IDENTITY_SCHEMA_VERSION
      || value?.kind !== INTERNAL_UNIT_IDENTITY_PENDING_KIND
      || value?.unitId !== unitId
    ) {
      fail(`pending identity contract is invalid: ${file}`);
    }
    return {
      file,
      unitId,
      publicKey: normalizePublicKey(value.publicKey, `pending public key for ${unitId}`),
    };
  }).sort((left, right) => left.unitId.localeCompare(right.unitId));
}

function recoverPendingIdentities({ pendingRoot, privateRoot, trustedPublicKeysFile }) {
  const pending = readPendingIdentities(pendingRoot);
  if (pending.length === 0) return;
  const registryExists = existsSync(trustedPublicKeysFile);
  const registry = readTrustedRegistry(trustedPublicKeysFile);
  const materialized = [];

  for (const item of pending) {
    const privateKeyFile = path.join(privateRoot, `${item.unitId}.pem`);
    if (!existsSync(privateKeyFile)) {
      if (registry.keys[item.unitId] !== undefined) {
        fail(`pending identity for ${item.unitId} has a trusted public key but no private key`);
      }
      unlinkDurably(item.file);
      continue;
    }
    assertRegularFile(privateKeyFile, `private key for pending ${item.unitId}`);
    const derivedPublicKey = publicKeyFromPrivatePem(
      readFileSync(privateKeyFile, "utf8"),
      `private key for pending ${item.unitId}`,
    );
    if (derivedPublicKey !== item.publicKey) {
      fail(`pending public key for ${item.unitId} does not match its private key`);
    }
    if (registry.keys[item.unitId] !== undefined && registry.keys[item.unitId] !== item.publicKey) {
      fail(`pending public key for ${item.unitId} does not match the trusted registry`);
    }
    materialized.push(item);
  }

  if (materialized.length === 0) return;
  if (!registryExists) {
    const pendingUnitIds = new Set(materialized.map((item) => item.unitId));
    const unprovenUnitId = listPrivateUnitIds(privateRoot).find((unitId) => !pendingUnitIds.has(unitId));
    if (unprovenUnitId) {
      fail(`trusted public key registry is missing and private identity ${unprovenUnitId} has no pending recovery record`);
    }
  }
  const recoveredKeys = { ...registry.keys };
  for (const item of materialized) recoveredKeys[item.unitId] = item.publicKey;
  writeReplacingAtomic(trustedPublicKeysFile, canonicalRegistry(recoveredKeys), 0o600);
  for (const item of materialized) unlinkDurably(item.file);
}

function createEd25519PrivatePem() {
  const { privateKey } = generateKeyPairSync("ed25519");
  return privateKey.export({ format: "pem", type: "pkcs8" }).toString();
}

export function ensureInternalUnitIdentity({ root, unitId }) {
  assertAbsoluteRoot(root);
  assertUnitId(unitId);
  const privateRoot = path.join(root, "private");
  const pendingRoot = path.join(root, "pending");
  const pendingIdentityFile = path.join(pendingRoot, `${unitId}.json`);
  const privateKeyFile = path.join(privateRoot, `${unitId}.pem`);
  const trustedPublicKeysFile = path.join(root, "trusted-public-keys.json");
  const replayDirectory = path.join(root, "replay", unitId);
  ensurePrivateDirectory(root);
  ensurePrivateDirectory(privateRoot);
  ensurePrivateDirectory(pendingRoot);
  cleanupAtomicTemporaryFiles(root, /^\.trusted-public-keys\.json\.\d+\.[0-9a-f-]{36}\.tmp$/);
  cleanupAtomicTemporaryFiles(privateRoot, /^\.[a-z][a-z0-9-]*\.pem\.\d+\.[0-9a-f-]{36}\.tmp$/);
  cleanupAtomicTemporaryFiles(pendingRoot, /^\.[a-z][a-z0-9-]*\.json\.\d+\.[0-9a-f-]{36}\.tmp$/);
  recoverPendingIdentities({ pendingRoot, privateRoot, trustedPublicKeysFile });

  const privateUnitIds = listPrivateUnitIds(privateRoot);
  if (!existsSync(trustedPublicKeysFile) && privateUnitIds.length > 0) {
    fail("trusted public key registry is missing while private identities already exist; restore the complete identity directory");
  }

  const registry = readTrustedRegistry(trustedPublicKeysFile);
  const registeredUnitIds = Object.keys(registry.keys).sort();
  const missingPrivateUnitId = registeredUnitIds.find((registeredUnitId) => !privateUnitIds.includes(registeredUnitId));
  if (missingPrivateUnitId) fail(`private key for ${missingPrivateUnitId} is missing while its trusted public key is registered`);
  const missingRegistrationUnitId = privateUnitIds.find((privateUnitId) => !registeredUnitIds.includes(privateUnitId));
  if (missingRegistrationUnitId) {
    fail(`trusted public key for ${missingRegistrationUnitId} is missing while its private identity exists; restore them from the same recovery point`);
  }
  for (const registeredUnitId of registeredUnitIds) {
    const registeredPrivateKeyFile = path.join(privateRoot, `${registeredUnitId}.pem`);
    assertRegularFile(registeredPrivateKeyFile, `private key for ${registeredUnitId}`);
    const derivedPublicKey = publicKeyFromPrivatePem(
      readFileSync(registeredPrivateKeyFile, "utf8"),
      `private key for ${registeredUnitId}`,
    );
    if (registry.keys[registeredUnitId] !== derivedPublicKey) {
      fail(`trusted public key for ${registeredUnitId} does not match its private key`);
    }
  }
  const registeredPublicKey = registry.keys[unitId];
  let privateKeyCreated = false;
  if (!existsSync(privateKeyFile)) {
    if (registeredPublicKey !== undefined) {
      fail(`private key for ${unitId} is missing while its trusted public key is registered`);
    }
    const privateKeyPem = createEd25519PrivatePem();
    const pendingPublicKey = publicKeyFromPrivatePem(privateKeyPem, `new private key for ${unitId}`);
    writeExclusiveAtomic(
      pendingIdentityFile,
      canonicalPendingIdentity(unitId, pendingPublicKey),
      0o600,
    );
    writeExclusiveAtomic(privateKeyFile, privateKeyPem, 0o600);
    privateKeyCreated = true;
  }
  assertRegularFile(privateKeyFile, `private key for ${unitId}`);
  chmodSync(privateKeyFile, 0o600);
  const publicKey = publicKeyFromPrivatePem(readFileSync(privateKeyFile, "utf8"), `private key for ${unitId}`);
  if (registeredPublicKey !== undefined && registeredPublicKey !== publicKey) {
    fail(`trusted public key for ${unitId} does not match its private key`);
  }

  const registryChanged = registeredPublicKey === undefined;
  if (registryChanged) {
    writeReplacingAtomic(
      trustedPublicKeysFile,
      canonicalRegistry({ ...registry.keys, [unitId]: publicKey }),
      0o600,
    );
  } else {
    chmodSync(trustedPublicKeysFile, 0o600);
  }
  if (existsSync(pendingIdentityFile)) unlinkDurably(pendingIdentityFile);
  ensurePrivateDirectory(path.dirname(replayDirectory));
  ensurePrivateDirectory(replayDirectory);

  return {
    schemaVersion: 1,
    kind: "workspace-internal-deploy-unit-identity",
    unitId,
    privateKeyFile,
    replayDirectory,
    trustedPublicKeysFile,
    publicKeyFingerprintSha256: createHash("sha256").update(publicKey).digest("hex"),
    privateKeyCreated,
    registryChanged,
  };
}

function option(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1 || index === argv.length - 1) fail(`missing ${name}`);
  return argv[index + 1];
}

function main(argv) {
  const [command] = argv;
  if (command !== "ensure") {
    fail("usage: internal-unit-identity.mjs ensure --root ABSOLUTE_PATH --unit UNIT_ID");
  }
  const result = ensureInternalUnitIdentity({ root: option(argv, "--root"), unitId: option(argv, "--unit") });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`[internal-unit-identity] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
