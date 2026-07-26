import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { mock, type TestContext } from "node:test";

mock.module("server-only", { namedExports: {} } as never);

const {
  assertDeployUnitInternalIdentity,
  authenticateWorkspaceInternalRequest,
  consumeWorkspaceInternalRequestPrincipal,
  createWorkspaceInternalIdentityHeaders,
} = await import("./internal-unit-identity");

const identityEnvironmentKeys = [
  "WORKSPACE_DEPLOY_UNIT_ID",
  "WORKSPACE_INTERNAL_SERVICE_SECRET",
  "WORKSPACE_INTERNAL_SIGNING_PRIVATE_KEY_FILE",
  "WORKSPACE_INTERNAL_TRUSTED_PUBLIC_KEYS_FILE",
  "WORKSPACE_INTERNAL_REPLAY_DIRECTORY",
] as const;

function identityFixture() {
  const directory = mkdtempSync(path.join(tmpdir(), "workspace-internal-identity-"));
  const units = Object.fromEntries(["assistant", "finance", "hr", "inventory"].map((unitId) => {
    const pair = generateKeyPairSync("ed25519");
    const privateKeyFile = path.join(directory, `${unitId}.pem`);
    writeFileSync(privateKeyFile, pair.privateKey.export({ type: "pkcs8", format: "pem" }));
    return [unitId, {
      privateKeyFile,
      publicKeyPem: String(pair.publicKey.export({ type: "spki", format: "pem" })),
    }];
  })) as Record<string, { privateKeyFile: string; publicKeyPem: string }>;
  const registryFile = path.join(directory, "trusted-public-keys.json");
  writeFileSync(registryFile, JSON.stringify({
    schemaVersion: 1,
    kind: "workspace-internal-trusted-public-keys",
    keys: Object.fromEntries(Object.entries(units).map(([unitId, value]) => [unitId, value.publicKeyPem])),
  }));
  return { directory, registryFile, units };
}

function preserveIdentityEnvironment(t: TestContext) {
  const previous = Object.fromEntries(identityEnvironmentKeys.map((key) => [key, process.env[key]]));
  t.after(() => {
    for (const key of identityEnvironmentKeys) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

function useDeployIdentity(
  fixture: ReturnType<typeof identityFixture>,
  unitId: string,
  privateKeyUnitId = unitId,
) {
  process.env.WORKSPACE_DEPLOY_UNIT_ID = unitId;
  process.env.WORKSPACE_INTERNAL_SIGNING_PRIVATE_KEY_FILE = fixture.units[privateKeyUnitId]!.privateKeyFile;
  process.env.WORKSPACE_INTERNAL_TRUSTED_PUBLIC_KEYS_FILE = fixture.registryFile;
  process.env.WORKSPACE_INTERNAL_REPLAY_DIRECTORY = path.join(fixture.directory, "replay", unitId);
  mkdirSync(process.env.WORKSPACE_INTERNAL_REPLAY_DIRECTORY, { recursive: true, mode: 0o700 });
}

function signedRequest(input: {
  audienceUnitId: string;
  body?: string;
  callerUnitId: string;
  url?: string;
}) {
  const body = input.body ?? JSON.stringify({ targetId: 12 });
  const url = new URL(input.url ?? "http://127.0.0.1/workspace/api/modules/hr/internal/test?mode=read");
  const headers = createWorkspaceInternalIdentityHeaders({
    audienceUnitId: input.audienceUnitId,
    body,
    callerUnitId: input.callerUnitId,
    method: "POST",
    pathname: url.pathname,
    search: url.search,
  });
  return { body, headers, url };
}

test("deploy-unit identity authenticates Finance only with its own Ed25519 key", (t) => {
  preserveIdentityEnvironment(t);
  const fixture = identityFixture();
  t.after(() => rmSync(fixture.directory, { recursive: true, force: true }));
  useDeployIdentity(fixture, "finance");
  const signed = signedRequest({ audienceUnitId: "hr", callerUnitId: "finance" });

  useDeployIdentity(fixture, "hr");
  const principal = authenticateWorkspaceInternalRequest({
    audienceUnitId: "hr",
    body: signed.body,
    maxClockSkewMs: 60_000,
    request: new Request(signed.url, { method: "POST", headers: signed.headers, body: signed.body }),
  });

  assert.equal(principal?.callerUnitId, "finance");
  assert.equal(principal?.audienceUnitId, "hr");
});

test("a bound deploy unit cannot sign as another caller", (t) => {
  preserveIdentityEnvironment(t);
  const fixture = identityFixture();
  t.after(() => rmSync(fixture.directory, { recursive: true, force: true }));
  useDeployIdentity(fixture, "assistant");

  assert.throws(
    () => signedRequest({ audienceUnitId: "hr", callerUnitId: "finance" }),
    /cannot sign as finance/,
  );
});

test("deploy-unit receivers reject monolith HMAC even when the shared secret is known", (t) => {
  preserveIdentityEnvironment(t);
  const fixture = identityFixture();
  t.after(() => rmSync(fixture.directory, { recursive: true, force: true }));
  delete process.env.WORKSPACE_DEPLOY_UNIT_ID;
  delete process.env.WORKSPACE_INTERNAL_SIGNING_PRIVATE_KEY_FILE;
  delete process.env.WORKSPACE_INTERNAL_TRUSTED_PUBLIC_KEYS_FILE;
  process.env.WORKSPACE_INTERNAL_SERVICE_SECRET = "known-shared-secret";
  const signed = signedRequest({ audienceUnitId: "hr", callerUnitId: "finance" });

  useDeployIdentity(fixture, "hr");
  assert.equal(authenticateWorkspaceInternalRequest({
    audienceUnitId: "hr",
    body: signed.body,
    maxClockSkewMs: 60_000,
    request: new Request(signed.url, { method: "POST", headers: signed.headers, body: signed.body }),
  }), null);
});

test("an Ed25519 request cannot be replayed to another audience", (t) => {
  preserveIdentityEnvironment(t);
  const fixture = identityFixture();
  t.after(() => rmSync(fixture.directory, { recursive: true, force: true }));
  useDeployIdentity(fixture, "finance");
  const signed = signedRequest({ audienceUnitId: "hr", callerUnitId: "finance" });

  useDeployIdentity(fixture, "inventory");
  assert.equal(authenticateWorkspaceInternalRequest({
    audienceUnitId: "inventory",
    body: signed.body,
    maxClockSkewMs: 60_000,
    request: new Request(signed.url, { method: "POST", headers: signed.headers, body: signed.body }),
  }), null);
});

test("a deployed receiver consumes each signed request id exactly once", (t) => {
  preserveIdentityEnvironment(t);
  const fixture = identityFixture();
  t.after(() => rmSync(fixture.directory, { recursive: true, force: true }));
  useDeployIdentity(fixture, "finance");
  const signed = signedRequest({ audienceUnitId: "hr", callerUnitId: "finance" });

  useDeployIdentity(fixture, "hr");
  const principal = authenticateWorkspaceInternalRequest({
    audienceUnitId: "hr",
    body: signed.body,
    maxClockSkewMs: 60_000,
    request: new Request(signed.url, { method: "POST", headers: signed.headers, body: signed.body }),
  });
  assert.ok(principal);
  assert.equal(consumeWorkspaceInternalRequestPrincipal(principal), true);
  assert.equal(consumeWorkspaceInternalRequestPrincipal(principal), false);
});

test("Ed25519 authentication rejects tampered request facts and unknown keys", (t) => {
  preserveIdentityEnvironment(t);
  const fixture = identityFixture();
  t.after(() => rmSync(fixture.directory, { recursive: true, force: true }));
  useDeployIdentity(fixture, "finance");
  const signed = signedRequest({ audienceUnitId: "hr", callerUnitId: "finance" });
  useDeployIdentity(fixture, "hr");
  const authenticate = (request: Request, body = signed.body) => authenticateWorkspaceInternalRequest({
    audienceUnitId: "hr",
    body,
    maxClockSkewMs: 60_000,
    request,
  });
  const request = (url = signed.url, method = "POST", headers: HeadersInit = signed.headers) => new Request(
    url,
    { method, headers, body: signed.body },
  );

  assert.equal(authenticate(request(), `${signed.body} `), null);
  assert.equal(authenticate(request(signed.url, "PUT")), null);
  assert.equal(authenticate(request(new URL("/workspace/api/modules/hr/internal/other?mode=read", signed.url))), null);
  assert.equal(authenticate(request(new URL("?mode=write", signed.url))), null);
  for (const [header, value] of [
    ["x-workspace-internal-caller", "assistant"],
    ["x-workspace-internal-key-id", `sha256:${"0".repeat(64)}`],
    ["x-workspace-internal-request-id", "00000000-0000-4000-8000-000000000000"],
  ]) {
    const tampered = new Headers(signed.headers);
    tampered.set(header, value);
    assert.equal(authenticate(request(signed.url, "POST", tampered)), null, header);
  }
});

test("receivers observe an updated trusted-key registry without restart", (t) => {
  preserveIdentityEnvironment(t);
  const fixture = identityFixture();
  t.after(() => rmSync(fixture.directory, { recursive: true, force: true }));
  const registry = JSON.parse(readFileSync(fixture.registryFile, "utf8")) as {
    keys: Record<string, string>;
  };
  const assistantPublicKey = registry.keys.assistant!;
  delete registry.keys.assistant;
  writeFileSync(fixture.registryFile, JSON.stringify({
    schemaVersion: 1,
    kind: "workspace-internal-trusted-public-keys",
    keys: registry.keys,
  }));
  useDeployIdentity(fixture, "assistant");
  const signed = signedRequest({ audienceUnitId: "hr", callerUnitId: "assistant" });
  useDeployIdentity(fixture, "hr");
  const request = new Request(signed.url, { method: "POST", headers: signed.headers, body: signed.body });
  const authenticate = () => authenticateWorkspaceInternalRequest({
    audienceUnitId: "hr",
    body: signed.body,
    maxClockSkewMs: 60_000,
    request,
  });
  assert.equal(authenticate(), null);

  registry.keys.assistant = assistantPublicKey;
  writeFileSync(fixture.registryFile, JSON.stringify({
    schemaVersion: 1,
    kind: "workspace-internal-trusted-public-keys",
    keys: registry.keys,
  }));
  assert.equal(authenticate()?.callerUnitId, "assistant");
});

test("deploy-unit startup binds generated id and matching private/public identity", (t) => {
  preserveIdentityEnvironment(t);
  const fixture = identityFixture();
  t.after(() => rmSync(fixture.directory, { recursive: true, force: true }));
  useDeployIdentity(fixture, "finance");
  assert.doesNotThrow(() => assertDeployUnitInternalIdentity("finance"));
  assert.throws(() => assertDeployUnitInternalIdentity("hr"), /must equal generated deploy unit id hr/);

  useDeployIdentity(fixture, "finance", "assistant");
  assert.throws(() => assertDeployUnitInternalIdentity("finance"), /private\/public identity mismatch/);
});
