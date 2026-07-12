import assert from "node:assert/strict";
import test from "node:test";

import {
  controlledFileFallback,
  fileArtifactsFromResult,
  formatFileSize,
  normalizeWecomReplyLinks,
} from "./wecom-agent-delivery.mjs";

const artifact = {
  kind: "file",
  source: "library-version",
  artifactId: "3a712c7d-a1a0-4a1a-94d9-c966f7e37f0e",
  fileName: "丰华生物财务报表-2025.12.xlsx",
  fileSizeBytes: 20_554,
  itemCount: 1,
  workerPath: "/workspace/api/integrations/wecom/agent/artifacts/id?token=test",
  downloadPath: "/workspace/api/integrations/wecom/download/id?token=test",
};

test("worker accepts only controlled artifact arrays", () => {
  assert.deepEqual(fileArtifactsFromResult({ artifacts: [artifact] }), [artifact]);
  assert.deepEqual(fileArtifactsFromResult({ artifact }), []);
  assert.deepEqual(fileArtifactsFromResult({ artifacts: [{ ...artifact, workerPath: "/untrusted" }] }), []);
});

test("relative Workspace links become absolute in WeCom or plain text without an origin", () => {
  const message = "[查看](/library/basic-info/documents/147)";
  assert.equal(
    normalizeWecomReplyLinks(message, "https://fh-bio.cn", "/workspace"),
    "[查看](https://fh-bio.cn/workspace/library/basic-info/documents/147)",
  );
  assert.equal(normalizeWecomReplyLinks(message, "", "/workspace"), "查看");
});

test("fallback describes the actual file and emits only an absolute controlled link", () => {
  const reply = controlledFileFallback([{ artifact, reason: "超过企业微信直传大小限制" }], "https://fh-bio.cn");
  assert.match(reply, /丰华生物财务报表-2025\.12\.xlsx/);
  assert.match(reply, /https:\/\/fh-bio\.cn\/workspace\/api\/integrations\/wecom\/download/);
  assert.doesNotMatch(reply, /\]\(\/workspace\//);
  assert.equal(formatFileSize(artifact.fileSizeBytes), "21 KiB");
});
