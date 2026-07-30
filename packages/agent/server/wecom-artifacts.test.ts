import assert from "node:assert/strict";
import test from "node:test";

import {
  createWecomAgentFileArtifact,
  createWecomArtifactToken,
  verifyWecomArtifactToken,
  WECOM_ARTIFACT_TOKEN_TTL_MS,
  WECOM_DIRECT_FILE_MAX_BYTES,
} from "@workspace/platform/server/wecom-artifacts";

const artifactId = "3a712c7d-a1a0-4a1a-94d9-c966f7e37f0e";
process.env.NEXTAUTH_SECRET = "wecom-artifact-test-secret";
process.env.NEXT_PUBLIC_BASE_PATH = "/workspace";

test("artifact tokens bind the export, user, and expiry", () => {
  const now = 1_800_000_000_000;
  const created = createWecomArtifactToken({ source: "library-version", artifactId, userId: 42 }, now);

  assert.deepEqual(verifyWecomArtifactToken(created.token, now + 1), created.claims);
  assert.equal(created.claims.expiresAt, now + WECOM_ARTIFACT_TOKEN_TTL_MS);
  assert.equal(verifyWecomArtifactToken(created.token, created.claims.expiresAt + 1), null);
  assert.equal(verifyWecomArtifactToken(`${created.token.slice(0, -1)}0`, now + 1), null);
});

test("file artifacts expose only opaque controlled routes", () => {
  const artifact = createWecomAgentFileArtifact({
    source: "library-export",
    artifactId,
    userId: 42,
    fileName: "资料库.zip",
    fileSizeBytes: 1024,
    itemCount: 4,
  });

  assert.equal(artifact.kind, "file");
  assert.equal(artifact.source, "library-export");
  assert.equal(artifact.directSendMaxBytes, WECOM_DIRECT_FILE_MAX_BYTES);
  assert.match(artifact.workerPath, /^\/workspace\/api\/integrations\/wecom\/agent\/artifacts\//);
  assert.match(artifact.downloadPath, /^\/workspace\/api\/integrations\/wecom\/download\//);
  assert.ok(!JSON.stringify(artifact).includes("/home/"));
});
