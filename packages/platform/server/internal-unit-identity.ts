import "server-only";

import {
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  randomUUID,
  sign as signPayload,
  timingSafeEqual,
  verify as verifyPayload,
  type KeyObject,
} from "node:crypto";
import {
  constants as fsConstants,
  closeSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const PROTOCOL_VERSION = "workspace-internal-rpc-v2";
const LEGACY_MONOLITH_KEY_ID = "hmac-sha256:workspace-monolith";
const UNIT_ID_PATTERN = /^[a-z][a-z0-9-]*$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;

export const WORKSPACE_INTERNAL_CALLER_HEADER = "x-workspace-internal-caller";
export const WORKSPACE_INTERNAL_AUDIENCE_HEADER = "x-workspace-internal-audience";
export const WORKSPACE_INTERNAL_KEY_ID_HEADER = "x-workspace-internal-key-id";
export const WORKSPACE_INTERNAL_REQUEST_ID_HEADER = "x-workspace-internal-request-id";
export const WORKSPACE_INTERNAL_TIMESTAMP_HEADER = "x-workspace-internal-timestamp";
export const WORKSPACE_INTERNAL_SIGNATURE_HEADER = "x-workspace-internal-signature";
export const WORKSPACE_INTERNAL_PROTOCOL_HEADER = "x-workspace-internal-protocol";

type TrustedPublicKeyRegistry = {
  schemaVersion: 1;
  kind: "workspace-internal-trusted-public-keys";
  keys: Record<string, string>;
};

export type WorkspaceInternalCallerPrincipal = {
  callerUnitId: string;
  audienceUnitId: string;
  keyId: string;
  requestId: string;
  replayExpiresAtMs: number;
};

type SignedRequestFacts = {
  audienceUnitId: string;
  body: string;
  callerUnitId: string;
  keyId: string;
  method: string;
  pathname: string;
  requestId: string;
  search: string;
  timestamp: string;
};

function requiredUnitId(value: string, label: string) {
  if (!UNIT_ID_PATTERN.test(value)) throw new Error(`${label} is invalid: ${value || "<missing>"}`);
  return value;
}

function optionalDeployUnitId() {
  const value = process.env.WORKSPACE_DEPLOY_UNIT_ID?.trim();
  return value ? requiredUnitId(value, "WORKSPACE_DEPLOY_UNIT_ID") : null;
}

function requiredFilePath(name: "WORKSPACE_INTERNAL_SIGNING_PRIVATE_KEY_FILE" | "WORKSPACE_INTERNAL_TRUSTED_PUBLIC_KEYS_FILE") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for deploy-unit internal RPC identity`);
  return value;
}

function requiredReplayDirectory() {
  const directory = process.env.WORKSPACE_INTERNAL_REPLAY_DIRECTORY?.trim();
  if (!directory || !path.isAbsolute(directory)) {
    throw new Error("WORKSPACE_INTERNAL_REPLAY_DIRECTORY must be an absolute path for deploy-unit internal RPC identity");
  }
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("WORKSPACE_INTERNAL_REPLAY_DIRECTORY must be a real directory");
  }
  return directory;
}

function legacyMonolithSecret() {
  const secret = process.env.WORKSPACE_INTERNAL_SERVICE_SECRET?.trim()
    || process.env.NEXTAUTH_SECRET?.trim();
  if (!secret) throw new Error("WORKSPACE_INTERNAL_SERVICE_SECRET or NEXTAUTH_SECRET is required for monolith internal RPC");
  return secret;
}

function publicKeyIdentity(key: KeyObject) {
  const publicKey = key.type === "public" ? key : createPublicKey(key);
  if (publicKey.asymmetricKeyType !== "ed25519") throw new Error("Workspace internal RPC key must be Ed25519");
  const der = publicKey.export({ type: "spki", format: "der" });
  return { publicKey, keyId: `sha256:${createHash("sha256").update(der).digest("hex")}` };
}

function readPrivateIdentity() {
  const privateKey = createPrivateKey(readFileSync(requiredFilePath("WORKSPACE_INTERNAL_SIGNING_PRIVATE_KEY_FILE"), "utf8"));
  if (privateKey.asymmetricKeyType !== "ed25519") throw new Error("Workspace internal RPC private key must be Ed25519");
  return { privateKey, ...publicKeyIdentity(privateKey) };
}

function parseTrustedRegistry(): TrustedPublicKeyRegistry {
  const file = requiredFilePath("WORKSPACE_INTERNAL_TRUSTED_PUBLIC_KEYS_FILE");
  const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<TrustedPublicKeyRegistry>;
  if (parsed.schemaVersion !== 1 || parsed.kind !== "workspace-internal-trusted-public-keys"
    || !parsed.keys || typeof parsed.keys !== "object" || Array.isArray(parsed.keys)) {
    throw new Error("Workspace internal RPC trusted public-key registry is invalid");
  }
  for (const [unitId, pem] of Object.entries(parsed.keys)) {
    requiredUnitId(unitId, "Trusted Workspace internal RPC unit id");
    if (typeof pem !== "string" || !pem.trim()) throw new Error(`Trusted Workspace internal RPC key is invalid: ${unitId}`);
  }
  return parsed as TrustedPublicKeyRegistry;
}

function trustedPublicIdentity(callerUnitId: string) {
  // Read on every authentication so a newly deployed caller becomes trusted
  // without restarting all already-running receiver units.
  const pem = parseTrustedRegistry().keys[callerUnitId];
  if (!pem) return null;
  return publicKeyIdentity(createPublicKey(pem));
}

function bodyDigest(body: string) {
  return createHash("sha256").update(body).digest("hex");
}

function canonicalInternalPathname(pathname: string) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() || "/workspace";
  if (basePath === "/") return pathname;
  return pathname === basePath
    ? "/"
    : pathname.startsWith(`${basePath}/`)
      ? pathname.slice(basePath.length)
      : pathname;
}

function signaturePayload(input: SignedRequestFacts) {
  return [
    PROTOCOL_VERSION,
    input.callerUnitId,
    input.audienceUnitId,
    input.keyId,
    input.timestamp,
    input.requestId,
    input.method.toUpperCase(),
    canonicalInternalPathname(input.pathname),
    input.search,
    bodyDigest(input.body),
  ].join("\n");
}

function safeEqualHex(left: string, right: string) {
  if (!DIGEST_PATTERN.test(left) || !DIGEST_PATTERN.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function validRequestId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
}

const monolithReplayClaims = new Map<string, number>();
let deployedClaimsSinceCleanup = 0;

function replayClaimDigest(principal: WorkspaceInternalCallerPrincipal) {
  return createHash("sha256").update([
    PROTOCOL_VERSION,
    principal.callerUnitId,
    principal.audienceUnitId,
    principal.keyId,
    principal.requestId,
  ].join("\n")).digest("hex");
}

function cleanupReplayDirectory(directory: string, now = Date.now()) {
  let changed = false;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const match = /^(\d+)-[0-9a-f]{64}\.claim$/.exec(entry.name);
    if (!entry.isFile() || entry.isSymbolicLink() || !match) {
      throw new Error(`Workspace internal RPC replay directory contains an invalid entry: ${entry.name}`);
    }
    if (Number(match[1]) > now) continue;
    try {
      unlinkSync(path.join(directory, entry.name));
      changed = true;
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException)?.code !== "ENOENT") throw cause;
    }
  }
  if (changed) fsyncReplayDirectory(directory);
}

function fsyncReplayDirectory(directory: string) {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(directory, fsConstants.O_RDONLY);
    fsyncSync(descriptor);
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException)?.code;
    if (code !== "EINVAL" && code !== "ENOTSUP") throw cause;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function consumeWorkspaceInternalRequestPrincipal(principal: WorkspaceInternalCallerPrincipal) {
  const now = Date.now();
  if (principal.replayExpiresAtMs <= now) return false;
  const digest = replayClaimDigest(principal);
  const configuredUnitId = optionalDeployUnitId();
  if (!configuredUnitId) {
    for (const [claim, expiresAt] of monolithReplayClaims) {
      if (expiresAt <= now) monolithReplayClaims.delete(claim);
    }
    if (monolithReplayClaims.has(digest)) return false;
    monolithReplayClaims.set(digest, principal.replayExpiresAtMs);
    return true;
  }
  if (principal.audienceUnitId !== configuredUnitId) return false;
  try {
    const directory = requiredReplayDirectory();
    deployedClaimsSinceCleanup += 1;
    if (deployedClaimsSinceCleanup === 1 || deployedClaimsSinceCleanup % 64 === 0) {
      cleanupReplayDirectory(directory, now);
    }
    const claimFile = path.join(directory, `${Math.trunc(principal.replayExpiresAtMs)}-${digest}.claim`);
    const descriptor = openSync(
      claimFile,
      fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
      0o600,
    );
    try {
      writeFileSync(descriptor, `${principal.requestId}\n`, { encoding: "utf8" });
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    fsyncReplayDirectory(directory);
    return true;
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException)?.code === "EEXIST") return false;
    return false;
  }
}

export function createWorkspaceInternalIdentityHeaders(input: {
  audienceUnitId: string;
  body: string;
  callerUnitId: string;
  method: string;
  pathname: string;
  search: string;
  requestId?: string;
  timestamp?: string;
}) {
  const configuredUnitId = optionalDeployUnitId();
  const callerUnitId = requiredUnitId(input.callerUnitId, "Workspace internal RPC caller");
  const audienceUnitId = requiredUnitId(input.audienceUnitId, "Workspace internal RPC audience");
  if (configuredUnitId && configuredUnitId !== callerUnitId) {
    throw new Error(`Deploy unit ${configuredUnitId} cannot sign as ${callerUnitId}`);
  }
  const requestId = input.requestId ?? randomUUID();
  if (!validRequestId(requestId)) throw new Error("Workspace internal RPC request id is invalid");
  const timestamp = input.timestamp ?? String(Date.now());
  let keyId: string;
  let signature: string;
  if (configuredUnitId) {
    const identity = readPrivateIdentity();
    keyId = identity.keyId;
    signature = signPayload(null, Buffer.from(signaturePayload({
      ...input,
      callerUnitId,
      audienceUnitId,
      keyId,
      requestId,
      timestamp,
    })), identity.privateKey).toString("base64");
  } else {
    keyId = LEGACY_MONOLITH_KEY_ID;
    signature = createHmac("sha256", legacyMonolithSecret()).update(signaturePayload({
      ...input,
      callerUnitId,
      audienceUnitId,
      keyId,
      requestId,
      timestamp,
    })).digest("hex");
  }
  return {
    [WORKSPACE_INTERNAL_PROTOCOL_HEADER]: PROTOCOL_VERSION,
    [WORKSPACE_INTERNAL_CALLER_HEADER]: callerUnitId,
    [WORKSPACE_INTERNAL_AUDIENCE_HEADER]: audienceUnitId,
    [WORKSPACE_INTERNAL_KEY_ID_HEADER]: keyId,
    [WORKSPACE_INTERNAL_REQUEST_ID_HEADER]: requestId,
    [WORKSPACE_INTERNAL_TIMESTAMP_HEADER]: timestamp,
    [WORKSPACE_INTERNAL_SIGNATURE_HEADER]: signature,
  };
}

export function authenticateWorkspaceInternalRequest(input: {
  audienceUnitId: string;
  body: string;
  maxClockSkewMs: number;
  request: Request;
}): WorkspaceInternalCallerPrincipal | null {
  try {
    const protocol = input.request.headers.get(WORKSPACE_INTERNAL_PROTOCOL_HEADER) ?? "";
    const callerUnitId = input.request.headers.get(WORKSPACE_INTERNAL_CALLER_HEADER) ?? "";
    const audienceUnitId = input.request.headers.get(WORKSPACE_INTERNAL_AUDIENCE_HEADER) ?? "";
    const keyId = input.request.headers.get(WORKSPACE_INTERNAL_KEY_ID_HEADER) ?? "";
    const requestId = input.request.headers.get(WORKSPACE_INTERNAL_REQUEST_ID_HEADER) ?? "";
    const timestamp = input.request.headers.get(WORKSPACE_INTERNAL_TIMESTAMP_HEADER) ?? "";
    const signature = input.request.headers.get(WORKSPACE_INTERNAL_SIGNATURE_HEADER) ?? "";
    if (protocol !== PROTOCOL_VERSION || !UNIT_ID_PATTERN.test(callerUnitId)
      || !UNIT_ID_PATTERN.test(audienceUnitId) || !validRequestId(requestId)) return null;
    const expectedAudience = requiredUnitId(input.audienceUnitId, "Workspace internal RPC expected audience");
    const configuredUnitId = optionalDeployUnitId();
    if (audienceUnitId !== expectedAudience || (configuredUnitId && configuredUnitId !== expectedAudience)) return null;
    const timestampMs = Number(timestamp);
    if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > input.maxClockSkewMs) return null;
    const url = new URL(input.request.url);
    const payload = signaturePayload({
      callerUnitId,
      audienceUnitId,
      keyId,
      requestId,
      timestamp,
      body: input.body,
      method: input.request.method,
      pathname: url.pathname,
      search: url.search,
    });
    if (configuredUnitId) {
      const identity = trustedPublicIdentity(callerUnitId);
      if (!identity || identity.keyId !== keyId) return null;
      const decoded = Buffer.from(signature, "base64");
      if (decoded.byteLength !== 64 || !verifyPayload(null, Buffer.from(payload), identity.publicKey, decoded)) return null;
    } else {
      if (keyId !== LEGACY_MONOLITH_KEY_ID) return null;
      const expected = createHmac("sha256", legacyMonolithSecret()).update(payload).digest("hex");
      if (!safeEqualHex(signature, expected)) return null;
    }
    return {
      callerUnitId,
      audienceUnitId,
      keyId,
      requestId,
      replayExpiresAtMs: timestampMs + input.maxClockSkewMs,
    };
  } catch {
    return null;
  }
}

export function assertDeployUnitInternalIdentity(unitId: string) {
  const expectedUnitId = requiredUnitId(unitId, "Generated deploy unit id");
  const configuredUnitId = optionalDeployUnitId();
  if (configuredUnitId !== expectedUnitId) {
    throw new Error(`WORKSPACE_DEPLOY_UNIT_ID must equal generated deploy unit id ${expectedUnitId}`);
  }
  const privateIdentity = readPrivateIdentity();
  const trustedIdentity = trustedPublicIdentity(expectedUnitId);
  if (!trustedIdentity || trustedIdentity.keyId !== privateIdentity.keyId) {
    throw new Error(`Workspace internal RPC private/public identity mismatch for ${expectedUnitId}`);
  }
  cleanupReplayDirectory(requiredReplayDirectory());
}
